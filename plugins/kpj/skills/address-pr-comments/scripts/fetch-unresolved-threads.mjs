#!/usr/bin/env node
/**
 * Fetches unresolved PR review threads using GitHub GraphQL API.
 *
 * Usage: fetch-unresolved-threads.mjs <owner> <repo> <pr_number> [options]
 *
 * Options:
 *   --author <login>     Only include threads whose first comment is by this
 *                        login. Repeatable. A trailing "[bot]" is ignored, so
 *                        "qodo-code-review[bot]" (REST form) and
 *                        "qodo-code-review" (GraphQL form) both match.
 *   --exclude-outdated   Skip threads GitHub marks as outdated (the commented
 *                        lines changed since the comment was made).
 *
 * Output: JSON array of unresolved threads with structure:
 *   {
 *     thread_id: string,
 *     is_outdated: boolean,
 *     code_context: { file, lines, type, line_start?, line_end?, line_number? },
 *     diff_side: "LEFT" | "RIGHT",
 *     comments: [{ id, body, author: { login }, createdAt }]
 *   }
 */

import { spawn } from 'child_process';

const QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      reviewThreads(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          isResolved
          isOutdated
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

function normalizeLogin(login) {
  return (login || '').toLowerCase().replace(/\[bot\]$/, '');
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

function transformThreads(threads, { authors, excludeOutdated }) {
  return threads
    .filter(thread => !thread.isResolved)
    .filter(thread => !(excludeOutdated && thread.isOutdated))
    .filter(thread => {
      if (authors.length === 0) return true;
      const opener = normalizeLogin(thread.comments.nodes[0]?.author?.login);
      return authors.includes(opener);
    })
    .map(thread => ({
      thread_id: thread.id,
      is_outdated: thread.isOutdated,
      code_context: getCodeContext(thread.path, thread.line, thread.startLine, thread.subjectType),
      diff_side: thread.diffSide,
      comments: thread.comments.nodes
    }));
}

async function fetchAllThreads(owner, repo, prNumber) {
  const threads = [];
  let after = null;

  do {
    const args = [
      'api', 'graphql',
      '-f', `query=${QUERY}`,
      '-f', `owner=${owner}`,
      '-f', `repo=${repo}`,
      '-F', `prNumber=${prNumber}`
    ];
    if (after) args.push('-f', `after=${after}`);

    const response = JSON.parse(await runGh(args));
    if (response.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
    }

    const page = response.data?.repository?.pullRequest?.reviewThreads;
    threads.push(...(page?.nodes || []));
    after = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  return threads;
}

function parseArgs(argv) {
  const positional = [];
  const authors = [];
  let excludeOutdated = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--author') {
      authors.push(normalizeLogin(argv[++i]));
    } else if (arg === '--exclude-outdated') {
      excludeOutdated = true;
    } else if (arg === '--help' || arg === '-h') {
      return { help: true };
    } else {
      positional.push(arg);
    }
  }

  const [owner, repo, prNumber] = positional;
  return { owner, repo, prNumber, authors, excludeOutdated };
}

function printUsage() {
  console.error('Usage: fetch-unresolved-threads.mjs <owner> <repo> <pr_number> [--author <login>]... [--exclude-outdated]');
  console.error('Example: fetch-unresolved-threads.mjs octocat hello-world 42 --author "qodo-code-review[bot]"');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  if (!opts.owner || !opts.repo || !opts.prNumber) {
    printUsage();
    process.exit(1);
  }

  try {
    const threads = await fetchAllThreads(opts.owner, opts.repo, opts.prNumber);
    console.log(JSON.stringify(transformThreads(threads, opts), null, 2));
  } catch (error) {
    console.error('Error fetching threads:', error.message);
    process.exit(1);
  }
}

main();
