#!/usr/bin/env node
/**
 * Adds a review comment to a PR using the addPullRequestReviewThread GraphQL mutation.
 *
 * Usage: add-review-comment.mjs <owner> <repo> <pr_number> [options]
 *
 * Options:
 *   --path <file>         File path for the comment (required)
 *   --line <number>       End line number in the diff
 *   --start-line <number> Start line number for multi-line comments
 *   --side <LEFT|RIGHT>   Which side of the diff (default: RIGHT)
 *   --body <text>         Comment body (reads from --body-file if not provided)
 *   --body-file <path>    Read comment body from a file (avoids shell escaping)
 *   --review-id <id>      Existing pending review ID (creates new review if omitted)
 *   --help                Show usage
 *
 * Output: JSON with the created thread details
 */

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';

const ADD_THREAD_MUTATION = `
mutation($pullRequestId: ID!, $body: String!, $path: String!, $line: Int!, $side: DiffSide, $startSide: DiffSide, $startLine: Int, $pullRequestReviewId: ID) {
  addPullRequestReviewThread(input: {
    pullRequestId: $pullRequestId
    body: $body
    path: $path
    line: $line
    side: $side
    startSide: $startSide
    startLine: $startLine
    pullRequestReviewId: $pullRequestReviewId
  }) {
    thread {
      id
      comments(first: 1) {
        nodes {
          id
          body
          path
          createdAt
        }
      }
    }
  }
}`;

const GET_PR_ID_QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      id
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

async function getPullRequestId(owner, repo, prNumber) {
  const stdout = await runGh([
    'api', 'graphql',
    '-f', `query=${GET_PR_ID_QUERY}`,
    '-f', `owner=${owner}`,
    '-f', `repo=${repo}`,
    '-F', `prNumber=${prNumber}`,
  ]);

  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  return response.data.repository.pullRequest.id;
}

async function addReviewThread(prId, body, path, line, side, startLine, reviewId) {
  const args = [
    'api', 'graphql',
    '-f', `query=${ADD_THREAD_MUTATION}`,
    '-f', `pullRequestId=${prId}`,
    '-f', `body=${body}`,
    '-f', `path=${path}`,
    '-F', `line=${line}`,
    '-f', `side=${side}`,
  ];

  if (startLine && startLine !== line) {
    args.push('-F', `startLine=${startLine}`);
    args.push('-f', `startSide=${side}`);
  } else {
    args.push('-f', 'startLine=');
    args.push('-f', 'startSide=');
  }

  if (reviewId) {
    args.push('-f', `pullRequestReviewId=${reviewId}`);
  } else {
    args.push('-f', 'pullRequestReviewId=');
  }

  const stdout = await runGh(args);
  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  return response.data.addPullRequestReviewThread.thread;
}

function parseArgs(args) {
  const result = {
    owner: null,
    repo: null,
    prNumber: null,
    path: null,
    line: null,
    startLine: null,
    side: 'RIGHT',
    body: null,
    bodyFile: null,
    reviewId: null,
  };

  // First three positional args
  const positional = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--path') {
      result.path = args[++i];
    } else if (arg === '--line') {
      result.line = parseInt(args[++i], 10);
    } else if (arg === '--start-line') {
      result.startLine = parseInt(args[++i], 10);
    } else if (arg === '--side') {
      result.side = args[++i];
    } else if (arg === '--body') {
      result.body = args[++i];
    } else if (arg === '--body-file') {
      result.bodyFile = args[++i];
    } else if (arg === '--review-id') {
      result.reviewId = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
    i++;
  }

  if (positional.length >= 3) {
    result.owner = positional[0];
    result.repo = positional[1];
    result.prNumber = parseInt(positional[2], 10);
  }

  return result;
}

function printUsage() {
  console.log(`Usage: add-review-comment.mjs <owner> <repo> <pr_number> [options]

Options:
  --path <file>         File path for the comment (required)
  --line <number>       End line number in the diff (required)
  --start-line <number> Start line for multi-line comments
  --side <LEFT|RIGHT>   Diff side (default: RIGHT)
  --body <text>         Comment body text
  --body-file <path>    Read comment body from file
  --review-id <id>      Pending review ID (creates new if omitted)

Examples:
  # Single line comment
  add-review-comment.mjs octocat repo 42 --path src/index.ts --line 15 --body "Consider using const here"

  # Multi-line comment with body from file
  add-review-comment.mjs octocat repo 42 --path src/index.ts --line 20 --start-line 15 --body-file /tmp/comment.md`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.owner || !opts.repo || !opts.prNumber) {
    console.error('Error: owner, repo, and pr_number are required\n');
    printUsage();
    process.exit(1);
  }

  if (!opts.path || !opts.line) {
    console.error('Error: --path and --line are required\n');
    printUsage();
    process.exit(1);
  }

  let body = opts.body;
  if (!body && opts.bodyFile) {
    body = await readFile(opts.bodyFile, 'utf-8');
  }

  if (!body) {
    console.error('Error: --body or --body-file is required\n');
    process.exit(1);
  }

  try {
    const prId = await getPullRequestId(opts.owner, opts.repo, opts.prNumber);
    const thread = await addReviewThread(
      prId, body, opts.path, opts.line, opts.side, opts.startLine, opts.reviewId
    );

    console.log(JSON.stringify(thread, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
