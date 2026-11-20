#!/usr/bin/env node
/**
 * Returns everything respond-to-thread.mjs --commit needs for one commit: its
 * hashes and the pull request it is linked under.
 *
 * Usage: get-reply-commit-hash.mjs [commit_ref] [--pr <number_or_url>]
 *        get-reply-commit-hash.mjs [commit_ref] <owner> <repo> <pr_number>
 *
 * commit_ref defaults to HEAD. The pull request is the one of the current
 * branch unless --pr names another (needed in a stack, where the commit may
 * belong to a pull request other than the checked-out one). Passing owner, repo
 * and pr_number skips the lookup.
 *
 * Output: JSON object with:
 *   {
 *     short_hash: string,
 *     full_hash: string,
 *     subject: string,
 *     owner: string,
 *     repo: string,
 *     pr_number: number,
 *     respond_args: string   // "<short_hash> <full_hash> <owner> <repo> <pr_number>"
 *   }
 *
 * respond_args is complete: pass it as is after --commit.
 *
 *   respond-to-thread.mjs --commit <respond_args> --resolve <thread_id>
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function run(command, args) {
  const { stdout } = await execFileAsync(command, args);
  return stdout.trim();
}

function printUsage() {
  console.log('Usage: get-reply-commit-hash.mjs [commit_ref] [--pr <number_or_url>]');
  console.log('       get-reply-commit-hash.mjs [commit_ref] <owner> <repo> <pr_number>');
  console.log('');
  console.log('Returns the hashes of a commit and its pull request, formatted for');
  console.log('respond-to-thread.mjs --commit. commit_ref defaults to HEAD; the pull');
  console.log('request defaults to the one of the current branch.');
}

function parseArgs(args) {
  const positional = [];
  let prRef = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pr') {
      prRef = args[++i];
      if (!prRef) throw new Error('--pr needs a pull request number or URL');
    } else {
      positional.push(args[i]);
    }
  }
  if (positional.length === 3 || positional.length > 4) {
    throw new Error('Pass owner, repo and pr_number together, after the commit ref');
  }
  if (positional.length === 4) {
    const [commitRef, owner, repo, number] = positional;
    return { commitRef, target: { owner, repo, pr_number: Number(number) } };
  }
  if (positional.length === 2) {
    throw new Error('Pass owner, repo and pr_number together, after the commit ref');
  }
  return { commitRef: positional[0] || 'HEAD', prRef };
}

/** owner, repo and number of the pull request, taken from its URL so that forks resolve to the right repository. */
async function lookUpPullRequest(prRef) {
  const args = ['pr', 'view', '--json', 'number,url'];
  if (prRef) args.splice(2, 0, prRef);
  const pr = JSON.parse(await run('gh', args));
  const match = /^https?:\/\/[^/]+\/([^/]+)\/([^/]+)\/pull\/\d+/.exec(pr.url || '');
  if (!match) throw new Error(`Could not read owner and repo from the pull request URL '${pr.url}'`);
  return { owner: match[1], repo: match[2], pr_number: pr.number };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  try {
    const { commitRef, prRef, target } = parseArgs(args);
    const [fullHash, shortHash, subject, pr] = await Promise.all([
      run('git', ['log', '-1', '--format=%H', commitRef]),
      run('git', ['log', '-1', '--format=%h', commitRef]),
      run('git', ['log', '-1', '--format=%s', commitRef]),
      target ?? lookUpPullRequest(prRef)
    ]);
    if (!Number.isInteger(pr.pr_number)) throw new Error(`pr_number must be a number, got '${pr.pr_number}'`);

    console.log(JSON.stringify({
      short_hash: shortHash,
      full_hash: fullHash,
      subject,
      owner: pr.owner,
      repo: pr.repo,
      pr_number: pr.pr_number,
      respond_args: `${shortHash} ${fullHash} ${pr.owner} ${pr.repo} ${pr.pr_number}`
    }, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
