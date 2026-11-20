#!/usr/bin/env node
/**
 * Fetches the reviews submitted on a pull request: who reviewed, with what
 * verdict, and the summary they wrote above their inline comments.
 *
 * Usage: fetch-review-summaries.mjs <owner> <repo> <pr_number> [--author <login>]...
 *
 * Left out: reviews still pending, and "commented" reviews without a summary,
 * which are only the containers GitHub creates for inline comments and replies.
 * A review that approves or requests changes is kept even without a summary.
 *
 * Output: JSON array, oldest first, shaped for the Pair Review plugin's
 * review_set_review_overview:
 *   [{ author, state, body, submitted_at, url, avatar_url }]
 * state is approved, changes_requested, commented or dismissed.
 */

import { spawn } from 'child_process';

function runGh(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('gh', args, { stdio: ['inherit', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr || `gh exited with code ${code}`));
      else resolve(stdout);
    });
  });
}

function printUsage() {
  console.error('Usage: fetch-review-summaries.mjs <owner> <repo> <pr_number> [--author <login>]...');
}

/** Picks the reviews worth showing out of GitHub's list and maps them to the output shape. */
export function summaries(reviews, authors = []) {
  const wanted = authors.map((login) => login.toLowerCase());
  return reviews
    .filter((review) => review.state !== 'PENDING')
    .filter((review) => review.state !== 'COMMENTED' || (review.body || '').trim() !== '')
    .filter((review) => wanted.length === 0 || wanted.includes((review.user?.login || '').toLowerCase()))
    .sort((a, b) => (a.submitted_at || '').localeCompare(b.submitted_at || ''))
    .map((review) => ({
      author: review.user?.login || '',
      state: (review.state || '').toLowerCase(),
      body: (review.body || '').trim(),
      submitted_at: review.submitted_at || null,
      url: review.html_url || null,
      avatar_url: review.user?.avatar_url || null
    }));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }
  const positional = [];
  const authors = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--author') authors.push(args[++i]);
    else positional.push(args[i]);
  }
  const [owner, repo, number] = positional;
  if (!owner || !repo || !/^\d+$/.test(number || '') || authors.some((login) => !login)) {
    printUsage();
    process.exit(1);
  }

  try {
    // --slurp wraps the pages in one array, so the output is valid JSON however many pages there are.
    const stdout = await runGh(['api', '--paginate', '--slurp', `repos/${owner}/${repo}/pulls/${number}/reviews`]);
    console.log(JSON.stringify(summaries(JSON.parse(stdout).flat(), authors), null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
