#!/usr/bin/env node
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const args = process.argv.slice(2);

function usage() {
  console.error(`Usage: get-branch-diff.mjs [--stat] [--base <branch>]

Get the diff of the current branch against its base branch.

Options:
  --stat          Show file stats only (changed files summary)
  --base <branch> Specify base branch (default: auto-detect main/master)
  --help          Show this help message

Output:
  --stat mode:  Prints file stats to stdout
  Normal mode:  Writes diff to a temp file, prints path to stdout`);
  process.exit(0);
}

if (args.includes('--help')) usage();

const statOnly = args.includes('--stat');
let baseBranch = null;

const baseIdx = args.indexOf('--base');
if (baseIdx !== -1 && args[baseIdx + 1]) {
  baseBranch = args[baseIdx + 1];
}

// Auto-detect base branch if not specified
if (!baseBranch) {
  try {
    // Try to get the upstream tracking branch's remote default
    const remote = execSync('git remote', { encoding: 'utf-8' }).trim().split('\n')[0] || 'origin';
    const head = execSync(`git remote show ${remote} 2>/dev/null | grep 'HEAD branch'`, { encoding: 'utf-8' });
    baseBranch = head.replace(/.*HEAD branch:\s*/, '').trim();
  } catch {
    // Fallback: check if main or master exists
    try {
      execSync('git rev-parse --verify main 2>/dev/null', { encoding: 'utf-8' });
      baseBranch = 'main';
    } catch {
      try {
        execSync('git rev-parse --verify master 2>/dev/null', { encoding: 'utf-8' });
        baseBranch = 'master';
      } catch {
        console.error('Error: Could not detect base branch. Use --base <branch> to specify.');
        process.exit(1);
      }
    }
  }
}

// Get the merge base
let mergeBase;
try {
  mergeBase = execSync(`git merge-base HEAD ${baseBranch}`, { encoding: 'utf-8' }).trim();
} catch {
  console.error(`Error: Could not find merge base between HEAD and ${baseBranch}.`);
  process.exit(1);
}

const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim() || 'HEAD';
const commitCount = execSync(`git rev-list --count ${mergeBase}..HEAD`, { encoding: 'utf-8' }).trim();

console.error(`Branch: ${currentBranch}`);
console.error(`Base: ${baseBranch} (merge-base: ${mergeBase.slice(0, 8)})`);
console.error(`Commits: ${commitCount}`);

if (statOnly) {
  const stat = execSync(`git diff ${mergeBase}..HEAD --stat`, { encoding: 'utf-8' });
  console.log(stat);
  process.exit(0);
}

// Generate full diff excluding lock files
const excludePatterns = [
  ':(exclude)package-lock.json',
  ':(exclude)yarn.lock',
  ':(exclude)pnpm-lock.yaml',
  ':(exclude)Cargo.lock',
  ':(exclude)Gemfile.lock',
  ':(exclude)poetry.lock',
  ':(exclude)*.toml',
];

const diff = execSync(
  `git diff ${mergeBase}..HEAD -- . ${excludePatterns.map(p => `'${p}'`).join(' ')}`,
  { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
);

if (!diff.trim()) {
  console.error('No changes found between current branch and base.');
  process.exit(0);
}

const id = randomBytes(4).toString('hex');
const tmpFile = join(tmpdir(), `self-review-diff-${id}.txt`);
writeFileSync(tmpFile, diff);
console.log(`Diff written to ${tmpFile} (${Buffer.byteLength(diff)} bytes)`);
