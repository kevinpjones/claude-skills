#!/usr/bin/env node
/**
 * Finds or creates a pending PR review for the current user.
 *
 * Usage: manage-pending-review.mjs <owner> <repo> <pr_number> [--create] [--comments]
 *
 * Options:
 *   --create    Create a new pending review if none exists
 *   --comments  Include the pending review's comments (id, path, lines, body, diff hunk)
 *   --help      Show usage
 *
 * Output: JSON with review details:
 *   {
 *     review_id: string (GraphQL node ID),
 *     rest_id: number (REST API ID),
 *     state: "PENDING",
 *     user: string,
 *     created: boolean (true if this invocation created the review),
 *     pr_url: string,
 *     existing_comments: number,
 *     comments?: [{ id, path, line, start_line, original_line, body, diff_hunk }]
 *   }
 *
 * If no pending review exists and --create is not set, exits with code 2 and
 * outputs: { "review_id": null, "message": "No pending review found" }
 */

import { spawn } from 'child_process';

const FIND_PENDING_REVIEW_QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      id
      url
      reviews(first: 20, states: PENDING) {
        nodes {
          id
          databaseId
          state
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

const PENDING_COMMENTS_QUERY = `
query($reviewId: ID!, $cursor: String) {
  node(id: $reviewId) {
    ... on PullRequestReview {
      comments(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          path
          line
          startLine
          originalLine
          body
          diffHunk
        }
      }
    }
  }
}`;

const CREATE_REVIEW_MUTATION = `
mutation($pullRequestId: ID!) {
  addPullRequestReview(input: {
    pullRequestId: $pullRequestId
  }) {
    pullRequestReview {
      id
      databaseId
      state
      author {
        login
      }
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
  // Parse "Logged in to github.com account <username>"
  const match = stdout.match(/account\s+(\S+)/);
  if (match) return match[1];

  // Fallback: try gh api user
  const userStdout = await runGh(['api', 'user', '-q', '.login']);
  return userStdout.trim();
}

async function findPendingReview(owner, repo, prNumber) {
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

  // Find a pending review owned by the current user
  const myReview = pr.reviews.nodes.find(
    r => r.author?.login === currentUser
  );

  if (myReview) {
    return {
      pr_id: pr.id,
      pr_url: pr.url,
      created: false,
      review_id: myReview.id,
      rest_id: myReview.databaseId,
      state: myReview.state,
      user: myReview.author.login,
      existing_comments: myReview.comments.totalCount,
    };
  }

  return { pr_id: pr.id, pr_url: pr.url, review_id: null };
}

async function fetchPendingComments(reviewId) {
  const comments = [];
  let cursor = null;

  do {
    const args = [
      'api', 'graphql',
      '-f', `query=${PENDING_COMMENTS_QUERY}`,
      '-f', `reviewId=${reviewId}`,
    ];
    if (cursor) args.push('-f', `cursor=${cursor}`);

    const response = JSON.parse(await runGh(args));
    if (response.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
    }

    const page = response.data.node.comments;
    for (const c of page.nodes) {
      comments.push({
        id: c.id,
        path: c.path,
        line: c.line,
        start_line: c.startLine,
        original_line: c.originalLine,
        body: c.body,
        diff_hunk: c.diffHunk,
      });
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  return comments;
}

async function createReview(prId) {
  const stdout = await runGh([
    'api', 'graphql',
    '-f', `query=${CREATE_REVIEW_MUTATION}`,
    '-f', `pullRequestId=${prId}`,
  ]);

  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }

  const review = response.data.addPullRequestReview.pullRequestReview;
  return {
    review_id: review.id,
    rest_id: review.databaseId,
    state: review.state,
    user: review.author?.login,
    created: true,
    existing_comments: review.comments.totalCount,
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: manage-pending-review.mjs <owner> <repo> <pr_number> [--create] [--comments]

Options:
  --create    Create a new pending review if none exists
  --comments  Include the pending review's comments

Examples:
  manage-pending-review.mjs octocat repo 42
  manage-pending-review.mjs octocat repo 42 --create
  manage-pending-review.mjs octocat repo 42 --comments`);
    process.exit(0);
  }

  const positional = args.filter(a => !a.startsWith('-'));
  const shouldCreate = args.includes('--create');
  const includeComments = args.includes('--comments');

  if (positional.length < 3) {
    console.error('Error: owner, repo, and pr_number are required');
    process.exit(1);
  }

  const [owner, repo, prNumber] = positional;

  try {
    const found = await findPendingReview(owner, repo, parseInt(prNumber, 10));

    let review = null;
    if (found.review_id) {
      review = found;
    } else if (shouldCreate) {
      review = { pr_id: found.pr_id, pr_url: found.pr_url, ...(await createReview(found.pr_id)) };
    }

    if (review) {
      if (includeComments) {
        review.comments = await fetchPendingComments(review.review_id);
      }
      console.log(JSON.stringify(review, null, 2));
    } else {
      console.log(JSON.stringify({ review_id: null, message: 'No pending review found' }));
      process.exit(2);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
