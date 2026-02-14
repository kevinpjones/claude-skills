#!/usr/bin/env node
/**
 * Prerequisite checker for the addressing-pr-comments skill.
 * Verifies gh CLI is installed and authenticated.
 *
 * Usage: node check-prerequisites.mjs
 *
 * Exit codes:
 *   0 - All prerequisites met
 *   1 - gh CLI not installed
 *   2 - gh CLI not authenticated
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const INSTALL_INSTRUCTIONS = {
  darwin: 'brew install gh',
  linux: 'See https://github.com/cli/cli/blob/trunk/docs/install_linux.md',
  win32: 'winget install GitHub.cli  OR  choco install gh'
};

async function checkGhInstalled() {
  try {
    const { stdout } = await execAsync('gh --version');
    const version = stdout.split('\n')[0];
    return { installed: true, version };
  } catch {
    return { installed: false, version: null };
  }
}

async function checkGhAuthenticated() {
  try {
    const { stdout } = await execAsync('gh auth status 2>&1');
    // gh auth status outputs to stderr on success, but exec captures it
    return { authenticated: true, details: stdout };
  } catch (error) {
    // gh auth status exits non-zero if not authenticated
    return { authenticated: false, details: error.stderr || error.message };
  }
}

async function checkJqInstalled() {
  try {
    const { stdout } = await execAsync('jq --version');
    return { installed: true, version: stdout.trim() };
  } catch {
    return { installed: false, version: null };
  }
}

async function main() {
  console.log('Checking prerequisites for addressing-pr-comments skill...\n');

  const results = {
    gh: await checkGhInstalled(),
    ghAuth: null,
    jq: await checkJqInstalled()
  };

  // Check gh installation
  if (!results.gh.installed) {
    console.log('gh CLI: NOT INSTALLED');
    const platform = process.platform;
    const instruction = INSTALL_INSTRUCTIONS[platform] || INSTALL_INSTRUCTIONS.linux;
    console.log(`\nTo install gh CLI:\n  ${instruction}\n`);
    console.log('After installation, authenticate with:\n  gh auth login\n');
    process.exit(1);
  }
  console.log(`gh CLI: ${results.gh.version}`);

  // Check gh authentication
  results.ghAuth = await checkGhAuthenticated();
  if (!results.ghAuth.authenticated) {
    console.log('gh auth: NOT AUTHENTICATED');
    console.log('\nTo authenticate, run:\n  gh auth login\n');
    process.exit(2);
  }
  console.log('gh auth: Authenticated');

  // Check jq installation (warn but don't fail)
  if (!results.jq.installed) {
    console.log('jq: NOT INSTALLED (recommended for JSON processing)');
    console.log('  Install with: brew install jq (macOS) or apt install jq (Linux)');
  } else {
    console.log(`jq: ${results.jq.version}`);
  }

  console.log('\nAll prerequisites met!');

  // Output JSON summary for programmatic use
  console.log('\n--- JSON Summary ---');
  console.log(JSON.stringify({
    ready: true,
    gh: results.gh,
    ghAuth: { authenticated: results.ghAuth.authenticated },
    jq: results.jq
  }, null, 2));

  process.exit(0);
}

main().catch(error => {
  console.error('Error checking prerequisites:', error.message);
  process.exit(1);
});
