#!/usr/bin/env node
/**
 * Stack-aware branch push for after addressing PR comments.
 *
 * For non-stacked branches: pushes with --force-with-lease.
 * For stacked branches: rebases child branches, force-pushes all affected
 * branches, and updates PR comment links on each affected PR.
 *
 * Usage: push-branch.mjs [options]
 *
 * Options:
 *   --dry-run    Show what would be done without making changes
 *   --no-links   Skip updating PR comment links after push
 *
 * Output: JSON summary of push operations performed
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

async function gitExitCode(command) {
  try {
    await execAsync(`git ${command}`);
    return 0;
  } catch (error) {
    return error.code || 1;
  }
}

async function getCurrentBranch() {
  return git('rev-parse --abbrev-ref HEAD');
}

async function detectStackFromBranch(branch) {
  // Read commit messages looking for stack trailers
  try {
    const log = await git(`log ${branch} --format=%B --max-count=50`);

    let stackId = null;
    let parentBranch = null;
    let position = null;

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
    // Not a stack
  }
  return null;
}

async function findChildBranches(currentBranch, stackId) {
  // Find local branches that are part of the same stack and above current branch
  const children = [];

  try {
    const branchList = await git('branch --format=%(refname:short)');
    const branches = branchList.split('\n').filter(b => b.trim());

    for (const branch of branches) {
      if (branch === currentBranch) continue;

      try {
        const log = await git(`log ${branch} --format=%B --max-count=50`);
        let branchStackId = null;
        let branchParent = null;
        let branchPosition = null;

        for (const line of log.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('Stack-Id:') && !branchStackId) {
            branchStackId = trimmed.replace('Stack-Id:', '').trim();
          } else if (trimmed.startsWith('Stack-Parent-Branch:') && !branchParent) {
            branchParent = trimmed.replace('Stack-Parent-Branch:', '').trim();
          } else if (trimmed.startsWith('Stack-Position:') && !branchPosition) {
            branchPosition = parseInt(trimmed.replace('Stack-Position:', '').trim(), 10);
          }
        }

        if (branchStackId === stackId && branchPosition !== null) {
          children.push({ branch, parent: branchParent, position: branchPosition });
        }
      } catch {
        // Skip branches we can't read
      }
    }
  } catch {
    // Can't list branches
  }

  // Sort by position
  children.sort((a, b) => a.position - b.position);
  return children;
}

function buildStackChain(currentBranch, currentPosition, allBranches) {
  // Return branches above current in stack order
  return allBranches
    .filter(b => b.position > currentPosition)
    .sort((a, b) => a.position - b.position);
}

async function getPrNumberForBranch(branch) {
  try {
    const stdout = await runGh(['pr', 'view', branch, '--json', 'number', '-q', '.number']);
    return parseInt(stdout.trim(), 10);
  } catch {
    return null;
  }
}

async function getRepoInfo() {
  const stdout = await runGh(['repo', 'view', '--json', 'owner,name']);
  return JSON.parse(stdout);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noLinks = args.includes('--no-links');

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: push-branch.mjs [options]');
    console.log('');
    console.log('Stack-aware branch push for after addressing PR comments.');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run    Show what would be done without making changes');
    console.log('  --no-links   Skip updating PR comment links after push');
    process.exit(0);
  }

  try {
    const currentBranch = await getCurrentBranch();
    const stack = await detectStackFromBranch(currentBranch);

    const results = {
      branch: currentBranch,
      dry_run: dryRun,
      stack: stack ? { stack_id: stack.stack_id, position: stack.position } : null,
      operations: []
    };

    if (!stack) {
      // Simple case: not a stacked branch
      console.error(`Pushing ${currentBranch}...`);
      if (!dryRun) {
        await git(`push --force-with-lease origin ${currentBranch}`);
      }
      results.operations.push({
        action: 'push',
        branch: currentBranch,
        status: dryRun ? 'would_push' : 'pushed'
      });

      console.log(JSON.stringify(results, null, 2));
      return;
    }

    // Stacked branch: find and rebase children
    console.error(`Branch ${currentBranch} is part of stack "${stack.stack_id}" at position ${stack.position}`);

    const allStackBranches = await findChildBranches(currentBranch, stack.stack_id);
    const childBranches = buildStackChain(currentBranch, stack.position, allStackBranches);

    if (childBranches.length > 0) {
      console.error(`Found ${childBranches.length} child branch(es) to rebase: ${childBranches.map(b => b.branch).join(', ')}`);
    }

    // Fetch before force-pushing
    if (!dryRun) {
      await git('fetch origin');
    }

    // Rebase child branches using @{1} technique
    if (childBranches.length > 0) {
      let parentBranch = currentBranch;

      for (const child of childBranches) {
        console.error(`Rebasing ${child.branch} onto ${parentBranch}...`);
        if (!dryRun) {
          await git(`rebase --onto ${parentBranch} ${parentBranch}@{1} ${child.branch}`);
        }
        results.operations.push({
          action: 'rebase',
          branch: child.branch,
          onto: parentBranch,
          status: dryRun ? 'would_rebase' : 'rebased'
        });
        parentBranch = child.branch;
      }
    }

    // Force push all affected branches in one command
    const branchesToPush = [currentBranch, ...childBranches.map(b => b.branch)];
    console.error(`Force pushing: ${branchesToPush.join(', ')}...`);

    if (!dryRun) {
      // Return to the original branch before pushing
      await git(`checkout ${currentBranch}`);
      await git(`push --force-with-lease origin ${branchesToPush.join(' ')}`);
    }

    results.operations.push({
      action: 'push',
      branches: branchesToPush,
      status: dryRun ? 'would_push' : 'pushed'
    });

    // Update PR comment links for affected PRs
    if (!noLinks) {
      const repoInfo = await getRepoInfo();
      const owner = repoInfo.owner.login;
      const repo = repoInfo.name;

      for (const branch of branchesToPush) {
        const prNumber = await getPrNumberForBranch(branch);
        if (!prNumber) {
          results.operations.push({
            action: 'update_links',
            branch,
            status: 'skipped',
            reason: 'No PR found for branch'
          });
          continue;
        }

        console.error(`Updating comment links for PR #${prNumber} (${branch})...`);
        if (!dryRun) {
          try {
            const scriptPath = `${process.env.HOME}/.claude/skills/manage-stacked-pr/scripts/update-pr-comment-links.mjs`;
            const { stdout } = await execAsync(`${scriptPath} ${owner} ${repo} ${prNumber}`);
            const linkResult = JSON.parse(stdout);
            results.operations.push({
              action: 'update_links',
              branch,
              pr_number: prNumber,
              status: 'updated',
              summary: linkResult.instructions?.summary
            });
          } catch (error) {
            results.operations.push({
              action: 'update_links',
              branch,
              pr_number: prNumber,
              status: 'error',
              reason: error.message
            });
          }
        } else {
          results.operations.push({
            action: 'update_links',
            branch,
            pr_number: prNumber,
            status: 'would_update'
          });
        }
      }
    }

    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();