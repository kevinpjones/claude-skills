#!/usr/bin/env node
/**
 * Requests one review round from the configured reviewer bot.
 *
 * trigger.type:
 *   comment           posts trigger.body (+ trigger.extraArgs) as a PR comment
 *   request-reviewer  (re-)requests trigger.reviewer as a PR reviewer
 *   none              posts nothing; the reviewer runs on push by itself
 *
 * Usage: trigger-review.mjs <owner> <repo> <pr_number> --config <file> [--dry-run]
 *
 * Output: JSON { method, triggered_at, head_sha, comment_id, comment_url }
 *   triggered_at is the timestamp to pass to wait-for-review.mjs --since.
 */

import { readFile } from 'fs/promises';
import { ghJson, getHeadSha, parseCliArgs, fail } from './github-cli.mjs';

async function postComment(owner, repo, prNumber, body) {
  const comment = await ghJson([
    'api', `repos/${owner}/${repo}/issues/${prNumber}/comments`,
    '-f', `body=${body}`
  ]);
  return { triggered_at: comment.created_at, comment_id: comment.id, comment_url: comment.html_url };
}

async function requestReviewer(owner, repo, prNumber, reviewer) {
  await ghJson([
    'api', '-X', 'POST', `repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
    '-f', `reviewers[]=${reviewer}`
  ]);
  return { triggered_at: new Date().toISOString(), comment_id: null, comment_url: null };
}

async function main() {
  const { positional, flags } = parseCliArgs(process.argv.slice(2), { booleans: ['dry-run', 'help'] });
  const [owner, repo, prNumber] = positional;

  if (flags.help || !owner || !repo || !prNumber || !flags.config) {
    console.error('Usage: trigger-review.mjs <owner> <repo> <pr_number> --config <file> [--dry-run]');
    process.exit(flags.help ? 0 : 1);
  }

  const config = JSON.parse(await readFile(flags.config, 'utf8'));
  const { trigger } = config;
  const headSha = await getHeadSha(owner, repo, prNumber);
  const body = [trigger.body, trigger.extraArgs].filter(Boolean).join(' ');

  let result;
  if (flags['dry-run']) {
    const detail = trigger.type === 'comment' ? body : trigger.reviewer ?? null;
    result = { triggered_at: new Date().toISOString(), comment_id: null, comment_url: null, would: detail };
  } else if (trigger.type === 'comment') {
    result = await postComment(owner, repo, prNumber, body);
  } else if (trigger.type === 'request-reviewer') {
    result = await requestReviewer(owner, repo, prNumber, trigger.reviewer);
  } else {
    result = { triggered_at: new Date().toISOString(), comment_id: null, comment_url: null };
  }

  console.error(`${config.reviewerName}: ${trigger.type} trigger on ${owner}/${repo}#${prNumber} at ${headSha.slice(0, 7)}`);
  console.log(JSON.stringify({ method: trigger.type, head_sha: headSha, dry_run: !!flags['dry-run'], ...result }, null, 2));
}

main().catch((error) => fail(error.message));
