#!/usr/bin/env node
/**
 * Submits a pending PR review via the submitPullRequestReview GraphQL mutation.
 *
 * Usage: submit-review.mjs <owner> <repo> <pr_number> [options]
 *
 * Options:
 *   --event <type>        APPROVE, COMMENT, or REQUEST_CHANGES (required)
 *   --body <text>         Review summary body text
 *   --body-file <path>    Read review body from a file (avoids shell escaping)
 *   --review-id <id>      Specific pending review ID (default: finds current user's pending review)
 *   --help                Show usage
 *
 * Output: JSON with the submitted review details (id, state, body, url)
 */

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';

const VALID_EVENTS = ['APPROVE', 'COMMENT', 'REQUEST_CHANGES'];

const FIND_PENDING_REVIEW_QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      id
      reviews(first: 20, states: PENDING) {
        nodes {
          id
          author {
            login
          }
          comments {
            totalCount
          }
        }
      }
    }
  }
}`;

const SUBMIT_REVIEW_MUTATION = `
mutation($reviewId: ID!, $event: PullRequestReviewEvent!, $body: String) {
  submitPullRequestReview(input: {
    pullRequestReviewId: $reviewId
    event: $event
    body: $body
  }) {
    pullRequestReview {
      id
      state
      body
      url
      comments {
        totalCount
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

async function getCurrentUser() {
  const stdout = await runGh(['auth', 'status', '--active', '-t']);
  const match = stdout.match(/account\s+(\S+)/);
  if (match) return match[1];

  const userStdout = await runGh(['api', 'user', '-q', '.login']);
  return userStdout.trim();
}

async function findPendingReviewId(owner, repo, prNumber) {
  const stdout = await runGh([
    'api', 'graphql',
    '-f', `query=${FIND_PENDING_REVIEW_QUERY}`,
    '-f', `owner=${owner}`,
    '-f', `repo=${repo}`,
    '-F', `prNumber=${prNumber}`,
  ]);

  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  const pr = response.data.repository.pullRequest;
  const currentUser = await getCurrentUser();

  const myReview = pr.reviews.nodes.find(
    r => r.author?.login === currentUser
  );

  if (!myReview) {
    throw new Error(`No pending review found for user "${currentUser}" on PR #${prNumber}`);
  }

  return myReview.id;
}

async function submitReview(reviewId, event, body) {
  const args = [
    'api', 'graphql',
    '-f', `query=${SUBMIT_REVIEW_MUTATION}`,
    '-f', `reviewId=${reviewId}`,
    '-f', `event=${event}`,
  ];

  if (body) {
    args.push('-f', `body=${body}`);
  }

  const stdout = await runGh(args);
  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  return response.data.submitPullRequestReview.pullRequestReview;
}

function parseArgs(args) {
  const result = {
    owner: null,
    repo: null,
    prNumber: null,
    event: null,
    body: null,
    bodyFile: null,
    reviewId: null,
  };

  const positional = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--event') {
      result.event = args[++i]?.toUpperCase();
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
  console.log(`Usage: submit-review.mjs <owner> <repo> <pr_number> [options]

Options:
  --event <type>        APPROVE, COMMENT, or REQUEST_CHANGES (required)
  --body <text>         Review summary body text
  --body-file <path>    Read review body from file
  --review-id <id>      Pending review ID (default: auto-detect)

Examples:
  # Approve with summary from file
  submit-review.mjs octocat repo 42 --event APPROVE --body-file /tmp/pr-review-summary.md

  # Comment-only review
  submit-review.mjs octocat repo 42 --event COMMENT --body "Looks good overall, minor suggestions inline."

  # Request changes
  submit-review.mjs octocat repo 42 --event REQUEST_CHANGES --body "Please address the inline comments."`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.owner || !opts.repo || !opts.prNumber) {
    console.error('Error: owner, repo, and pr_number are required\n');
    printUsage();
    process.exit(1);
  }

  if (!opts.event || !VALID_EVENTS.includes(opts.event)) {
    console.error(`Error: --event is required and must be one of: ${VALID_EVENTS.join(', ')}\n`);
    printUsage();
    process.exit(1);
  }

  let body = opts.body;
  if (!body && opts.bodyFile) {
    body = await readFile(opts.bodyFile, 'utf-8');
  }

  try {
    const reviewId = opts.reviewId || await findPendingReviewId(opts.owner, opts.repo, opts.prNumber);
    const review = await submitReview(reviewId, opts.event, body);

    console.log(JSON.stringify({
      id: review.id,
      state: review.state,
      body: review.body,
      url: review.url,
      comments: review.comments.totalCount,
    }, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
