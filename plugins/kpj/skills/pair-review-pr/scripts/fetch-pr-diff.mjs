#!/usr/bin/env node
/**
 * Fetches PR diff and changed file list using the GitHub CLI.
 *
 * Uses `gh pr diff` to get the authoritative diff that GitHub considers
 * part of the PR — not the local git three-dot diff, which can include
 * unrelated changes when the branch has diverged from base.
 *
 * Usage: fetch-pr-diff.mjs [options]
 *
 * Options:
 *   --pr <number>        PR number (default: auto-detect from current branch)
 *   --stat               Show only file stats (names and line counts)
 *   --files              Show only changed file paths (one per line, JSON array)
 *   --exclude <patterns> Comma-separated glob patterns to exclude from diff output
 *   --output <file>      Write diff to file (default: random temp file). Refuses to overwrite existing files.
 *   --help               Show usage
 *
 * Default excludes: package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lockb
 *
 * Output (default): Diff written to a randomly named temp file; path printed to stdout
 * Output (--stat): JSON array of { file, additions, deletions }
 * Output (--files): JSON array of changed file paths
 */

import { spawn } from 'child_process';
import { writeFile, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
const DEFAULT_EXCLUDES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
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

/**
 * Simple glob matching for exclude patterns. Supports:
 * - Exact basename match: "package-lock.json" matches "path/to/package-lock.json"
 * - Extension wildcards: "*.toml" matches "path/to/foo.toml"
 * - Path wildcards: "test/*.snap" matches "test/foo.snap"
 */
function matchesExclude(filePath, patterns) {
  const basename = filePath.split('/').pop();
  for (const pattern of patterns) {
    if (pattern.startsWith('*.')) {
      // Extension wildcard: *.toml matches any file ending in .toml
      const ext = pattern.slice(1); // ".toml"
      if (filePath.endsWith(ext) || basename.endsWith(ext)) return true;
    } else if (pattern.includes('/')) {
      // Path pattern: compare directly
      if (filePath === pattern || filePath.endsWith('/' + pattern)) return true;
    } else {
      // Basename match: "package-lock.json"
      if (basename === pattern) return true;
    }
  }
  return false;
}

/**
 * Fetches the PR diff from GitHub using `gh pr diff`.
 * This is the authoritative diff — only files GitHub considers part of the PR.
 */
async function fetchGhDiff(prNumber) {
  const args = ['pr', 'diff'];
  if (prNumber) args.push(String(prNumber));
  args.push('--patch');

  return await runGh(args);
}

/**
 * Parses a unified diff to extract per-file stats (additions, deletions).
 */
function parseDiffStats(diffText) {
  const stats = [];
  let currentFile = null;
  let additions = 0;
  let deletions = 0;

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      // Save previous file stats
      if (currentFile) {
        stats.push({ file: currentFile, additions, deletions });
      }
      // Extract file path from "diff --git a/path b/path"
      const match = line.match(/^diff --git a\/.+ b\/(.+)$/);
      currentFile = match ? match[1] : null;
      additions = 0;
      deletions = 0;
    } else if (currentFile && line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (currentFile && line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  // Don't forget the last file
  if (currentFile) {
    stats.push({ file: currentFile, additions, deletions });
  }

  return stats;
}

/**
 * Extracts the list of changed file paths from a unified diff.
 */
function parseChangedFiles(diffText) {
  const files = [];
  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = line.match(/^diff --git a\/.+ b\/(.+)$/);
      if (match) files.push(match[1]);
    }
  }
  return files;
}

/**
 * Filters a unified diff to exclude files matching given patterns.
 * Returns the filtered diff text.
 */
function filterDiff(diffText, excludePatterns) {
  if (!excludePatterns.length) return diffText;

  const sections = [];
  let currentSection = [];
  let currentFile = null;
  let skipSection = false;

  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      // Flush previous section
      if (currentFile && !skipSection) {
        sections.push(currentSection.join('\n'));
      }
      currentSection = [line];
      const match = line.match(/^diff --git a\/.+ b\/(.+)$/);
      currentFile = match ? match[1] : null;
      skipSection = currentFile ? matchesExclude(currentFile, excludePatterns) : false;
    } else {
      currentSection.push(line);
    }
  }

  // Flush last section
  if (currentFile && !skipSection) {
    sections.push(currentSection.join('\n'));
  }

  return sections.join('\n');
}

function parseArgs(args) {
  const result = {
    stat: false,
    files: false,
    excludes: DEFAULT_EXCLUDES,
    pr: null,
    output: null,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--stat') {
      result.stat = true;
    } else if (arg === '--files') {
      result.files = true;
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
  --pr <number>        PR number (default: auto-detect from current branch)
  --stat               Show only file stats (names and line counts)
  --files              Show only changed file paths (JSON array)
  --exclude <patterns> Comma-separated glob patterns to exclude
  --output <file>      Write diff to file (default: random temp file). Refuses to overwrite.

Default excludes: ${DEFAULT_EXCLUDES.join(', ')}

Examples:
  fetch-pr-diff.mjs --stat
  fetch-pr-diff.mjs --pr 42
  fetch-pr-diff.mjs --pr 42 --files
  fetch-pr-diff.mjs --pr 42 --output /tmp/my-review-diff.txt
  fetch-pr-diff.mjs --exclude "*.test.ts,*.spec.ts"`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  try {
    // Fetch the authoritative diff from GitHub
    const rawDiff = await fetchGhDiff(opts.pr);

    if (!rawDiff.trim()) {
      console.error('No diff found. The PR may have no changed files.');
      process.exit(1);
    }

    if (opts.files) {
      // Output just the changed file paths (before exclude filtering)
      const allFiles = parseChangedFiles(rawDiff);
      console.log(JSON.stringify(allFiles, null, 2));
      return;
    }

    if (opts.stat) {
      // Parse stats from the raw diff (before exclude filtering)
      const stats = parseDiffStats(rawDiff);
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    // Filter excluded files and write the diff
    const filteredDiff = filterDiff(rawDiff, opts.excludes);
    const outputPath = opts.output || join(tmpdir(), `pr-review-diff-${randomBytes(4).toString('hex')}.txt`);

    if (opts.output) {
      try {
        await access(outputPath);
        console.error(`Error: output file already exists: ${outputPath}`);
        console.error('Use a different path or remove the existing file to avoid overwriting a concurrent session.');
        process.exit(1);
      } catch {
        // File doesn't exist — safe to write
      }
    }

    await writeFile(outputPath, filteredDiff);

    // Also output the changed file list to a companion file for scope enforcement
    const changedFiles = parseChangedFiles(rawDiff);
    const filesPath = outputPath.replace(/\.txt$/, '-files.json');
    await writeFile(filesPath, JSON.stringify(changedFiles, null, 2));

    console.log(`Diff written to ${outputPath} (${filteredDiff.length} bytes)`);
    console.log(`Changed files list written to ${filesPath} (${changedFiles.length} files)`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
