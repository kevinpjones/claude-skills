#!/usr/bin/env node
/**
 * Validates commit messages against the required format.
 *
 * Format: <ISSUE-ID>: <Imperative mood subject>
 *   or:  <Imperative mood subject>  (when no issue number)
 *
 * Usage:
 *   validate-commit-message.mjs <message>
 *   validate-commit-message.mjs --check-last
 *
 * Examples:
 *   PROJ-123: Add user authentication
 *   BILLING-456: Fix invoice calculation error
 *   Add user authentication  (no issue)
 *
 * Exit codes:
 *   0 - Valid
 *   1 - Invalid or usage error
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Matches: ISSUE-123: Imperative mood subject
const COMMIT_WITH_ISSUE = /^([A-Z][A-Z0-9]+-\d+): (.+)$/;
// Matches: Imperative mood subject (starts with uppercase letter)
const COMMIT_WITHOUT_ISSUE = /^[A-Z][a-zA-Z].*$/;

function validateMessage(message) {
  // Extract subject line (first line)
  const subject = message.split('\n')[0].trim();

  // Try matching with issue ID first
  const issueMatch = subject.match(COMMIT_WITH_ISSUE);

  if (issueMatch) {
    const description = issueMatch[2];

    // Validate the description starts with an uppercase letter (imperative mood convention)
    if (!/^[A-Z]/.test(description)) {
      return {
        valid: false,
        subject,
        issue_id: issueMatch[1],
        errors: ['Description must start with an uppercase letter (imperative mood, e.g., "Add", "Fix", "Update")'],
        instructions: {
          format: '<ISSUE-ID>: <Imperative mood description>',
          examples: ['PROJ-123: Add user authentication', 'BILLING-456: Fix invoice rounding error'],
          tip: 'Start with an imperative verb: Add, Fix, Update, Remove, Refactor, etc.',
        },
      };
    }

    return {
      valid: true,
      subject,
      issue_id: issueMatch[1],
      description,
    };
  }

  // Check if it looks like the old slash format (common mistake)
  if (/^[A-Z][A-Z0-9]+-\d+\//.test(subject)) {
    return {
      valid: false,
      subject,
      errors: [
        'Commit message uses the branch naming format (slashes) instead of the commit message format (colon).',
        'Branch format: ISSUE-ID/<type>/<kebab-description>',
        'Commit format: ISSUE-ID: <Imperative mood description>',
      ],
      instructions: {
        format: '<ISSUE-ID>: <Imperative mood description>',
        examples: ['PROJ-123: Add user authentication', 'BILLING-456: Fix invoice rounding error'],
        tip: 'Use a colon after the issue ID, not slashes. The type (feat/fix/etc.) belongs in the branch name, not the commit message.',
      },
    };
  }

  // Try matching without issue ID (valid when user has no issue number)
  if (COMMIT_WITHOUT_ISSUE.test(subject)) {
    return {
      valid: true,
      subject,
      issue_id: null,
      description: subject,
    };
  }

  // Invalid format
  const errors = [];

  if (/^[A-Z][A-Z0-9]+-\d+[^:]/.test(subject)) {
    errors.push('Found an issue ID but missing colon separator. Use "ISSUE-ID: Description".');
  } else if (/^[a-z]/.test(subject)) {
    errors.push('Subject must start with an uppercase letter (imperative mood, e.g., "Add", "Fix", "Update").');
  } else {
    errors.push('Expected format: <ISSUE-ID>: <Imperative mood description>');
  }

  return {
    valid: false,
    subject,
    errors,
    instructions: {
      format: '<ISSUE-ID>: <Imperative mood description>',
      format_no_issue: '<Imperative mood description>',
      examples: [
        'PROJ-123: Add user authentication',
        'BILLING-456: Fix invoice rounding error',
        'Add user authentication  (no issue)',
      ],
      tip: 'If the issue ID is unknown, ask the user with the AskUserQuestion tool.',
    },
  };
}

function printUsage() {
  console.log('Usage: validate-commit-message.mjs <message>');
  console.log('       validate-commit-message.mjs --check-last');
  console.log('');
  console.log('Format: <ISSUE-ID>: <Imperative mood description>');
  console.log('   or:  <Imperative mood description>  (no issue)');
  console.log('');
  console.log('Examples:');
  console.log('  PROJ-123: Add user authentication');
  console.log('  BILLING-456: Fix invoice rounding error');
  console.log('  Add user authentication');
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
