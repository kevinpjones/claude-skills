#!/usr/bin/env node
/**
 * Fetches unresolved PR review threads across all PRs in a stack.
 *
 * Usage: fetch-stack-pr-comments.mjs <owner> <repo> <pr_number> [pr_number...]
 *
 * Example: fetch-stack-pr-comments.mjs octocat hello-world 42 43 44
 *
 * Output: JSON object grouped by PR with unresolved threads:
 *   {
 *     total_unresolved: number,
 *     prs: [
 *       {
 *         pr_number: number,
 *         unresolved_count: number,
 *         threads: [{ thread_id, code_context, diff_side, comments }]
 *       }
 *     ]
 *   }
 */

import { spawn } from 'child_process';

const QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      number
      title
      headRefName
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          line
          originalLine
          path
          diffSide
          startLine
          originalStartLine
          subjectType
          comments(first: 100) {
            nodes {
              id
              body
              author {
                login
              }
              createdAt
              updatedAt
            }
          }
        }
      }
    }
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

function getCodeContext(path, line, startLine, subjectType) {
  if (!path) return null;

  if (subjectType === 'FILE') {
    return { file: path, type: 'file_level', description: 'Comment on entire file' };
  }

  if (startLine && line && startLine !== line) {
    return {
      file: path,
      lines: `lines ${startLine}-${line}`,
      type: 'line_range',
      line_start: startLine,
      line_end: line
    };
  }

  if (line) {
    return {
      file: path,
      lines: `line ${line}`,
      type: 'single_line',
      line_number: line
    };
  }

  return { file: path, type: 'file_level', description: 'Comment on file (no specific line)' };
}

function transformThreads(data) {
  const pr = data?.data?.repository?.pullRequest;
  if (!pr) return null;

  const threads = pr.reviewThreads?.nodes || [];
  const unresolvedThreads = threads
    .filter(thread => !thread.isResolved)
    .map(thread => ({
      thread_id: thread.id,
      code_context: getCodeContext(thread.path, thread.line, thread.startLine, thread.subjectType),
      diff_side: thread.diffSide,
      comments: thread.comments.nodes
    }));

  return {
    pr_number: pr.number,
    title: pr.title,
    branch: pr.headRefName,
    unresolved_count: unresolvedThreads.length,
    threads: unresolvedThreads
  };
}

async function fetchForPR(owner, repo, prNumber) {
  const stdout = await runGh([
    'api', 'graphql',
    '-f', `query=${QUERY}`,
    '-f', `owner=${owner}`,
    '-f', `repo=${repo}`,
    '-F', `prNumber=${prNumber}`
  ]);

  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors for PR #${prNumber}: ${JSON.stringify(response.errors)}`);
  }

  return transformThreads(response);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: fetch-stack-pr-comments.mjs <owner> <repo> <pr_number> [pr_number...]');
    console.log('');
    console.log('Fetches unresolved review threads across all PRs in a stack.');
    console.log('');
    console.log('Example: fetch-stack-pr-comments.mjs octocat hello-world 42 43 44');
    process.exit(args.length < 3 ? 1 : 0);
  }

  const owner = args[0];
  const repo = args[1];
  const prNumbers = args.slice(2).map(Number);

  try {
    const results = await Promise.all(
      prNumbers.map(pr => fetchForPR(owner, repo, pr))
    );

    const prs = results.filter(Boolean);
    const totalUnresolved = prs.reduce((sum, pr) => sum + pr.unresolved_count, 0);
    const prsWithComments = prs.filter(pr => pr.unresolved_count > 0);

    const output = {
      total_unresolved: totalUnresolved,
      prs,
      instructions: totalUnresolved === 0
        ? { summary: 'No unresolved review threads across the stack.' }
        : {
          summary: `${totalUnresolved} unresolved thread(s) across ${prsWithComments.length} PR(s).`,
          workflow: [
            '1. Process comments bottom-up (lowest branch in the stack first).',
            '2. For each branch: check out the branch, address the comments, and commit.',
            '3. After modifying a branch, rebase all branches above it (use the @{1} refspec technique).',
            '4. After all changes are committed, force push all affected branches: git push --force-with-lease origin <branches...>',
            '5. Reply to and resolve each thread using: ~/.claude/skills/address-pr-comments/scripts/respond-to-thread.js',
            '6. After force pushing, update any previously posted commit links: ~/.claude/skills/manage-stacked-pr/scripts/update-pr-comment-links.mjs',
          ],
          tip: 'Batch all comment replies and thread resolutions AFTER the final force push to avoid invalidating commit links.',
        },
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error('Error fetching PR comments:', error.message);
    process.exit(1);
  }
}

main();
