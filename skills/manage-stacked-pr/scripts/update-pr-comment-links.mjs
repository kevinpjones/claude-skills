#!/usr/bin/env node
/**
 * Updates PR review comment links after force pushes invalidate commit hashes.
 *
 * Finds "Resolved by [hash](link)" comments and maps old commit hashes to new
 * ones by matching commit messages in the current branch history.
 *
 * Usage: update-pr-comment-links.mjs <owner> <repo> <pr_number>
 *
 * Options:
 *   --dry-run    Show what would be updated without making changes
 *
 * Output: JSON summary of updated comments
 */

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const RESOLVED_BY_PATTERN = /Resolved by \[([a-f0-9]+)\]\(https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/commits\/([a-f0-9]+)\)/g;

const COMMENTS_QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      headRefName
      reviewThreads(first: 100) {
        nodes {
          comments(first: 100) {
            nodes {
              id
              body
              author { login }
            }
          }
        }
      }
    }
  }
}`;

const UPDATE_MUTATION = `
mutation($id: ID!, $body: String!) {
  updatePullRequestReviewComment(input: {
    pullRequestReviewCommentId: $id
    body: $body
  }) {
    pullRequestReviewComment { id body }
  }
}`;

function runGh(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('gh', args, { stdio: ['inherit', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `gh exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function git(command) {
  const { stdout } = await execAsync(`git ${command}`);
  return stdout.trim();
}

async function buildCommitMap(branchName, maxCommits = 100) {
  // Build a map of commit message -> { short hash, full hash }
  const log = await git(
    `log ${branchName} --format=%H%x00%h%x00%s --max-count=${maxCommits}`
  );

  const map = new Map();
  for (const line of log.split('\n')) {
    if (!line.trim()) continue;
    const [fullHash, shortHash, subject] = line.split('\0');
    map.set(subject, { fullHash, shortHash });
  }
  return map;
}

async function getOldCommitSubject(fullHash) {
  try {
    // Try to get the commit message even for old/unreachable commits
    const subject = await git(`log -1 --format=%s ${fullHash}`);
    return subject;
  } catch {
    return null;
  }
}

async function fetchComments(owner, repo, prNumber) {
  const stdout = await runGh([
    'api', 'graphql',
    '-f', `query=${COMMENTS_QUERY}`,
    '-f', `owner=${owner}`,
    '-f', `repo=${repo}`,
    '-F', `prNumber=${prNumber}`
  ]);

  const response = JSON.parse(stdout);
  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  const pr = response.data.repository.pullRequest;
  const comments = [];

  for (const thread of pr.reviewThreads.nodes) {
    for (const comment of thread.comments.nodes) {
      if (RESOLVED_BY_PATTERN.test(comment.body)) {
        comments.push(comment);
      }
      // Reset lastIndex since we're reusing the regex
      RESOLVED_BY_PATTERN.lastIndex = 0;
    }
  }

  return { branch: pr.headRefName, comments };
}

async function updateComment(commentId, newBody) {
  const stdout = await runGh([
    'api', 'graphql',
    '-f', `query=${UPDATE_MUTATION}`,
    '-f', `id=${commentId}`,
    '-f', `body=${newBody}`
  ]);

  const response = JSON.parse(stdout);
  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  return response.data.updatePullRequestReviewComment.pullRequestReviewComment;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filteredArgs = args.filter(a => a !== '--dry-run');

  if (filteredArgs.length < 3 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: update-pr-comment-links.mjs <owner> <repo> <pr_number>');
    console.log('');
    console.log('Updates "Resolved by [hash](link)" comments after force push.');
    console.log('Maps old commit hashes to new ones by matching commit messages.');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run    Show what would be updated without making changes');
    process.exit(filteredArgs.length < 3 ? 1 : 0);
  }

  const [owner, repo, prNumber] = filteredArgs;

  try {
    // Fetch comments with "Resolved by" links
    const { branch, comments } = await fetchComments(owner, repo, parseInt(prNumber));

    if (comments.length === 0) {
      console.log('No "Resolved by" comments found on this PR.');
      process.exit(0);
    }

    console.log(`Found ${comments.length} comment(s) with commit links on branch ${branch}`);

    // Build commit map from current branch state
    const commitMap = await buildCommitMap(branch);

    const results = [];

    for (const comment of comments) {
      let newBody = comment.body;
      let updated = false;
      const matches = [...comment.body.matchAll(RESOLVED_BY_PATTERN)];

      for (const match of matches) {
        const [fullMatch, oldShort, linkOwner, linkRepo, linkPr, oldFull] = match;

        // Try to find the old commit's subject to map to new hash
        const subject = await getOldCommitSubject(oldFull);
        if (!subject) {
          results.push({
            comment_id: comment.id,
            status: 'skipped',
            reason: `Could not find commit ${oldShort} (may have been garbage collected)`
          });
          continue;
        }

        const newCommit = commitMap.get(subject);
        if (!newCommit) {
          results.push({
            comment_id: comment.id,
            status: 'skipped',
            reason: `No matching commit found for subject: "${subject}"`
          });
          continue;
        }

        if (newCommit.fullHash === oldFull) {
          results.push({
            comment_id: comment.id,
            status: 'unchanged',
            reason: 'Hash already matches current branch'
          });
          continue;
        }

        const newLink = `Resolved by [${newCommit.shortHash}](https://github.com/${linkOwner}/${linkRepo}/pull/${linkPr}/commits/${newCommit.fullHash})`;
        newBody = newBody.replace(fullMatch, newLink);
        updated = true;

        results.push({
          comment_id: comment.id,
          status: dryRun ? 'would_update' : 'updated',
          old_hash: oldShort,
          new_hash: newCommit.shortHash,
          subject
        });
      }

      if (updated && !dryRun) {
        await updateComment(comment.id, newBody);
      }
    }

    const updated = results.filter(r => r.status === 'updated' || r.status === 'would_update').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const unchanged = results.filter(r => r.status === 'unchanged').length;

    console.log(JSON.stringify({
      dry_run: dryRun,
      results,
      instructions: {
        summary: `${updated} comment(s) ${dryRun ? 'would be ' : ''}updated, ${skipped} skipped, ${unchanged} unchanged.`,
        tip: 'If this PR is part of a stack, run this script for each PR that had comment replies with commit links.',
      },
    }, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
