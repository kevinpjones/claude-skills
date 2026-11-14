#!/usr/bin/env node
/**
 * Collects the reviewer bot's outstanding findings on a PR.
 *
 * Sources:
 *   open_threads       unresolved review threads opened by a bot login
 *                      (via address-pr-comments' fetch-unresolved-threads.mjs)
 *   bot_auto_resolved  threads the bot resolved itself after --since, with no
 *                      reply from anyone else (usually because a later commit
 *                      fixed the finding); reported for visibility only
 *   summary            optional cross-check against the bot's summary comment:
 *                      findings tagged with summaryComment.newFindingMarker
 *                      that are not struck through
 *
 * Usage: collect-review-findings.mjs <owner> <repo> <pr_number> --config <file> [--since <iso8601>]
 *
 * Output: JSON { open_count, open_threads, bot_auto_resolved, summary }
 */

import { readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { ghList, graphql, isBotLogin, parseCliArgs, fail } from './github-cli.mjs';

const execFileAsync = promisify(execFile);
const FETCH_THREADS = fileURLToPath(new URL('./fetch-unresolved-threads.mjs', import.meta.url));

const RESOLVED_THREADS_QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          path
          resolvedBy { login }
          comments(last: 20) {
            nodes { author { login } body createdAt updatedAt }
          }
        }
      }
    }
  }
}`;

function firstLine(markdown) {
  const text = (markdown || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\(.)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (text || '').slice(0, 140);
}

async function fetchOpenBotThreads(owner, repo, prNumber, botLogins) {
  const args = [owner, repo, String(prNumber)];
  for (const login of botLogins) args.push('--author', login);
  const { stdout } = await execFileAsync(process.execPath, [FETCH_THREADS, ...args], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout).map((thread) => ({
    thread_id: thread.thread_id,
    path: thread.code_context?.file ?? null,
    lines: thread.code_context?.lines ?? null,
    is_outdated: thread.is_outdated,
    title: firstLine(thread.comments[0]?.body)
  }));
}

async function fetchBotAutoResolved(owner, repo, prNumber, botLogins, since) {
  const found = [];
  let after = null;
  do {
    const data = await graphql(RESOLVED_THREADS_QUERY, { owner, repo, prNumber: Number(prNumber), after });
    const page = data.repository.pullRequest.reviewThreads;
    for (const thread of page.nodes) {
      if (!thread.isResolved || !isBotLogin(thread.resolvedBy?.login, botLogins)) continue;
      const comments = thread.comments.nodes;
      const opener = comments[0];
      if (!opener || !isBotLogin(opener.author?.login, botLogins)) continue;
      const humanReplied = comments.some((c) => !isBotLogin(c.author?.login, botLogins));
      const lastActivity = new Date(comments.at(-1).updatedAt);
      if (humanReplied || lastActivity <= since) continue;
      found.push({ thread_id: thread.id, path: thread.path, title: firstLine(opener.body) });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return found;
}

async function readSummaryComment(owner, repo, prNumber, config) {
  const { summaryComment, botLogins } = config;
  if (!summaryComment?.marker) return { configured: false };

  const comments = await ghList(`repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`);
  const summary = comments
    .filter((c) => isBotLogin(c.user?.login, botLogins) && (c.body || '').includes(summaryComment.marker))
    .at(-1);
  if (!summary) return { configured: true, found: false };

  const marker = summaryComment.newFindingMarker;
  const newFindings = marker
    ? summary.body
        .split('\n')
        .filter((line) => line.includes(marker) && !/<s>|~~/.test(line))
        .map(firstLine)
    : [];

  return {
    configured: true,
    found: true,
    comment_id: summary.id,
    url: summary.html_url,
    updated_at: summary.updated_at,
    new_findings: newFindings
  };
}

async function main() {
  const { positional, flags } = parseCliArgs(process.argv.slice(2), { booleans: ['help'] });
  const [owner, repo, prNumber] = positional;

  if (flags.help || !owner || !repo || !prNumber || !flags.config) {
    console.error('Usage: collect-review-findings.mjs <owner> <repo> <pr_number> --config <file> [--since <iso8601>]');
    process.exit(flags.help ? 0 : 1);
  }

  const config = JSON.parse(await readFile(flags.config, 'utf8'));
  const since = new Date(flags.since || 0);

  const [openThreads, autoResolved, summary] = await Promise.all([
    fetchOpenBotThreads(owner, repo, prNumber, config.botLogins),
    fetchBotAutoResolved(owner, repo, prNumber, config.botLogins, since),
    readSummaryComment(owner, repo, prNumber, config)
  ]);

  console.log(JSON.stringify({
    open_count: openThreads.length,
    open_threads: openThreads,
    bot_auto_resolved: autoResolved,
    summary
  }, null, 2));
}

main().catch((error) => fail(error.message));
