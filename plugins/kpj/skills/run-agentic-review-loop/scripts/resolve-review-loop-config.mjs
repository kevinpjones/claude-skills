#!/usr/bin/env node
/**
 * Resolves the review-loop configuration and writes it to a file the other
 * scripts read with --config.
 *
 * Precedence (highest first):
 *   1. --override '<json>'            values from the skill arguments
 *   2. <repo-root>/.claude/review-loop.json
 *   3. default-reviewer-config.json   (next to this script)
 *
 * Objects merge key by key; arrays and scalars replace.
 *
 * Usage: resolve-review-loop-config.mjs [--override '<json>'] [--repo-root <dir>] [--out <file>]
 *
 * Output (stdout): JSON { config, sources, out }
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { parseCliArgs, fail } from './github-cli.mjs';

const DEFAULTS_PATH = fileURLToPath(new URL('./default-reviewer-config.json', import.meta.url));
const REPO_CONFIG_RELATIVE = '.claude/review-loop.json';

const TRIGGER_TYPES = ['comment', 'request-reviewer', 'none'];
const COMPLETION_TYPES = ['comment-match', 'review-submitted'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return merged;
}

function validate(config) {
  const errors = [];
  if (!Array.isArray(config.botLogins) || config.botLogins.length === 0) {
    errors.push('botLogins must be a non-empty array');
  }
  if (!TRIGGER_TYPES.includes(config.trigger?.type)) {
    errors.push(`trigger.type must be one of ${TRIGGER_TYPES.join(', ')}`);
  }
  if (config.trigger?.type === 'comment' && !config.trigger.body) {
    errors.push('trigger.body is required when trigger.type is "comment"');
  }
  if (config.trigger?.type === 'request-reviewer' && !config.trigger.reviewer) {
    errors.push('trigger.reviewer is required when trigger.type is "request-reviewer"');
  }
  if (!COMPLETION_TYPES.includes(config.completionSignal?.type)) {
    errors.push(`completionSignal.type must be one of ${COMPLETION_TYPES.join(', ')}`);
  }
  if (config.completionSignal?.type === 'comment-match') {
    try {
      new RegExp(config.completionSignal.pattern);
    } catch (error) {
      errors.push(`completionSignal.pattern is not a valid regex: ${error.message}`);
    }
  }
  for (const key of ['pollIntervalSeconds', 'timeoutMinutes', 'maxIterations']) {
    if (!Number.isFinite(config[key]) || config[key] <= 0) {
      errors.push(`${key} must be a positive number`);
    }
  }
  return errors;
}

function findRepoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const { flags } = parseCliArgs(process.argv.slice(2), { booleans: ['help'] });
  if (flags.help) {
    console.log("Usage: resolve-review-loop-config.mjs [--override '<json>'] [--repo-root <dir>] [--out <file>]");
    return;
  }

  const sources = ['defaults'];
  let config = JSON.parse(await readFile(DEFAULTS_PATH, 'utf8'));

  const repoRoot = flags['repo-root'] || findRepoRoot();
  const repoConfigPath = repoRoot ? join(repoRoot, REPO_CONFIG_RELATIVE) : null;
  if (repoConfigPath && existsSync(repoConfigPath)) {
    config = deepMerge(config, JSON.parse(await readFile(repoConfigPath, 'utf8')));
    sources.push(repoConfigPath);
  }

  if (flags.override) {
    let override;
    try {
      override = JSON.parse(flags.override);
    } catch (error) {
      fail(`--override is not valid JSON: ${error.message}`, 2);
    }
    config = deepMerge(config, override);
    sources.push('arguments');
  }

  const errors = validate(config);
  if (errors.length > 0) fail(`invalid review-loop config:\n  - ${errors.join('\n  - ')}`, 2);

  if (flags.out) await writeFile(flags.out, JSON.stringify(config, null, 2));
  console.log(JSON.stringify({ config, sources, out: flags.out || null }, null, 2));
}

main().catch((error) => fail(error.message));
