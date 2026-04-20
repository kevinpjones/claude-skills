#!/usr/bin/env node
/**
 * Generates GitHub permalink URLs for file references in review comments.
 * Uses commit hashes reachable via github.com to ensure links are stable.
 *
 * Usage: generate-permalink.mjs <owner> <repo> [options]
 *
 * Options:
 *   --file <path>           File path (required)
 *   --line <number>         Single line number
 *   --start-line <number>   Start of line range
 *   --end-line <number>     End of line range
 *   --ref <branch|sha>      Git ref to use (default: HEAD of default branch)
 *   --help                  Show usage
 *
 * Output: JSON with { url, markdown } where markdown is a clickable link
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

async function getDefaultBranchSha(owner, repo) {
  const stdout = await runGh([
    'api', `repos/${owner}/${repo}`, '-q', '.default_branch'
  ]);
  const defaultBranch = stdout.trim();

  const shaStdout = await runGh([
    'api', `repos/${owner}/${repo}/branches/${defaultBranch}`,
    '-q', '.commit.sha'
  ]);
  return shaStdout.trim();
}

async function resolveRef(ref) {
  try {
    const { stdout } = await execAsync(`git rev-parse ${ref}`);
    return stdout.trim();
  } catch {
    return ref; // Assume it's already a SHA
  }
}

async function verifyCommitReachable(owner, repo, sha) {
  try {
    await runGh(['api', `repos/${owner}/${repo}/commits/${sha}`, '-q', '.sha']);
    return true;
  } catch {
    return false;
  }
}

function buildUrl(owner, repo, sha, filePath, startLine, endLine) {
  let url = `https://github.com/${owner}/${repo}/blob/${sha}/${filePath}`;

  if (startLine && endLine && startLine !== endLine) {
    url += `#L${startLine}-L${endLine}`;
  } else if (startLine || endLine) {
    url += `#L${startLine || endLine}`;
  }

  return url;
}

function parseArgs(args) {
  const result = {
    owner: null,
    repo: null,
    file: null,
    line: null,
    startLine: null,
    endLine: null,
    ref: null,
  };

  const positional = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === '--file') {
      result.file = args[++i];
    } else if (arg === '--line') {
      const n = parseInt(args[++i], 10);
      result.startLine = n;
      result.endLine = n;
    } else if (arg === '--start-line') {
      result.startLine = parseInt(args[++i], 10);
    } else if (arg === '--end-line') {
      result.endLine = parseInt(args[++i], 10);
    } else if (arg === '--ref') {
      result.ref = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
    i++;
  }

  if (positional.length >= 2) {
    result.owner = positional[0];
    result.repo = positional[1];
  }

  return result;
}

function printUsage() {
  console.log(`Usage: generate-permalink.mjs <owner> <repo> [options]

Options:
  --file <path>           File path (required)
  --line <number>         Single line number
  --start-line <number>   Start of line range
  --end-line <number>     End of line range
  --ref <branch|sha>      Git ref (default: HEAD of default branch)

Examples:
  generate-permalink.mjs octocat repo --file src/index.ts --line 42
  generate-permalink.mjs octocat repo --file src/utils.ts --start-line 10 --end-line 25
  generate-permalink.mjs octocat repo --file src/lib.ts --line 5 --ref main`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.owner || !opts.repo || !opts.file) {
    console.error('Error: owner, repo, and --file are required\n');
    printUsage();
    process.exit(1);
  }

  try {
    let sha;

    if (opts.ref) {
      sha = await resolveRef(opts.ref);
    } else {
      sha = await getDefaultBranchSha(opts.owner, opts.repo);
    }

    // Verify the commit is reachable on GitHub
    const reachable = await verifyCommitReachable(opts.owner, opts.repo, sha);
    if (!reachable) {
      console.error(`Warning: Commit ${sha.slice(0, 7)} may not be reachable on GitHub.`);
      console.error('The permalink may not work until the commit is pushed.');
    }

    const url = buildUrl(opts.owner, opts.repo, sha, opts.file, opts.startLine, opts.endLine);
    const lineRef = opts.startLine && opts.endLine && opts.startLine !== opts.endLine
      ? `L${opts.startLine}-L${opts.endLine}`
      : opts.startLine
        ? `L${opts.startLine}`
        : '';

    const displayPath = lineRef ? `${opts.file}#${lineRef}` : opts.file;

    console.log(JSON.stringify({
      url,
      sha: sha.slice(0, 7),
      markdown: `[\`${displayPath}\`](${url})`,
    }, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
