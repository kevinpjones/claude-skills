#!/usr/bin/env node
/**
 * Responds to a PR review thread by replying and/or resolving it.
 *
 * Usage:
 *   respond-to-thread.mjs [options] <thread_id>
 *
 * Options:
 *   --reply <body>         Add a reply with the given body text
 *   --reply-file <path>    Add a reply whose body is the contents of this file
 *                          (for long or multi-line text that is awkward to quote)
 *   --commit <args>        Add a "Resolved by [hash](link)" reply
 *                          Args: <short_hash> <full_hash> <owner> <repo> <pr_number>
 *                          With --reply or --reply-file, the link is appended to
 *                          that text as its last line, in one reply
 *   --resolve              Resolve/close the thread
 *
 * Examples:
 *   # Reply and resolve in one shot
 *   respond-to-thread.mjs --commit abc1234 abc1234def5678 owner repo 123 --resolve PRRT_xyz
 *
 *   # Just resolve without replying
 *   respond-to-thread.mjs --resolve PRRT_xyz
 *
 *   # Just reply without resolving
 *   respond-to-thread.mjs --reply "Thanks, fixed!" PRRT_xyz
 *
 *   # Custom reply and resolve
 *   respond-to-thread.mjs --reply "Done in latest commit" --resolve PRRT_xyz
 *
 *   # A written reply that ends with the commit link
 *   respond-to-thread.mjs --reply-file /tmp/reply.md --commit abc1234 abc1234def5678 owner repo 123 --resolve PRRT_xyz
 *
 * Output: JSON with results of each action performed
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const REPLY_MUTATION = `
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {
    pullRequestReviewThreadId: $threadId
    body: $body
  }) {
    comment {
      id
      url
      body
      createdAt
      author {
        login
      }
    }
  }
}`;

const RESOLVE_MUTATION = `
mutation($threadId: ID!) {
  resolveReviewThread(input: {
    threadId: $threadId
  }) {
    thread {
      id
      isResolved
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

async function replyToThread(threadId, body) {
  const stdout = await runGh([
    'api', 'graphql',
    '-f', `query=${REPLY_MUTATION}`,
    '-f', `threadId=${threadId}`,
    '-f', `body=${body}`
  ]);

  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  return response.data.addPullRequestReviewThreadReply.comment;
}

async function resolveThread(threadId) {
  const stdout = await runGh([
    'api', 'graphql',
    '-f', `query=${RESOLVE_MUTATION}`,
    '-f', `threadId=${threadId}`
  ]);

  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  return response.data.resolveReviewThread.thread;
}

function buildCommitReplyBody(shortHash, fullHash, owner, repo, prNumber) {
  const commitUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}/commits/${fullHash}`;
  return `Resolved by [${shortHash}](${commitUrl})`;
}

function parseArgs(args) {
  const result = {
    threadId: null,
    replyBody: null,
    resolve: false
  };
  let text = null;
  let commitLine = null;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--reply') {
      text = args[++i];
    } else if (arg === '--reply-file') {
      text = readFileSync(args[++i], 'utf8').trim();
    } else if (arg === '--commit') {
      // short_hash, full_hash, owner, repo, pr_number: as five arguments, or as one argument holding all
      // five separated by spaces, which is how a shell that does not split variables (zsh) passes them.
      let values = args[i + 1]?.trim().split(/\s+/) ?? [];
      if (values.length === 5) {
        i += 1;
      } else {
        values = args.slice(i + 1, i + 6);
        i += 5;
      }
      if (values.length !== 5 || values.some((value) => !value || value.startsWith('-'))) {
        throw new Error('--commit needs <short_hash> <full_hash> <owner> <repo> <pr_number>');
      }
      commitLine = buildCommitReplyBody(...values);
    } else if (arg === '--resolve') {
      result.resolve = true;
    } else if (!arg.startsWith('-')) {
      result.threadId = arg;
    }
    i++;
  }

  result.replyBody = [text, commitLine].filter(Boolean).join('\n\n') || null;
  return result;
}

function printUsage() {
  console.error(`Usage: respond-to-thread.mjs [options] <thread_id>

Options:
  --reply <body>         Add a reply with the given body text
  --reply-file <path>    Add a reply whose body is the contents of this file
  --commit <args>        Add a "Resolved by [hash](link)" reply
                         Args: <short_hash> <full_hash> <owner> <repo> <pr_number>
                         With --reply or --reply-file, the link is appended to that text
  --resolve              Resolve/close the thread

Examples:
  # Reply with commit link and resolve
  respond-to-thread.mjs --commit abc1234 abc1234def5678 owner repo 123 --resolve PRRT_xyz

  # Just resolve
  respond-to-thread.mjs --resolve PRRT_xyz

  # Just reply
  respond-to-thread.mjs --reply "Thanks, fixed!" PRRT_xyz`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  let parsed;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    console.error(`Error: ${error.message}\n`);
    printUsage();
    process.exit(1);
  }

  if (!parsed.threadId) {
    console.error('Error: thread_id is required\n');
    printUsage();
    process.exit(1);
  }

  if (!parsed.replyBody && !parsed.resolve) {
    console.error('Error: At least one of --reply, --reply-file, --commit, or --resolve is required\n');
    printUsage();
    process.exit(1);
  }

  const results = {};

  try {
    // Reply first if requested
    if (parsed.replyBody) {
      results.reply = await replyToThread(parsed.threadId, parsed.replyBody);
    }

    // Then resolve if requested
    if (parsed.resolve) {
      results.resolved = await resolveThread(parsed.threadId);
    }

    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
