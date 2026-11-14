#!/usr/bin/env node
/**
 * Waits until the reviewer bot finishes a review of a specific commit.
 *
 * A round counts as finished only when the completion signal is
 *   - authored by one of config.botLogins,
 *   - created after --since, and
 *   - tied to --head-sha.
 * Edits to long-lived bot comments (which bots make when threads are resolved
 * or commits are pushed) are never treated as a finished round.
 *
 * completionSignal.type:
 *   comment-match     a new bot issue comment whose body matches
 *                     completionSignal.pattern, with "{headSha}" replaced by
 *                     the escaped head SHA
 *   review-submitted  a bot PR review whose commit_id is the head SHA
 *
 * Usage: wait-for-review.mjs <owner> <repo> <pr_number> --config <file>
 *          --head-sha <sha> [--since <iso8601>] [--once]
 *
 *   --since  defaults to the epoch, which accepts any earlier review of this SHA
 *   --once   check a single time and report "pending" instead of waiting
 *
 * Output: JSON { status, head_sha, signal, waited_seconds }
 *   status: completed | pending | timeout | head-changed
 * Exit codes: 0 completed or pending (--once), 3 timeout, 4 head-changed
 */

import { readFile } from 'fs/promises';
import { setTimeout as sleep } from 'timers/promises';
import { ghList, getHeadSha, isBotLogin, parseCliArgs, fail } from './github-cli.mjs';

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findCommentSignal({ owner, repo, prNumber, config, headSha, since }) {
  const pattern = new RegExp(config.completionSignal.pattern.replaceAll('{headSha}', escapeRegex(headSha)));
  const comments = await ghList(`repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`);
  const match = comments.find((comment) =>
    isBotLogin(comment.user?.login, config.botLogins) &&
    new Date(comment.created_at) > since &&
    pattern.test(comment.body || '')
  );
  return match && { type: 'comment', id: match.id, url: match.html_url, created_at: match.created_at };
}

async function findReviewSignal({ owner, repo, prNumber, config, headSha, since }) {
  const reviews = await ghList(`repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`);
  const match = reviews.find((review) =>
    isBotLogin(review.user?.login, config.botLogins) &&
    review.commit_id === headSha &&
    new Date(review.submitted_at) > since
  );
  return match && { type: 'review', id: match.id, url: match.html_url, created_at: match.submitted_at };
}

async function main() {
  const { positional, flags } = parseCliArgs(process.argv.slice(2), { booleans: ['once', 'help'] });
  const [owner, repo, prNumber] = positional;

  if (flags.help || !owner || !repo || !prNumber || !flags.config || !flags['head-sha']) {
    console.error('Usage: wait-for-review.mjs <owner> <repo> <pr_number> --config <file> --head-sha <sha> [--since <iso8601>] [--once]');
    process.exit(flags.help ? 0 : 1);
  }

  const config = JSON.parse(await readFile(flags.config, 'utf8'));
  const headSha = flags['head-sha'];
  const since = new Date(flags.since || 0);
  if (Number.isNaN(since.getTime())) fail(`--since is not a valid timestamp: ${flags.since}`, 2);

  const findSignal = config.completionSignal.type === 'review-submitted' ? findReviewSignal : findCommentSignal;
  const context = { owner, repo, prNumber, config, headSha, since };
  const started = Date.now();
  const deadline = started + config.timeoutMinutes * 60_000;
  const report = (status, signal = null) => ({
    status,
    head_sha: headSha,
    signal,
    waited_seconds: Math.round((Date.now() - started) / 1000)
  });

  while (true) {
    const signal = await findSignal(context);
    if (signal) {
      console.log(JSON.stringify(report('completed', signal), null, 2));
      return;
    }

    if (flags.once) {
      console.log(JSON.stringify(report('pending'), null, 2));
      return;
    }

    const currentHead = await getHeadSha(owner, repo, prNumber);
    if (currentHead !== headSha) {
      console.log(JSON.stringify({ ...report('head-changed'), current_head_sha: currentHead }, null, 2));
      process.exit(4);
    }

    if (Date.now() >= deadline) {
      console.log(JSON.stringify(report('timeout'), null, 2));
      process.exit(3);
    }

    console.error(`Waiting for ${config.reviewerName} on ${headSha.slice(0, 7)}… (${Math.round((Date.now() - started) / 1000)}s)`);
    await sleep(Math.min(config.pollIntervalSeconds * 1000, Math.max(deadline - Date.now(), 0)));
  }
}

main().catch((error) => fail(error.message));
