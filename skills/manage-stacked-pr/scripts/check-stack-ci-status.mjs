#!/usr/bin/env node
/**
 * Checks CI status across all PRs in a stack, distinguishing required from optional checks.
 *
 * Required checks are determined by branch protection rules on the base branch.
 * For stacked PRs, only the bottom PR (targeting a protected branch like `main`) will
 * have checks marked as required. The script propagates the required check list from
 * the bottom PR to evaluate all PRs consistently.
 *
 * Usage: check-stack-ci-status.mjs <pr_number> [pr_number...]
 *
 * Example: check-stack-ci-status.mjs 12894 12873 12874
 *
 * Output: JSON object with stack-level status, per-PR check summaries, and instructions.
 */

import { spawn } from 'child_process';

const QUERY = `
query($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      number
      title
      headRefName
      baseRefName
      mergeable
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              state
              contexts(first: 100) {
                nodes {
                  ... on CheckRun {
                    __typename
                    name
                    status
                    conclusion
                    detailsUrl
                    isRequired(pullRequestNumber: $prNumber)
                  }
                  ... on StatusContext {
                    __typename
                    context
                    state
                    targetUrl
                    isRequired(pullRequestNumber: $prNumber)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

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

async function getRepoInfo() {
  const stdout = await runGh([
    'repo', 'view', '--json', 'owner,name', '-q', '.owner.login + " " + .name'
  ]);
  const parts = stdout.trim().split(' ');
  return { owner: parts[0], repo: parts[1] };
}

async function fetchPRChecks(owner, repo, prNumber) {
  const stdout = await runGh([
    'api', 'graphql',
    '-f', `query=${QUERY}`,
    '-f', `owner=${owner}`,
    '-f', `repo=${repo}`,
    '-F', `prNumber=${prNumber}`
  ]);

  const response = JSON.parse(stdout);

  if (response.errors) {
    throw new Error(`GraphQL errors for PR #${prNumber}: ${JSON.stringify(response.errors)}`);
  }

  const pr = response.data?.repository?.pullRequest;
  if (!pr) throw new Error(`PR #${prNumber} not found`);

  const commit = pr.commits?.nodes?.[0]?.commit;
  const rollup = commit?.statusCheckRollup;
  const contexts = rollup?.contexts?.nodes || [];

  const checks = contexts.map(ctx => {
    if (ctx.__typename === 'CheckRun') {
      return {
        name: ctx.name,
        status: normalizeCheckStatus(ctx.status, ctx.conclusion),
        required: ctx.isRequired,
        url: ctx.detailsUrl || null,
      };
    }
    // StatusContext
    return {
      name: ctx.context,
      status: normalizeStatusContext(ctx.state),
      required: ctx.isRequired,
      url: ctx.targetUrl || null,
    };
  });

  return {
    pr_number: pr.number,
    title: pr.title,
    branch: pr.headRefName,
    base: pr.baseRefName,
    rollup_state: rollup?.state || 'UNKNOWN',
    mergeable: pr.mergeable,
    checks,
  };
}

function normalizeCheckStatus(status, conclusion) {
  if (status !== 'COMPLETED') return 'pending';
  if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL' || conclusion === 'SKIPPED') return 'passing';
  return 'failing';
}

function normalizeStatusContext(state) {
  if (state === 'SUCCESS') return 'passing';
  if (state === 'PENDING' || state === 'EXPECTED') return 'pending';
  return 'failing';
}

function buildRequiredCheckSet(prResults) {
  // Collect required check names from PRs that target a protected branch
  // (PRs where at least one check has isRequired: true)
  const requiredNames = new Set();

  for (const pr of prResults) {
    const hasRequiredChecks = pr.checks.some(c => c.required);
    if (hasRequiredChecks) {
      for (const check of pr.checks) {
        if (check.required) requiredNames.add(check.name);
      }
    }
  }

  return requiredNames;
}

function categorizePR(pr, requiredCheckNames) {
  const hasAnyRequired = pr.checks.some(c => c.required);

  // If this PR has its own required checks (targets a protected branch), use them directly.
  // Otherwise, infer required status from the propagated set.
  const categorized = pr.checks.map(check => {
    const isRequired = hasAnyRequired ? check.required : requiredCheckNames.has(check.name);
    return { ...check, required: isRequired };
  });

  const required = { passing: 0, failing: 0, pending: 0 };
  const optional = { passing: 0, failing: 0, pending: 0 };
  const failingChecks = [];
  const pendingChecks = [];

  for (const check of categorized) {
    const bucket = check.required ? required : optional;
    bucket[check.status]++;

    if (check.status === 'failing') {
      failingChecks.push({ name: check.name, required: check.required, url: check.url });
    } else if (check.status === 'pending') {
      pendingChecks.push({ name: check.name, required: check.required, url: check.url });
    }
  }

  return {
    pr_number: pr.pr_number,
    title: pr.title,
    branch: pr.branch,
    base: pr.base,
    rollup_state: pr.rollup_state,
    mergeable: pr.mergeable,
    required_checks: required,
    optional_checks: optional,
    failing_checks: failingChecks,
    pending_checks: pendingChecks,
  };
}

function buildInstructions(categorizedPRs) {
  const totalPRs = categorizedPRs.length;

  const passingPRs = categorizedPRs.filter(pr =>
    pr.required_checks.failing === 0 && pr.required_checks.pending === 0
  );

  const blocking = [];
  const nonBlocking = [];

  for (const pr of categorizedPRs) {
    if (pr.required_checks.failing > 0) {
      const failingRequired = pr.failing_checks
        .filter(c => c.required)
        .map(c => c.name);
      blocking.push(
        `PR #${pr.pr_number}: ${pr.required_checks.failing} required check(s) failing (${failingRequired.join(', ')})`
      );
    }
    if (pr.required_checks.pending > 0) {
      const pendingRequired = pr.pending_checks
        .filter(c => c.required)
        .map(c => c.name);
      blocking.push(
        `PR #${pr.pr_number}: ${pr.required_checks.pending} required check(s) pending (${pendingRequired.join(', ')})`
      );
    }

    const optionalFailing = pr.failing_checks.filter(c => !c.required);
    if (optionalFailing.length > 0) {
      nonBlocking.push(
        `PR #${pr.pr_number}: ${optionalFailing.length} optional check(s) failing (${optionalFailing.map(c => c.name).join(', ')})`
      );
    }
  }

  const summaryParts = [`${passingPRs.length} of ${totalPRs} PR(s) passing.`];
  if (blocking.length > 0) {
    const failingCount = categorizedPRs.filter(pr => pr.required_checks.failing > 0).length;
    const pendingCount = categorizedPRs.filter(pr =>
      pr.required_checks.pending > 0 && pr.required_checks.failing === 0
    ).length;
    if (failingCount > 0) summaryParts.push(`${failingCount} PR(s) have failing required checks.`);
    if (pendingCount > 0) summaryParts.push(`${pendingCount} PR(s) have pending required checks.`);
  }

  return {
    summary: summaryParts.join(' '),
    blocking,
    non_blocking: nonBlocking,
    tip: 'Required checks are determined by branch protection rules on the base branch. For stacked PRs targeting non-protected branches, required checks are inferred from the bottom PR in the stack.',
  };
}

function determineStackStatus(categorizedPRs) {
  const hasFailingRequired = categorizedPRs.some(pr => pr.required_checks.failing > 0);
  if (hasFailingRequired) return 'failing';

  const hasPendingRequired = categorizedPRs.some(pr => pr.required_checks.pending > 0);
  if (hasPendingRequired) return 'pending';

  return 'passing';
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: check-stack-ci-status.mjs <pr_number> [pr_number...]');
    console.log('');
    console.log('Checks CI status across all PRs in a stack.');
    console.log('Distinguishes required from optional checks using branch protection rules.');
    console.log('');
    console.log('Example: check-stack-ci-status.mjs 12894 12873 12874');
    process.exit(args.length < 1 ? 1 : 0);
  }

  const prNumbers = args.map(Number);
  const invalid = prNumbers.find(n => isNaN(n));
  if (invalid !== undefined) {
    console.error(`Error: Invalid PR number "${args[prNumbers.indexOf(invalid)]}"`);
    process.exit(1);
  }

  try {
    const { owner, repo } = await getRepoInfo();

    // Fetch check data for all PRs in parallel
    const prResults = await Promise.all(
      prNumbers.map(pr => fetchPRChecks(owner, repo, pr))
    );

    // Sort by stack position: PRs targeting main/master/develop first (bottom of stack),
    // then by base branch chain
    const protectedBases = new Set(['main', 'master', 'develop']);
    prResults.sort((a, b) => {
      const aIsBottom = protectedBases.has(a.base) ? 0 : 1;
      const bIsBottom = protectedBases.has(b.base) ? 0 : 1;
      return aIsBottom - bIsBottom;
    });

    // Build required check set from PRs targeting protected branches
    const requiredCheckNames = buildRequiredCheckSet(prResults);

    // Categorize each PR
    const categorizedPRs = prResults.map(pr => categorizePR(pr, requiredCheckNames));

    const output = {
      stack_status: determineStackStatus(categorizedPRs),
      prs: categorizedPRs,
      instructions: buildInstructions(categorizedPRs),
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error('Error checking CI status:', error.message);
    process.exit(1);
  }
}

main();
