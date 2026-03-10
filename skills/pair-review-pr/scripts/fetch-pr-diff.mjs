#!/usr/bin/env node
/**
 * Fetches PR diff and changed file list for review.
 *
 * Usage: fetch-pr-diff.mjs [options]
 *
 * Options:
 *   --base <branch>      Base branch to diff against (default: auto-detect from PR)
 *   --stat               Show only file stats (names and line counts)
 *   --exclude <patterns> Comma-separated glob patterns to exclude
 *   --pr <number>        PR number (auto-detects base branch)
 *   --output <file>      Write diff to file instead of stdout
 *   --help               Show usage
 *
 * Default excludes: package-lock.json, *.toml, *.yaml, *.json, *.md
 *
 * Output (default): Full diff content
 * Output (--stat): JSON array of { file, additions, deletions }
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';

const execAsync = promisify(exec);

const DEFAULT_EXCLUDES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  '*.toml',
];

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

async function getBaseBranch(prNumber) {
  const args = ['pr', 'view', '--json', 'baseRefName', '-q', '.baseRefName'];
  if (prNumber) args.splice(2, 0, String(prNumber));

  const stdout = await runGh(args);
  return stdout.trim();
}

async function getDiffStat(base) {
  const { stdout } = await execAsync(`git diff ${base}...HEAD --numstat`);
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [additions, deletions, file] = line.split('\t');
      return {
        file,
        additions: additions === '-' ? 0 : parseInt(additions, 10),
        deletions: deletions === '-' ? 0 : parseInt(deletions, 10),
      };
    });
}

async function getDiff(base, excludePatterns) {
  const excludeArgs = excludePatterns.map(p => `':(exclude)${p}'`).join(' ');
  const { stdout } = await execAsync(
    `git diff ${base}...HEAD -- . ${excludeArgs}`,
    { maxBuffer: 50 * 1024 * 1024 }
  );
  return stdout;
}

function parseArgs(args) {
  const result = {
    base: null,
    stat: false,
    excludes: DEFAULT_EXCLUDES,
    pr: null,
    output: null,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--base') {
      result.base = args[++i];
    } else if (arg === '--stat') {
      result.stat = true;
    } else if (arg === '--exclude') {
      result.excludes = args[++i].split(',').map(s => s.trim());
    } else if (arg === '--pr') {
      result.pr = args[++i];
    } else if (arg === '--output') {
      result.output = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    i++;
  }

  return result;
}

function printUsage() {
  console.log(`Usage: fetch-pr-diff.mjs [options]

Options:
  --base <branch>      Base branch to diff against (default: auto-detect from PR)
  --stat               Show only file stats (names and line counts)
  --exclude <patterns> Comma-separated glob patterns to exclude
  --pr <number>        PR number (auto-detects base branch)
  --output <file>      Write diff to file instead of stdout

Examples:
  fetch-pr-diff.mjs --stat
  fetch-pr-diff.mjs --pr 42 --output /tmp/pr-diff.txt
  fetch-pr-diff.mjs --base main --exclude "*.test.ts,*.spec.ts"`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  try {
    const base = opts.base || await getBaseBranch(opts.pr);

    if (opts.stat) {
      const stats = await getDiffStat(base);
      console.log(JSON.stringify(stats, null, 2));
    } else {
      const diff = await getDiff(base, opts.excludes);
      if (opts.output) {
        await writeFile(opts.output, diff);
        console.log(`Diff written to ${opts.output} (${diff.length} bytes)`);
      } else {
        process.stdout.write(diff);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
