#!/usr/bin/env node
/**
 * Lists the open PRs in the stack containing a PR, ordered bottom (closest to
 * trunk) to top, by following base/head branch links.
 *
 * Walks down while a PR's base branch is the head of another open PR, and up
 * while exactly one open PR targets the current head. A fork in the stack
 * (several PRs on one base) stops the upward walk and is reported.
 *
 * Usage: list-stack-prs.mjs <owner> <repo> <pr_number>
 *
 * Output: JSON { prs: [{ number, head, base, is_draft, url }], forks: [...] }
 */

import { ghJson, parseCliArgs, fail } from './github-cli.mjs';

const FIELDS = 'number,headRefName,baseRefName,isDraft,url';

function toEntry(pr) {
  return { number: pr.number, head: pr.headRefName, base: pr.baseRefName, is_draft: pr.isDraft, url: pr.url };
}

async function openPrs(repoSlug, filterFlag, branch) {
  return ghJson(['pr', 'list', '--repo', repoSlug, '--state', 'open', filterFlag, branch, '--json', FIELDS]);
}

async function main() {
  const { positional } = parseCliArgs(process.argv.slice(2));
  const [owner, repo, prNumber] = positional;
  if (!owner || !repo || !prNumber) {
    console.error('Usage: list-stack-prs.mjs <owner> <repo> <pr_number>');
    process.exit(1);
  }

  const repoSlug = `${owner}/${repo}`;
  const start = await ghJson(['pr', 'view', prNumber, '--repo', repoSlug, '--json', FIELDS]);
  const below = [];
  const above = [];
  const forks = [];
  const seen = new Set([start.number]);

  let current = start;
  while (true) {
    const [parent] = await openPrs(repoSlug, '--head', current.baseRefName);
    if (!parent || seen.has(parent.number)) break;
    seen.add(parent.number);
    below.unshift(toEntry(parent));
    current = parent;
  }

  current = start;
  while (true) {
    const children = await openPrs(repoSlug, '--base', current.headRefName);
    if (children.length === 0) break;
    if (children.length > 1) {
      forks.push({ base: current.headRefName, prs: children.map((c) => c.number) });
      break;
    }
    const [child] = children;
    if (seen.has(child.number)) break;
    seen.add(child.number);
    above.push(toEntry(child));
    current = child;
  }

  console.log(JSON.stringify({ prs: [...below, toEntry(start), ...above], forks }, null, 2));
}

main().catch((error) => fail(error.message));
