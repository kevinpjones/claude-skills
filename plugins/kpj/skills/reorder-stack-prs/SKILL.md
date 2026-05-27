---
name: reorder-stack-prs
description: Safely reorder, swap, move, or reorganize branches in a stacked pull request workflow without triggering GitHub's auto-close behavior. Use when the user wants to reorder PRs in a stack, move a branch to a different position, swap two stacked PRs, or change the order of stacked pull requests.
allowed-tools:
  - Bash
  - Read
  - WebFetch
---

# Reordering Stacked Pull Requests Safely

Reorder branches in a PR stack without triggering GitHub's auto-close behavior.

## The Core Safety Rule

**Update GitHub PR base branches FIRST, then rebase.** Never rebase-and-push before updating bases on GitHub or PRs will be auto-closed and cannot be reopened.

See [reference/safe-reorder-algorithm.md](reference/safe-reorder-algorithm.md) for the full explanation of why this matters.

## Stack Orientation

```
main ← branch-1 (bottom) ← branch-2 ← branch-3 (top)
```

Operations proceed **bottom-to-top** (from `main` outward).

---

## Workflow

### Step 1: Detect the Current Stack

```bash
~/.claude/skills/manage-stacked-pr/scripts/detect-stack.mjs
```

If detect-stack.mjs is unavailable, reconstruct manually:

```bash
# List PRs and their bases
gh pr list --state open --json number,title,headRefName,baseRefName \
  --template '{{range .}}{{.number}} {{.headRefName}} → {{.baseRefName}}{{"\n"}}{{end}}'
```

Present the current stack order to the user, bottom to top. Example:

```
Current stack (bottom → top):
  1. branch-A  →  main      (PR #10)
  2. branch-B  →  branch-A  (PR #11)
  3. branch-C  →  branch-B  (PR #12)
  4. branch-D  →  branch-C  (PR #13)
```

### Step 2: Ask for the Desired New Order

Use AskUserQuestion to confirm the new order. Example prompt:

> "What order would you like the branches in? Please list them bottom-to-top (closest to main first). Current order: branch-A, branch-B, branch-C, branch-D."

Validate the response:
- Must be a permutation of the existing branches (no additions, no deletions)
- No duplicates
- At least 2 branches

### Step 3: Check for Cross-Branch Dependencies (ABORT if Found)

Reordering is only safe when the branches being moved are **independent** — their commits do not touch the same files as the branches they are leapfrogging. If branch A modifies `src/foo.ts` and branch B also modifies `src/foo.ts`, moving B past A will produce conflicts at best, and silently broken code at worst.

**Check for file-level overlap between each pair of branches that will change relative order:**

```bash
# For each pair (branch-X, branch-Y) where X and Y swap positions:
# Get files changed in X's own commits (not inherited from parent)
git diff --name-only <old-parent-of-X>..<branch-X>

# Get files changed in Y's own commits
git diff --name-only <old-parent-of-Y>..<branch-Y>
```

Then look for overlap:

```bash
# Example: checking if branch-A and branch-B share modified files
comm -12 \
  <(git diff --name-only origin/main..branch-A | sort) \
  <(git diff --name-only origin/branch-A..branch-B | sort)
```

**If any files appear in both sets:**
- **STOP** and inform the user with the list of conflicting files.
- Explain that those branches have a dependency and cannot be safely reordered without manual conflict resolution.
- Ask whether to proceed anyway (only if the user understands the risk) or abort.

**If no overlap is found**, the branches are independent and the reorder is safe. Confirm this to the user before continuing.

> This check is a heuristic — file overlap guarantees a problem, but no file overlap is a strong (not absolute) signal of independence. Semantic dependencies (e.g., one branch adds a function and another calls it) won't be caught by file diff alone. Use your judgment.

### Step 4: Generate the Reorder Plan

Run the helper script to compute all git and GitHub commands:

```bash
~/.claude/skills/reorder-stack-prs/scripts/reorder-stack.mjs \
  --current branch-A,branch-B,branch-C,branch-D \
  --new-order branch-B,branch-C,branch-D,branch-A \
  --base main
```

The script outputs:
1. GitHub base-update commands (Phase 1)
2. Branch tip capture commands (Phase 2)
3. Git rebase commands (Phase 3)
4. Force-push command (Phase 4)
5. Verification commands (Phase 5)

Present the full plan to the user and ask for confirmation before proceeding.

### Step 5: Update GitHub PR Base Branches (CRITICAL — Do This First)

Execute the `gh pr edit` commands from the script output (Phase 1). For each PR:

```bash
gh pr edit <PR-number> --base <new-base-branch>
```

Process each PR in the new bottom-to-top order:
- New bottom PR → base: `main`
- Each subsequent PR → base: the PR below it in the new order

Verify all base updates succeeded:
```bash
gh pr list --state open --json number,headRefName,baseRefName \
  --template '{{range .}}PR #{{.number}}: {{.headRefName}} → {{.baseRefName}}{{"\n"}}{{end}}'
```

### Step 6: Capture Old Branch Tips (Before Rebasing)

Capture the current tip SHA of every branch. These are needed as `--onto` fork points:

```bash
git fetch origin
for branch in branch-A branch-B branch-C branch-D; do
  echo "$branch: $(git rev-parse origin/$branch)"
done
```

Store these — they become `<upstream>` arguments in the rebase commands.

### Step 7: Rebase Bottom-to-Top Using `--onto`

For each branch in the new order (bottom first), run:

```
git rebase --onto <new-parent> <old-parent-tip> <branch>
```

Where:
- `<new-parent>` = the branch below it in the **new** order (or `main` for the new bottom)
- `<old-parent-tip>` = the SHA captured in Step 5 for the branch that was **originally** below it (or `main` for the original bottom)

**Example** (original: A→B→C→D, new order: B→C→D→A):

```bash
# B: was based on A, now based on main
git checkout branch-B
git rebase --onto main <old-A-tip> branch-B

# C: was based on B, now based on B (same parent, but B moved)
git checkout branch-C
git rebase --onto branch-B <old-B-tip> branch-C

# D: was based on C, now based on C (same, but C moved)
git checkout branch-D
git rebase --onto branch-C <old-C-tip> branch-D

# A: was based on main (original bottom), now based on D
git checkout branch-A
git rebase --onto branch-D main branch-A
```

Resolve any conflicts that arise before proceeding to the next branch.

### Step 8: Force Push All Branches

```bash
git push --force-with-lease origin branch-B branch-C branch-D branch-A
```

Push in any order — GitHub PR bases were already updated in Step 4, so no auto-close will occur.

### Step 9: Verify the Result

```bash
# Check PR base assignments
gh pr list --state open --json number,headRefName,baseRefName \
  --template '{{range .}}PR #{{.number}}: {{.headRefName}} → {{.baseRefName}}{{"\n"}}{{end}}'

# Verify commit ranges look correct
git log --oneline main..branch-B
git log --oneline branch-B..branch-C
git log --oneline branch-C..branch-D
git log --oneline branch-D..branch-A
```

All PRs should be open (not closed), with the correct base assignments and non-overlapping commit ranges.

### Step 10: Update Stack Metadata Trailers (If Used)

If the stack uses `Stack-Position` and `Stack-Parent-Branch` trailers on the initial commits, update them to reflect the new positions. Use `git commit --amend` on each branch's initial commit and force push again.

---

## Quick Reference: `--onto` Formula

```
git rebase --onto <new-parent> <old-parent-tip> <branch>
```

| Argument | Value |
|---|---|
| `<new-parent>` | Branch below in **new** order (or `main`) |
| `<old-parent-tip>` | SHA of branch that was below in **old** order (or `main`) |
| `<branch>` | Branch being rebased |

Capture ALL old tips before starting any rebase.

---

## Edge Cases

**Dependent branches (file overlap detected)**: Abort. Branches that modify the same files cannot be safely reordered without manual merge resolution. Inform the user which files overlap and which branches conflict. Only proceed if the user explicitly accepts the risk and is prepared to resolve conflicts during rebase.

**Partial reorder** (only some branches move): Apply the same algorithm to the full stack. Branches that don't move still need `--onto` if any branch below them changed.

**Uncommitted changes**: Stash before starting (`git stash`), unstash after all rebases complete.

**Merge conflicts during rebase**: If conflicts arise despite a clean dependency check, this indicates a semantic dependency the file-diff check missed. Resolve conflicts carefully, `git add`, then `git rebase --continue`. Alert the user that the reorder may have introduced subtle bugs and a thorough review is warranted.

**Script unavailable**: Use the formulas above manually. The critical safety step (GitHub base updates first) is the only non-negotiable part.
