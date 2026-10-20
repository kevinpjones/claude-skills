#!/usr/bin/env node
/**
 * Updates or deletes a comment on the current user's pending PR review.
 *
 * Usage: update-review-comment.mjs --id <comment_node_id> (--body-file <path> | --body <text> | --delete)
 *
 * Options:
 *   --id <id>           Review comment GraphQL node ID (PRRC_...), from manage-pending-review.mjs --comments
 *   --body <text>       Replacement comment body
 *   --body-file <path>  Read the replacement body from a file (avoids shell escaping)
 *   --delete            Delete the comment instead of updating it
 *   --help              Show usage
 *
 * Output: JSON { id, action: "updated" | "deleted" }
 */

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';

const UPDATE_MUTATION = `
mutation($id: ID!, $body: String!) {
  updatePullRequestReviewComment(input: { pullRequestReviewCommentId: $id, body: $body }) {
    pullRequestReviewComment {
      id
    }
  }
}`;

const DELETE_MUTATION = `
mutation($id: ID!) {
  deletePullRequestReviewComment(input: { id: $id }) {
    pullRequestReview {
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

async function runMutation(query, vars) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(vars)) {
    args.push('-f', `${key}=${value}`);
  }
  const response = JSON.parse(await runGh(args));
  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }
  return response.data;
}

function printUsage() {
  console.log(`Usage: update-review-comment.mjs --id <comment_node_id> (--body-file <path> | --body <text> | --delete)

Options:
  --id <id>           Review comment node ID (PRRC_...)
  --body <text>       Replacement comment body
  --body-file <path>  Read replacement body from file
  --delete            Delete the comment

Examples:
  update-review-comment.mjs --id PRRC_kwDOAbc123 --body-file /tmp/revised.md
  update-review-comment.mjs --id PRRC_kwDOAbc123 --delete`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const valueOf = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };

  const id = valueOf('--id');
  const shouldDelete = args.includes('--delete');
  let body = valueOf('--body');
  const bodyFile = valueOf('--body-file');

  if (!id) {
    console.error('Error: --id is required');
    process.exit(1);
  }

  try {
    if (shouldDelete) {
      await runMutation(DELETE_MUTATION, { id });
      console.log(JSON.stringify({ id, action: 'deleted' }, null, 2));
      return;
    }

    if (bodyFile) body = (await readFile(bodyFile, 'utf8')).trimEnd();
    if (!body) {
      console.error('Error: one of --body, --body-file, or --delete is required');
      process.exit(1);
    }

    await runMutation(UPDATE_MUTATION, { id, body });
    console.log(JSON.stringify({ id, action: 'updated' }, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
