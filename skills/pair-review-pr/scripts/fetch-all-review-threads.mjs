#!/usr/bin/env node
/**
 * Fetches ALL PR review threads (both resolved and unresolved) for duplicate detection.
 *
 * Usage: fetch-all-review-threads.mjs <owner> <repo> <pr_number>
 *
 * Output: JSON array of threads with structure:
 *   {
 *     thread_id: string,
 *     is_resolved: boolean,
 *     path: string,
 *     line: number | null,
 *     start_line: number | null,
 *     comments: [{ id, body, author: { login }, createdAt }]
 *   }
 */

import { spawn } from 'child_process';

const QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
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

async function fetchPage(owner, repo, prNumber, cursor) {
  const args = [
    'api', 'graphql',
    '-f', `query=${QUERY}`,
    '-f', `owner=${owner}`,
    '-f', `repo=${repo}`,
    '-F', `prNumber=${prNumber}`,
  ];

  if (cursor) {
    args.push('-f', `cursor=${cursor}`);
  } else {
    args.push('-f', 'cursor=');
  }

  const stdout = await runGh(args);
  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  return response.data.repository.pullRequest.reviewThreads;
}

function transformThread(thread) {
  return {
    thread_id: thread.id,
    is_resolved: thread.isResolved,
    path: thread.path,
    line: thread.line || thread.originalLine,
    start_line: thread.startLine || thread.originalStartLine,
    diff_side: thread.diffSide,
    subject_type: thread.subjectType,
    comments: thread.comments.nodes.map(c => ({
      id: c.id,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt,
    })),
  };
}

async function fetchAllThreads(owner, repo, prNumber) {
  const allThreads = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await fetchPage(owner, repo, prNumber, cursor);
    const threads = page.nodes.map(transformThread);
    allThreads.push(...threads);
    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return allThreads;
}

async function main() {
  const [owner, repo, prNumber] = process.argv.slice(2);

  if (!owner || !repo || !prNumber) {
    console.error('Usage: fetch-all-review-threads.mjs <owner> <repo> <pr_number>');
    console.error('');
    console.error('Fetches ALL review threads (resolved + unresolved) for duplicate detection.');
    process.exit(1);
  }

  try {
    const threads = await fetchAllThreads(owner, repo, parseInt(prNumber, 10));
    console.log(JSON.stringify(threads, null, 2));
  } catch (error) {
    console.error('Error fetching threads:', error.message);
    process.exit(1);
  }
}

main();