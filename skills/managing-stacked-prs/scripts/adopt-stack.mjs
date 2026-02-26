#!/usr/bin/env node
/**
 * Discovers an existing PR stack from GitHub PR relationships and outputs
 * the stack structure for adoption.
 *
 * Traverses the chain of PRs by following base/head branch relationships
 * to reconstruct the full stack, even without commit trailers.
 *
 * Usage:
 *   adopt-stack.mjs <pr_number>           Discover stack from any PR in it
 *   adopt-stack.mjs --branch <name>       Discover stack from a branch name
 *
 * The script walks the PR chain in both directions:
 *   - Downward: follows base branches to find the root
 *   - Upward: finds PRs that target each branch as their base
 *
 * Output: JSON object with discovered stack structure:
 *   {
 *     base_branch: string,
 *     branches: [
 *       { name: string, parent: string, position: number, pr_number: number, pr_url: string }
 *     ],
 *     adoption_commands: [string]
 *   }
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
      if (code !== 0) {
        reject(new Error(stderr || `gh exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function getPRByNumber(prNumber) {
  const stdout = await runGh([
    'pr', 'view', String(prNumber),
    '--json', 'number,title,headRefName,baseRefName,url,state'
  ]);
  return JSON.parse(stdout);
}

async function getPRByBranch(branchName) {
  try {
    const stdout = await runGh([
      'pr', 'view', branchName,
      '--json', 'number,title,headRefName,baseRefName,url,state'
    ]);
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function findPRsTargetingBase(baseBranch) {
  try {
    const stdout = await runGh([
      'pr', 'list',
      '--base', baseBranch,
      '--json', 'number,title,headRefName,baseRefName,url,state',
      '--state', 'open'
    ]);
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

async function discoverStack(startPR) {
  const visited = new Map(); // branchName -> PR info
  const prQueue = [startPR];

  // BFS to discover all connected PRs
  while (prQueue.length > 0) {
    const pr = prQueue.shift();
    if (visited.has(pr.headRefName)) continue;

    visited.set(pr.headRefName, {
      name: pr.headRefName,
      base: pr.baseRefName,
      pr_number: pr.number,
      pr_url: pr.url,
      title: pr.title
    });

    // Walk downward: find PR for the base branch
    if (!visited.has(pr.baseRefName)) {
      const basePR = await getPRByBranch(pr.baseRefName);
      if (basePR && basePR.headRefName === pr.baseRefName) {
        prQueue.push(basePR);
      }
    }

    // Walk upward: find PRs that target this branch as their base
    const childPRs = await findPRsTargetingBase(pr.headRefName);
    for (const childPR of childPRs) {
      if (!visited.has(childPR.headRefName)) {
        prQueue.push(childPR);
      }
    }
  }

  // Determine the base branch (the branch that is NOT a head of any discovered PR)
  const headBranches = new Set(visited.keys());
  let baseBranch = null;

  for (const info of visited.values()) {
    if (!headBranches.has(info.base)) {
      baseBranch = info.base;
      break;
    }
  }

  if (!baseBranch) {
    // Fallback: use the base of the branch with no parent in the stack
    for (const info of visited.values()) {
      if (!visited.has(info.base)) {
        baseBranch = info.base;
        break;
      }
    }
  }

  // Build ordered list by walking the chain from base
  const ordered = [];
  let currentBase = baseBranch;
  const remaining = new Map(visited);

  while (remaining.size > 0) {
    let found = false;
    for (const [branchName, info] of remaining) {
      if (info.base === currentBase) {
        ordered.push(info);
        remaining.delete(branchName);
        currentBase = branchName;
        found = true;
        break;
      }
    }

    if (!found) {
      // Handle branches that don't form a clean chain
      // (e.g., multiple PRs targeting the same base - pick one)
      const [branchName, info] = remaining.entries().next().value;
      ordered.push(info);
      remaining.delete(branchName);
      currentBase = branchName;
    }
  }

  // Infer stack name and extract descriptions for the agent
  const branchNames = ordered.map(b => b.name);
  const branchDescriptions = branchNames.map(getBranchDescription);
  const suggestedName = inferStackName(branchNames);

  // Use STACK_NAME placeholder so the agent can substitute after user confirms the name
  const adoptionCommands = ordered.map((branch, index) => {
    const position = index + 1;
    const parent = index === 0 ? baseBranch : ordered[index - 1].name;
    return [
      `git checkout ${branch.name}`,
      `git commit --allow-empty --no-verify -m "chore: adopt into stack" \\`,
      `  --trailer "Stack-Id: STACK_NAME" \\`,
      `  --trailer "Stack-Parent-Branch: ${parent}" \\`,
      `  --trailer "Stack-Position: ${position}"`
    ].join('\n');
  });

  const branchList = ordered.map(b => b.name);
  const pushCommand = `git push --force-with-lease origin ${branchList.join(' ')}`;

  return {
    stack_name_suggestion: suggestedName,
    base_branch: baseBranch,
    branch_count: ordered.length,
    branches: ordered.map((b, i) => ({
      name: b.name,
      description: getBranchDescription(b.name),
      parent: i === 0 ? baseBranch : ordered[i - 1].name,
      position: i + 1,
      pr_number: b.pr_number,
      pr_url: b.pr_url,
      title: b.title
    })),
    adoption_commands: adoptionCommands,
    instructions: {
      summary: `Discovered ${ordered.length}-branch stack targeting \`${baseBranch}\`.`,
      naming_tip: [
        `The suggested stack name is "${suggestedName}", inferred from common words in branch descriptions: ${branchDescriptions.join(', ')}.`,
        'Review the branch names, descriptions, and PR titles above to choose a name that captures the overall feature.',
        'Present the discovered stack to the user and let them confirm or override the name.',
      ].join(' '),
      steps: [
        '1. Present the stack structure to the user. Confirm the stack order is correct and agree on a stack name.',
        '2. Run: git fetch origin',
        '3. For each branch (bottom to top), run the adoption_commands above, replacing STACK_NAME with the chosen name.',
        `4. Push all branches: ${pushCommand}`,
        '5. Verify adoption: ~/.claude/skills/managing-stacked-prs/scripts/detect-stack.mjs',
      ],
    },
  };
}

/**
 * Extracts the description segment from a branch name.
 * Branch format: ISSUE-ID/<type>/<kebab-description> or <type>/<kebab-description>
 *
 * For "PROJ-123/feat/add-user-model", returns "add-user-model".
 * For "feat/add-user-model", returns "add-user-model".
 * For "feature-auth", returns "feature-auth".
 */
function getBranchDescription(branchName) {
  const lastSlashIdx = branchName.lastIndexOf('/');
  return lastSlashIdx >= 0 ? branchName.slice(lastSlashIdx + 1) : branchName;
}

/**
 * Infers a stack name from branch descriptions (the segments after the last `/`).
 *
 * Strategy:
 * 1. Extract descriptions (last segment after `/`)
 * 2. Find the most common meaningful words across all descriptions
 * 3. Filter noise words like "stacked", "add", "for", "the", etc.
 * 4. Build a name from the top recurring words
 */
function inferStackName(branchNames) {
  if (branchNames.length === 0) return 'unnamed-stack';

  const descriptions = branchNames.map(getBranchDescription);

  // Noise words to exclude from name inference
  const noiseWords = new Set([
    'stacked', 'stack', 'add', 'the', 'for', 'and', 'with', 'from',
    'of', 'in', 'to', 'at', 'by', 'on', 'is', 'a', 'an', 'new',
    'update', 'fix', 'test', 'tests', 'create', 'remove', 'delete',
  ]);

  // Count word frequency across all descriptions
  const wordCounts = new Map();
  for (const desc of descriptions) {
    const words = desc.split('-').filter(w => w && !noiseWords.has(w.toLowerCase()));
    for (const word of words) {
      wordCounts.set(word.toLowerCase(), (wordCounts.get(word.toLowerCase()) || 0) + 1);
    }
  }

  // Find words that appear in at least 2 descriptions (or all if only 2 branches)
  const threshold = Math.min(2, branchNames.length);
  const commonWords = [...wordCounts.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);

  if (commonWords.length > 0) {
    // Take up to 4 most common words
    return commonWords.slice(0, 4).join('-');
  }

  // Fallback: use the first description, trimmed
  return descriptions[0].replace(/^(add|create|update|fix)-/, '') || 'adopted-stack';
}

// Parse args
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: adopt-stack.mjs <pr_number>');
  console.log('       adopt-stack.mjs --branch <branch_name>');
  console.log('');
  console.log('Discovers an existing PR stack from GitHub PR relationships.');
  console.log('Outputs the stack structure and commands to add stack metadata trailers.');
  console.log('');
  console.log('Options:');
  console.log('  --branch <name>  Start discovery from a branch name');
  console.log('  --help, -h       Show this help message');
  process.exit(args.length === 0 ? 1 : 0);
}

try {
  let startPR;

  if (args[0] === '--branch') {
    if (!args[1]) {
      console.error('Error: --branch requires a branch name');
      process.exit(1);
    }
    startPR = await getPRByBranch(args[1]);
    if (!startPR) {
      console.error(`Error: No open PR found for branch "${args[1]}"`);
      process.exit(1);
    }
  } else {
    const prNumber = parseInt(args[0], 10);
    if (isNaN(prNumber)) {
      console.error(`Error: Invalid PR number "${args[0]}"`);
      process.exit(1);
    }
    startPR = await getPRByNumber(prNumber);
  }

  const stack = await discoverStack(startPR);
  console.log(JSON.stringify(stack, null, 2));
} catch (error) {
  console.error('Error discovering stack:', error.message);
  process.exit(1);
}
