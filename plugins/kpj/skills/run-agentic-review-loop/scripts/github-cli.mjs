/**
 * Shared helpers for calling the GitHub CLI from the review-loop scripts.
 */

import { spawn } from 'child_process';

export function runGh(args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data; });
    proc.stderr.on('data', (data) => { stderr += data; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `gh exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });

    if (input !== undefined) proc.stdin.write(input);
    proc.stdin.end();
  });
}

export async function ghJson(args, options) {
  return JSON.parse(await runGh(args, options));
}

/** GET a paginated REST list endpoint and return all items as one array. */
export async function ghList(endpoint) {
  const pages = await ghJson(['api', '--paginate', '--slurp', endpoint]);
  return pages.flat();
}

export async function graphql(query, variables = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value === null || value === undefined) continue;
    args.push(typeof value === 'number' ? '-F' : '-f', `${key}=${value}`);
  }
  const response = await ghJson(args);
  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }
  return response.data;
}

/** Compare logins across REST ("name[bot]") and GraphQL ("name") forms. */
export function normalizeLogin(login) {
  return (login || '').toLowerCase().replace(/\[bot\]$/, '');
}

export function isBotLogin(login, botLogins) {
  const normalized = normalizeLogin(login);
  return botLogins.some((bot) => normalizeLogin(bot) === normalized);
}

export async function getHeadSha(owner, repo, prNumber) {
  const pr = await ghJson(['api', `repos/${owner}/${repo}/pulls/${prNumber}`]);
  return pr.head.sha;
}

/** Parse "<owner> <repo> <pr> --flag value --switch" style arguments. */
export function parseCliArgs(argv, { booleans = [] } = {}) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (booleans.includes(name)) {
      flags[name] = true;
    } else {
      flags[name] = argv[++i];
    }
  }
  return { positional, flags };
}

export function fail(message, code = 1) {
  console.error(`Error: ${message}`);
  process.exit(code);
}
