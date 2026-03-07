#!/usr/bin/env node
/**
 * Returns commit hash info formatted for use with respond-to-thread.mjs --commit.
 *
 * Usage: get-reply-commit-hash.mjs [commit_ref]
 *
 * Defaults to HEAD if no commit ref is provided.
 *
 * Output: JSON object with:
 *   {
 *     short_hash: string,
 *     full_hash: string,
 *     subject: string,
 *     respond_args: string   // pre-formatted args for respond-to-thread.mjs --commit
 *   }
 *
 * The respond_args field requires owner, repo, and pr_number to be appended.
 * If piped with get-pr-context.mjs, the full command can be constructed as:
 *
 *   respond-to-thread.mjs --commit <short_hash> <full_hash> <owner> <repo> <pr_number> --resolve <thread_id>
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function git(command) {
  const { stdout } = await execAsync(`git ${command}`);
  return stdout.trim();
}

async function main() {
  const commitRef = process.argv[2] || 'HEAD';

  if (commitRef === '--help' || commitRef === '-h') {
    console.log('Usage: get-reply-commit-hash.mjs [commit_ref]');
    console.log('');
    console.log('Returns commit hash info for use with respond-to-thread.mjs --commit.');
    console.log('Defaults to HEAD if no commit ref is provided.');
    process.exit(0);
  }

  try {
    const [fullHash, shortHash, subject] = await Promise.all([
      git(`log -1 --format=%H ${commitRef}`),
      git(`log -1 --format=%h ${commitRef}`),
      git(`log -1 --format=%s ${commitRef}`)
    ]);

    const result = {
      short_hash: shortHash,
      full_hash: fullHash,
      subject,
      respond_args: `${shortHash} ${fullHash}`
    };

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
