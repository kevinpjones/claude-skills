#!/usr/bin/env node
/**
 * Detects PR stack structure from git commit trailers.
 *
 * Usage: detect-stack.mjs [--stack-id <name>]
 *
 * If --stack-id is not provided, detects from current branch's commits.
 *
 * Output: JSON object with stack structure:
 *   {
 *     stack_id: string,
 *     branch_count: number,
 *     branches: [
 *       { name: string, parent: string, position: number, current: boolean }
 *     ]
 *   }
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const COMMIT_SEPARATOR = '---STACK-COMMIT-SEP---';

async function git(command) {
  const { stdout } = await execAsync(`git ${command}`);
  return stdout.trim();
}

async function getCurrentBranch() {
  return git('rev-parse --abbrev-ref HEAD');
}

async function getLocalBranches() {
  const output = await git("for-each-ref '--format=%(refname:short)' refs/heads/");
  return output.split('\n').map(b => b.trim()).filter(Boolean);
}

function parseTrailers(commitBody) {
  const lines = commitBody.split('\n');
  let stackId = null;
  let parentBranch = null;
  let position = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Stack-Id:')) {
      stackId = trimmed.slice('Stack-Id:'.length).trim();
    } else if (trimmed.startsWith('Stack-Parent-Branch:')) {
      parentBranch = trimmed.slice('Stack-Parent-Branch:'.length).trim();
    } else if (trimmed.startsWith('Stack-Position:')) {
      position = parseInt(trimmed.slice('Stack-Position:'.length).trim(), 10);
    }
  }

  return { stackId, parentBranch, position };
}

async function findStackTrailers(branch, maxCommits = 50) {
  try {
    const output = await git(
      `log ${branch} --format=%B${COMMIT_SEPARATOR} --max-count=${maxCommits}`
    );
    const commits = output.split(COMMIT_SEPARATOR);

    for (const body of commits) {
      const trailers = parseTrailers(body);
      if (trailers.stackId) return trailers;
    }
  } catch {
    // Branch might not exist or have no commits
  }
  return null;
}

async function detectStack(targetStackId) {
  const currentBranch = await getCurrentBranch();

  // If no stack ID provided, find it from current branch
  if (!targetStackId) {
    const trailers = await findStackTrailers(currentBranch);
    if (!trailers?.stackId) {
      console.error('Error: No stack metadata found on current branch.');
      console.error('Ensure commits have Stack-Id trailers.');
      console.error('');
      console.error('Tip: Use --stack-id <name> to specify the stack explicitly.');
      process.exit(1);
    }
    targetStackId = trailers.stackId;
  }

  // Find all branches with this stack ID
  const branches = await getLocalBranches();
  const stackBranches = [];

  for (const branch of branches) {
    const trailers = await findStackTrailers(branch);
    if (trailers?.stackId === targetStackId) {
      stackBranches.push({
        name: branch,
        parent: trailers.parentBranch,
        position: trailers.position,
        current: branch === currentBranch
      });
    }
  }

  if (stackBranches.length === 0) {
    console.error(`Error: No branches found for stack "${targetStackId}".`);
    process.exit(1);
  }

  // Sort by position
  stackBranches.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

  const currentEntry = stackBranches.find(b => b.current);
  const topBranch = stackBranches[stackBranches.length - 1];
  const baseBranch = stackBranches[0]?.parent || 'main';
  const branchNames = stackBranches.map(b => b.name);

  return {
    stack_id: targetStackId,
    base_branch: baseBranch,
    branch_count: stackBranches.length,
    branches: stackBranches,
    instructions: {
      summary: `Stack "${targetStackId}" has ${stackBranches.length} branch(es) based on \`${baseBranch}\`.`
        + (currentEntry ? ` Currently on \`${currentEntry.name}\` (position ${currentEntry.position}).` : ''),
      next_steps: {
        add_branch: `Create from the top branch: git checkout ${topBranch.name} && git checkout -b <ISSUE-ID>/<type>/<description>`,
        rebase: `After modifying a branch, rebase all branches above it using the @{1} technique (see stack-rebase-and-sync-workflow.md).`,
        verify: `git log --oneline ${baseBranch}..${branchNames[0]}` + (branchNames.length > 1 ? ` && git log --oneline ${branchNames.slice(0, -1).map((b, i) => `${b}..${branchNames[i + 1]}`).join(' && git log --oneline ')}` : ''),
        force_push: `git push --force-with-lease origin ${branchNames.join(' ')}`,
      },
    },
  };
}

// Parse args
const args = process.argv.slice(2);
let stackId = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--stack-id' && args[i + 1]) {
    stackId = args[++i];
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: detect-stack.mjs [--stack-id <name>]');
    console.log('');
    console.log('Detects PR stack structure from git commit trailers.');
    console.log('If --stack-id is not provided, detects from current branch.');
    console.log('');
    console.log('Options:');
    console.log('  --stack-id <name>  Specify the stack ID to search for');
    console.log('  --help, -h         Show this help message');
    console.log('');
    console.log('Output: JSON object with stack structure');
    process.exit(0);
  }
}

try {
  const stack = await detectStack(stackId);
  console.log(JSON.stringify(stack, null, 2));
} catch (error) {
  console.error('Error detecting stack:', error.message);
  process.exit(1);
}
