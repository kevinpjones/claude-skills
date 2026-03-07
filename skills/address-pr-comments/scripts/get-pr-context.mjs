#!/usr/bin/env node
/**
 * Gathers PR context in a single call: PR number, owner, repo, branch,
 * and whether the branch is part of a stacked PR.
 *
 * Usage: get-pr-context.mjs [pr_number_or_url]
 *
 * If no argument is provided, detects the PR from the current branch.
 *
 * Output: JSON object with:
 *   {
 *     pr_number: number,
 *     owner: string,
 *     repo: string,
 *     branch: string,
 *     base_branch: string,
 *     url: string,
 *     stack: null | {
 *       stack_id: string,
 *       parent_branch: string,
 *       position: number
 *     }
 *   }
 */

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

async function git(command) {
  const { stdout } = await execAsync(`git ${command}`);
  return stdout.trim();
}

async function getPrInfo(prRef) {
  const args = ['pr', 'view', '--json', 'number,url,headRefName,baseRefName'];
  if (prRef) args.splice(2, 0, prRef);

  const stdout = await runGh(args);
  return JSON.parse(stdout);
}

async function getRepoInfo() {
  const stdout = await runGh(['repo', 'view', '--json', 'owner,name']);
  return JSON.parse(stdout);
}

async function detectStack(branch) {
  // Read commit trailers from all commits on this branch (up to 50)
  // to find stack metadata on the initial commit
  try {
    const log = await git(
      `log ${branch} --format=%B --max-count=50`
    );

    let stackId = null;
    let parentBranch = null;
    let position = null;

    // Search through all commit messages for stack trailers
    for (const line of log.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Stack-Id:') && !stackId) {
        stackId = trimmed.replace('Stack-Id:', '').trim();
      } else if (trimmed.startsWith('Stack-Parent-Branch:') && !parentBranch) {
        parentBranch = trimmed.replace('Stack-Parent-Branch:', '').trim();
      } else if (trimmed.startsWith('Stack-Position:') && !position) {
        position = parseInt(trimmed.replace('Stack-Position:', '').trim(), 10);
      }
    }

    if (stackId) {
      return { stack_id: stackId, parent_branch: parentBranch, position };
    }
  } catch {
    // Not a stack or git error — that's fine
  }

  return null;
}

async function main() {
  const prRef = process.argv[2];

  if (prRef === '--help' || prRef === '-h') {
    console.log('Usage: get-pr-context.mjs [pr_number_or_url]');
    console.log('');
    console.log('Gathers PR context: number, owner, repo, branch, and stack info.');
    console.log('If no argument is provided, detects the PR from the current branch.');
    process.exit(0);
  }

  try {
    const [prInfo, repoInfo] = await Promise.all([
      getPrInfo(prRef),
      getRepoInfo()
    ]);

    const stack = await detectStack(prInfo.headRefName);

    const context = {
      pr_number: prInfo.number,
      owner: repoInfo.owner.login,
      repo: repoInfo.name,
      branch: prInfo.headRefName,
      base_branch: prInfo.baseRefName,
      url: prInfo.url,
      stack
    };

    console.log(JSON.stringify(context, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
