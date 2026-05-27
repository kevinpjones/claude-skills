#!/usr/bin/env node
/**
 * Computes the exact git and GitHub commands to safely reorder a PR stack.
 *
 * This script does NOT execute any commands — it outputs a step-by-step plan
 * that can be reviewed and executed manually or confirmed by the user.
 *
 * Usage:
 *   reorder-stack.mjs --current A,B,C,D --new-order B,C,D,A --base main
 *   reorder-stack.mjs --current A,B,C,D --new-order B,C,D,A --base main --pr-map A:10,B:11,C:12,D:13
 *
 * Options:
 *   --current   Comma-separated current order, bottom to top (required)
 *   --new-order Comma-separated desired order, bottom to top (required)
 *   --base      Root branch (default: main)
 *   --pr-map    Optional comma-separated BRANCH:PR_NUMBER pairs for gh commands
 *   --help, -h  Show this help
 *
 * Output:
 *   A shell script / step-by-step plan with:
 *   0. Dependency check commands — ABORT if file overlap found between repositioned branches
 *   1. GitHub PR base update commands (must run first)
 *   2. Branch tip capture commands
 *   3. Git rebase --onto commands (bottom-to-top in new order)
 *   4. Force push command
 *   5. Verification commands
 */

const args = process.argv.slice(2);

// --- Argument parsing ---

function parseArgs(argv) {
  const result = {
    current: null,
    newOrder: null,
    base: 'main',
    prMap: {},
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--current' && argv[i + 1]) {
      result.current = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--new-order' && argv[i + 1]) {
      result.newOrder = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--base' && argv[i + 1]) {
      result.base = argv[++i].trim();
    } else if (arg === '--pr-map' && argv[i + 1]) {
      // Format: branch1:pr1,branch2:pr2
      for (const pair of argv[++i].split(',')) {
        const [branch, pr] = pair.split(':');
        if (branch && pr) {
          result.prMap[branch.trim()] = pr.trim();
        }
      }
    }
  }

  return result;
}

function printHelp() {
  console.log(`Usage: reorder-stack.mjs --current A,B,C,D --new-order B,C,D,A [options]

Computes safe PR stack reorder commands without executing them.

Required:
  --current   Comma-separated current branch order, bottom to top
  --new-order Comma-separated desired branch order, bottom to top

Optional:
  --base      Root branch (default: main)
  --pr-map    Comma-separated BRANCH:PR_NUMBER pairs (e.g. A:10,B:11)
              Used to generate \`gh pr edit\` commands
  --help, -h  Show this message

Example:
  reorder-stack.mjs \\
    --current branch-A,branch-B,branch-C,branch-D \\
    --new-order branch-B,branch-C,branch-D,branch-A \\
    --base main \\
    --pr-map branch-A:10,branch-B:11,branch-C:12,branch-D:13`);
}

// --- Validation ---

function validate(current, newOrder) {
  const errors = [];

  if (!current || current.length === 0) {
    errors.push('--current must be a non-empty comma-separated list of branch names');
  }
  if (!newOrder || newOrder.length === 0) {
    errors.push('--new-order must be a non-empty comma-separated list of branch names');
  }
  if (errors.length) return errors;

  if (current.length < 2) {
    errors.push('Stack must have at least 2 branches to reorder');
  }
  if (newOrder.length !== current.length) {
    errors.push(
      `--new-order has ${newOrder.length} branches but --current has ${current.length}. ` +
      'New order must be a permutation of the current order.'
    );
  }

  // Check for duplicates in new order
  const seen = new Set();
  for (const b of newOrder) {
    if (seen.has(b)) {
      errors.push(`Duplicate branch in --new-order: "${b}"`);
    }
    seen.add(b);
  }

  // Check that new order is a permutation of current
  const currentSet = new Set(current);
  for (const b of newOrder) {
    if (!currentSet.has(b)) {
      errors.push(`Branch "${b}" in --new-order is not in --current`);
    }
  }

  // Check if order is actually different
  if (errors.length === 0 && current.join(',') === newOrder.join(',')) {
    errors.push('New order is identical to current order — nothing to do');
  }

  return errors;
}

// --- Dependency check commands ---

/**
 * Generates the shell commands to check for file-level overlap between
 * pairs of branches that will change their relative order.
 *
 * Returns an array of { pairLabel, cmd } objects.
 */
function generateDependencyCheckCommands(current, newOrder, base) {
  // Find all (A, B) pairs where A and B swap relative order
  const swappedPairs = [];

  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      const branchA = current[i]; // A was below B originally
      const branchB = current[j]; // B was above A originally
      const newPosA = newOrder.indexOf(branchA);
      const newPosB = newOrder.indexOf(branchB);

      // If relative order inverted: A used to be below B, now A is above B
      if (newPosA > newPosB) {
        swappedPairs.push([branchA, branchB]);
      }
    }
  }

  if (swappedPairs.length === 0) return [];

  // For each branch, its "own" commits are from its old parent's tip to its own tip.
  // We reference origin/ branches here.
  function oldParentRef(branch) {
    const pos = current.indexOf(branch);
    return pos === 0 ? base : `origin/${current[pos - 1]}`;
  }

  return swappedPairs.map(([a, b]) => ({
    pairLabel: `${a} ↔ ${b}`,
    cmdA: `git diff --name-only ${oldParentRef(a)}..origin/${a}`,
    cmdB: `git diff --name-only ${oldParentRef(b)}..origin/${b}`,
    overlapCmd: `comm -12 <(git diff --name-only ${oldParentRef(a)}..origin/${a} | sort) <(git diff --name-only ${oldParentRef(b)}..origin/${b} | sort)`,
  }));
}

// --- Plan generation ---

/**
 * For a branch in the new order, compute:
 *   - new_parent: the branch below it in the new order (or base)
 *   - old_parent: the branch that was below it in the old order (or base)
 *
 * Returns { newParent, oldParent } where oldParent is a branch name or base.
 */
function computeParents(branch, newOrder, current, base) {
  const newPos = newOrder.indexOf(branch);
  const newParent = newPos === 0 ? base : newOrder[newPos - 1];

  const oldPos = current.indexOf(branch);
  const oldParent = oldPos === 0 ? base : current[oldPos - 1];

  return { newParent, oldParent };
}

/**
 * Determine which branches actually need rebasing.
 * A branch needs rebasing if its parent changes OR if any branch below it
 * in the new order has been rebased (changing its tip SHA).
 *
 * We always rebase all branches that appear at or above the first position
 * change to be safe.
 */
function findFirstChangedPosition(current, newOrder) {
  for (let i = 0; i < current.length; i++) {
    if (current[i] !== newOrder[i]) return i;
  }
  return current.length; // no changes (shouldn't happen after validation)
}

function generatePlan(current, newOrder, base, prMap) {
  const lines = [];

  const divider = '# ' + '─'.repeat(60);

  lines.push('#!/usr/bin/env bash');
  lines.push('# Safe PR Stack Reorder Plan');
  lines.push('# Generated by reorder-stack.mjs — review before executing!');
  lines.push('#');
  lines.push('# IMPORTANT: Execute steps IN ORDER. Do NOT skip Phase 0 (dependency check)');
  lines.push('# or Phase 1 (GitHub base updates).');
  lines.push('#');
  lines.push(`# Current order: ${current.join(' → ')}`);
  lines.push(`# New order:     ${newOrder.join(' → ')}`);
  lines.push(`# Base branch:   ${base}`);
  lines.push('');

  // ── Phase 0: Dependency check ─────────────────────────────────────────────
  const depChecks = generateDependencyCheckCommands(current, newOrder, base);
  lines.push(divider);
  lines.push('# PHASE 0: Dependency check (ABORT if overlap found)');
  lines.push('# Reordering is only safe when the repositioned branches are independent.');
  lines.push('# If any files appear in BOTH sets below, STOP and do not proceed.');
  lines.push('');

  if (depChecks.length === 0) {
    lines.push('# No pairs swap relative order — no dependency check needed.');
  } else {
    lines.push('git fetch origin');
    lines.push('');
    for (const { pairLabel, cmdA, cmdB, overlapCmd } of depChecks) {
      lines.push(`# Check overlap between: ${pairLabel}`);
      lines.push(`echo "=== Files changed in ${pairLabel.split(' ↔ ')[0]} ==="`);
      lines.push(cmdA);
      lines.push(`echo "=== Files changed in ${pairLabel.split(' ↔ ')[1]} ==="`);
      lines.push(cmdB);
      lines.push(`echo "=== OVERLAP (must be empty to proceed safely) ==="`);
      lines.push(overlapCmd);
      lines.push(`echo ""`);
      lines.push('');
    }
    lines.push('# If any overlap was printed above: STOP. Do not continue.');
    lines.push('# If all overlap sections were empty: safe to proceed.');
  }
  lines.push('');

  // ── Phase 1: GitHub PR base updates ──────────────────────────────────────
  lines.push(divider);
  lines.push('# PHASE 1: Update GitHub PR base branches');
  lines.push('# This MUST happen before any git rebase/push operations.');
  lines.push('# Updating bases first prevents GitHub from auto-closing PRs.');
  lines.push('');

  const hasPrMap = Object.keys(prMap).length > 0;
  if (!hasPrMap) {
    lines.push('# Run: gh pr list --state open --json number,headRefName,baseRefName');
    lines.push('# to find PR numbers, then run the commands below.');
    lines.push('#');
    lines.push('# Or re-run this script with --pr-map BRANCH:PR_NUMBER,... for exact commands.');
    lines.push('');
  }

  for (let i = 0; i < newOrder.length; i++) {
    const branch = newOrder[i];
    const newBase = i === 0 ? base : newOrder[i - 1];
    const prNumber = prMap[branch];

    if (prNumber) {
      lines.push(`gh pr edit ${prNumber} --base ${newBase}  # ${branch} → ${newBase}`);
    } else {
      lines.push(`gh pr edit <PR_NUMBER_FOR_${branch}> --base ${newBase}  # ${branch} → ${newBase}`);
    }
  }

  lines.push('');
  lines.push('# Verify base updates before continuing:');
  lines.push('gh pr list --state open --json number,headRefName,baseRefName \\');
  lines.push("  --template '{{range .}}PR #{{.number}}: {{.headRefName}} → {{.baseRefName}}{{\"\\n\"}}{{end}}'");
  lines.push('');

  // ── Phase 2: Capture old tips ─────────────────────────────────────────────
  lines.push(divider);
  lines.push('# PHASE 2: Capture current branch tip SHAs');
  lines.push('# Must be done before ANY git rebase (rebasing changes SHAs).');
  lines.push('');
  lines.push('git fetch origin');
  lines.push('');

  // Only capture tips that are needed as old-parent references
  // A branch needs its tip captured if it appears as an old parent for any branch
  const oldParentsNeeded = new Set();
  for (const branch of newOrder) {
    const { oldParent } = computeParents(branch, newOrder, current, base);
    if (oldParent !== base) {
      oldParentsNeeded.add(oldParent);
    }
  }

  // Use safe variable names (replace hyphens/slashes with underscores)
  function varName(branch) {
    return 'OLD_TIP_' + branch.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  }

  if (oldParentsNeeded.size === 0) {
    lines.push('# No branch tips need capturing (base branch is sufficient).');
  } else {
    for (const branch of oldParentsNeeded) {
      lines.push(`${varName(branch)}=$(git rev-parse origin/${branch})`);
    }
    lines.push('');
    lines.push('# Verify captures:');
    for (const branch of oldParentsNeeded) {
      lines.push(`echo "${varName(branch)}: $${varName(branch)}"`);
    }
  }
  lines.push('');

  // ── Phase 3: Rebase bottom-to-top ─────────────────────────────────────────
  lines.push(divider);
  lines.push('# PHASE 3: Rebase branches (new bottom-to-top order)');
  lines.push('# Uses --onto to drop old parent commits and replay on new parent.');
  lines.push('');

  // Determine which branches need rebasing (all at or above the first change)
  const firstChanged = findFirstChangedPosition(current, newOrder);
  const branchesToRebase = newOrder.slice(firstChanged);

  if (branchesToRebase.length < newOrder.length) {
    const skipped = newOrder.slice(0, firstChanged);
    lines.push(`# Branches unchanged (no rebase needed): ${skipped.join(', ')}`);
    lines.push('');
  }

  for (const branch of branchesToRebase) {
    const { newParent, oldParent } = computeParents(branch, newOrder, current, base);
    const oldParentRef = oldParent === base ? base : `$${varName(oldParent)}`;

    lines.push(`# ${branch}: parent ${oldParent} → ${newParent}`);
    lines.push(`git checkout ${branch}`);
    lines.push(`git rebase --onto ${newParent} ${oldParentRef} ${branch}`);
    lines.push('');
  }

  // ── Phase 4: Force push ────────────────────────────────────────────────────
  lines.push(divider);
  lines.push('# PHASE 4: Force push all rebased branches');
  lines.push('# Safe because GitHub PR bases were updated in Phase 1.');
  lines.push('');
  lines.push(`git push --force-with-lease origin ${branchesToRebase.join(' ')}`);
  lines.push('');

  // ── Phase 5: Verify ────────────────────────────────────────────────────────
  lines.push(divider);
  lines.push('# PHASE 5: Verify the result');
  lines.push('');
  lines.push('# Check PR base assignments (all should be open, not closed):');
  lines.push('gh pr list --state open --json number,headRefName,baseRefName \\');
  lines.push("  --template '{{range .}}PR #{{.number}}: {{.headRefName}} → {{.baseRefName}}{{\"\\n\"}}{{end}}'");
  lines.push('');
  lines.push('# Verify commit ranges are non-overlapping:');
  for (let i = 0; i < newOrder.length; i++) {
    const branch = newOrder[i];
    const parent = i === 0 ? base : newOrder[i - 1];
    lines.push(`git log --oneline ${parent}..${branch}`);
  }
  lines.push('');
  lines.push('# Check for any closed PRs (should return 0 results for stack branches):');
  const allBranches = newOrder.join('|');
  lines.push(`gh pr list --state closed --json number,headRefName \\`);
  lines.push(`  --jq '.[] | select(.headRefName | test("${allBranches}"))'`);

  return lines.join('\n');
}

// --- Summary output ──────────────────────────────────────────────────────────

function generateSummary(current, newOrder, base) {
  const lines = [];
  lines.push('');
  lines.push('# ════════════════════════════════════════════════════════════');
  lines.push('# REORDER PLAN SUMMARY');
  lines.push('# ════════════════════════════════════════════════════════════');
  lines.push('#');
  lines.push('# Current stack:');
  for (let i = 0; i < current.length; i++) {
    const parent = i === 0 ? base : current[i - 1];
    lines.push(`#   ${i + 1}. ${current[i]}  (base: ${parent})`);
  }
  lines.push('#');
  lines.push('# New stack:');
  for (let i = 0; i < newOrder.length; i++) {
    const parent = i === 0 ? base : newOrder[i - 1];
    const changed = (i === 0 ? base : current[current.indexOf(newOrder[i]) - 1] ?? base) !== parent;
    lines.push(`#   ${i + 1}. ${newOrder[i]}  (base: ${parent})${changed ? '  ← changed' : ''}`);
  }
  lines.push('#');
  lines.push('# Steps required:');
  lines.push('#   0. Dependency check (Phase 0) — ABORT if overlap found');
  lines.push('#   1. Update GitHub PR bases (Phase 1) — MUST BE BEFORE ANY GIT OPS');
  lines.push('#   2. Capture old branch tips (Phase 2)');
  lines.push('#   3. Rebase with --onto (Phase 3)');
  lines.push('#   4. Force push (Phase 4)');
  lines.push('#   5. Verify (Phase 5)');
  lines.push('# ════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

// --- Main ────────────────────────────────────────────────────────────────────

const opts = parseArgs(args);

const errors = validate(opts.current, opts.newOrder);
if (errors.length > 0) {
  console.error('Error(s):');
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  console.error('');
  console.error('Run with --help for usage.');
  process.exit(1);
}

const plan = generatePlan(opts.current, opts.newOrder, opts.base, opts.prMap);
const summary = generateSummary(opts.current, opts.newOrder, opts.base);

console.log(summary);
console.log('');
console.log(plan);
