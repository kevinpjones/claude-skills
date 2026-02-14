#!/usr/bin/env node
/**
 * Validates commit messages against the required format.
 *
 * Format: <JIRA-ISSUE-ID>/<TYPE>/<description-kebab-case>
 *
 * Usage:
 *   validate-commit-message.mjs <message>
 *   validate-commit-message.mjs --check-last
 *
 * Valid types: feat, fix, chore, perf, security, refactor, test
 *
 * Examples:
 *   PROJ-123/feat/add-user-authentication
 *   BILLING-456/fix/invoice-calculation-error
 *   CORE-789/refactor/simplify-data-pipeline
 *
 * Exit codes:
 *   0 - Valid
 *   1 - Invalid or usage error
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const VALID_TYPES = ['feat', 'fix', 'chore', 'perf', 'security', 'refactor', 'test'];
const COMMIT_PATTERN = /^([A-Z][A-Z0-9]+-\d+)\/(feat|fix|chore|perf|security|refactor|test)\/([a-z0-9][a-z0-9-]*[a-z0-9])$/;

function validateMessage(message) {
  // Extract subject line (first line)
  const subject = message.split('\n')[0].trim();

  const match = subject.match(COMMIT_PATTERN);

  if (!match) {
    const errors = [];
    const parts = subject.split('/');

    if (!/^[A-Z][A-Z0-9]+-\d+/.test(subject)) {
      errors.push('Missing or invalid JIRA issue ID (expected format: PROJ-123)');
    }

    if (parts.length >= 2 && !VALID_TYPES.includes(parts[1])) {
      errors.push(`Invalid type "${parts[1]}". Valid types: ${VALID_TYPES.join(', ')}`);
    }

    if (parts.length < 3 || !parts[2]) {
      errors.push('Missing description in kebab-case');
    } else if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(parts[2])) {
      errors.push('Description must be kebab-case (lowercase letters, numbers, hyphens)');
    }

    if (errors.length === 0) {
      errors.push(`Expected format: <JIRA-ID>/<TYPE>/<description-kebab-case>`);
    }

    return {
      valid: false,
      subject,
      errors,
      instructions: {
        format: '<JIRA-ID>/<TYPE>/<description-kebab-case>',
        valid_types: VALID_TYPES,
        examples: ['PROJ-123/feat/add-user-authentication', 'BILLING-456/fix/invoice-rounding-error'],
        tip: 'If the JIRA issue ID is unknown, ask the user with the AskUserQuestion tool.',
      },
    };
  }

  return {
    valid: true,
    subject,
    jira_id: match[1],
    type: match[2],
    description: match[3]
  };
}

function printUsage() {
  console.log('Usage: validate-commit-message.mjs <message>');
  console.log('       validate-commit-message.mjs --check-last');
  console.log('');
  console.log(`Valid types: ${VALID_TYPES.join(', ')}`);
  console.log('Format: <JIRA-ID>/<TYPE>/<description-kebab-case>');
  console.log('');
  console.log('Examples:');
  console.log('  PROJ-123/feat/add-user-authentication');
  console.log('  BILLING-456/fix/invoice-rounding-error');
}

// Parse args
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(args.length === 0 ? 1 : 0);
}

if (args[0] === '--check-last') {
  try {
    const { stdout } = await execAsync('git log -1 --format=%s');
    const result = validateMessage(stdout.trim());
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.valid ? 0 : 1);
  } catch (error) {
    console.error('Error reading last commit:', error.message);
    process.exit(1);
  }
} else {
  const result = validateMessage(args.join(' '));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}
