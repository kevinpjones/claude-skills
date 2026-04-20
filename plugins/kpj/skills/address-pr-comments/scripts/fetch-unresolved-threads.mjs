#!/usr/bin/env node
/**
 * Fetches unresolved PR review threads using GitHub GraphQL API.
 *
 * Usage: fetch-unresolved-threads.mjs <owner> <repo> <pr_number>
 *
 * Output: JSON array of unresolved threads with structure:
 *   {
 *     thread_id: string,
 *     code_context: { file, lines, type, line_start?, line_end?, line_number? },
 *     diff_side: "LEFT" | "RIGHT",
 *     comments: [{ id, body, author: { login }, createdAt }]
 *   }
 */

import { spawn } from 'child_process';

const QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
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
              replyTo {
                id
                author {
                  login
                }
                body
              }
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
  const threads = data?.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

  return threads
    .filter(thread => !thread.isResolved)
    .map(thread => ({
      thread_id: thread.id,
      code_context: getCodeContext(thread.path, thread.line, thread.startLine, thread.subjectType),
      diff_side: thread.diffSide,
      comments: thread.comments.nodes
    }));
}

async function fetchUnresolvedThreads(owner, repo, prNumber) {
  const stdout = await runGh([
    'api', 'graphql',
    '-f', `query=${QUERY}`,
    '-f', `owner=${owner}`,
    '-f', `repo=${repo}`,
    '-F', `prNumber=${prNumber}`
  ]);

  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  return transformThreads(response);
}

async function main() {
  const [owner, repo, prNumber] = process.argv.slice(2);

  if (!owner || !repo || !prNumber) {
    console.error('Usage: fetch-unresolved-threads.mjs <owner> <repo> <pr_number>');
    console.error('Example: fetch-unresolved-threads.mjs octocat hello-world 42');
    process.exit(1);
  }

  try {
    const threads = await fetchUnresolvedThreads(owner, repo, prNumber);
    console.log(JSON.stringify(threads, null, 2));
  } catch (error) {
    console.error('Error fetching threads:', error.message);
    process.exit(1);
  }
}

main();
