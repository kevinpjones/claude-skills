# Squash-Merging a Stack Workflow

Merge all PRs in a stack sequentially from bottom (first PR, targeting `main`) to top (last PR). Each PR must be merged, and the next branch rebased onto `main`, before proceeding.

## CRITICAL: Never Use `--delete-branch`

**NEVER** pass `--delete-branch` to `gh pr merge` for stacked PRs. When a branch is deleted, GitHub **auto-closes** all PRs that use it as their base branch. Auto-closed PRs **cannot be reopened** — they must be recreated as new PRs, requiring fresh approval.

## Step 1: Verify All PRs Are Approved

```bash
~/.claude/skills/managing-stacked-prs/scripts/check-stack-ci-status.mjs <pr1> <pr2> <pr3>
gh pr view <pr1> --json reviewDecision -q '.reviewDecision'
gh pr view <pr2> --json reviewDecision -q '.reviewDecision'
```

All PRs should be `APPROVED` before starting.

## Step 2: Merge the First (Bottom) PR

```bash
gh pr merge <pr1> --squash
```

Do NOT use `--delete-branch`. Do NOT merge multiple PRs in parallel — each must complete before the next can proceed.

## Step 3: Rebase the Next Branch onto Main

After each merge, the next PR's base branch is now stale. Rebase it onto updated `main` using `--onto` to skip the squashed commits:

```bash
git fetch origin main

# Find the last commit of the just-merged branch (the old base for the next branch)
git log --oneline <just-merged-branch> -1
# This gives you the commit hash to skip from

# Rebase next branch, skipping the squashed commits
git rebase --onto origin/main <old-base-commit> <next-branch>
```

The `<old-base-commit>` is the tip of the just-merged branch before rebase — the commit that the next branch was forked from. Using `--onto` ensures only the next branch's own commits are replayed onto `main`.

## Step 4: Update PR Base and Push

```bash
# Update the PR to target main directly
gh pr edit <next-pr> --base main

# Force push the rebased branch
git push --force-with-lease origin <next-branch>
```

## Step 5: Cascade Rebase Remaining Branches

If there are branches above the one you just rebased, cascade the rebase:

```bash
git rebase --onto <next-branch> <next-branch>@{1} <branch-after-next>
git push --force-with-lease origin <branch-after-next>
```

## Step 6: Wait for CI, Then Merge

```bash
# Option A: Wait for checks and merge manually
gh pr checks <next-pr> --watch
gh pr merge <next-pr> --squash

# Option B: Enable auto-merge (merges when CI passes)
gh pr merge <next-pr> --squash --auto
```

## Step 7: Repeat for Remaining PRs

Repeat steps 3-6 for each remaining PR in the stack, working bottom-to-top.

## Complete Example (4-PR Stack)

```bash
# Merge PR #1 (bottom of stack)
gh pr merge 101 --squash

# Rebase PR #2 onto main
git fetch origin main
git rebase --onto origin/main <pr1-tip> branch-2
gh pr edit 102 --base main
# Also cascade rebase branches 3 and 4
git rebase --onto branch-2 branch-2@{1} branch-3
git rebase --onto branch-3 branch-3@{1} branch-4
git push --force-with-lease origin branch-2 branch-3 branch-4

# Merge PR #2
gh pr merge 102 --squash --auto
# ... wait for CI ...

# Rebase PR #3 onto main
git fetch origin main
git rebase --onto origin/main <pr2-tip> branch-3
gh pr edit 103 --base main
git rebase --onto branch-3 branch-3@{1} branch-4
git push --force-with-lease origin branch-3 branch-4

# Merge PR #3
gh pr merge 103 --squash --auto
# ... wait for CI ...

# Rebase PR #4 onto main
git fetch origin main
git rebase --onto origin/main <pr3-tip> branch-4
gh pr edit 104 --base main
git push --force-with-lease origin branch-4

# Merge PR #4
gh pr merge 104 --squash --auto
```

---

## Recovery: Auto-Closed PR Due to Branch Deletion

If a PR was auto-closed because its base branch was deleted (e.g., `--delete-branch` was used), you **cannot** reopen it. You must recreate the PR.

### Step 1: Rebase the Orphaned Branch onto Main

```bash
git fetch origin main
# Find the commit to skip from (tip of the deleted base branch)
git log --oneline <orphaned-branch>
# Rebase onto main, skipping the merged parent's commits
git rebase --onto origin/main <parent-tip-commit> <orphaned-branch>
git push --force-with-lease origin <orphaned-branch>
```

### Step 2: Recreate the PR

```bash
# Get the old PR's title and body for reference
gh pr view <old-pr-number> --json title,body

# Create a new PR targeting main
gh pr create --base main --head <orphaned-branch> \
  --title "<same title>" --body "<same body>"
```

### Step 3: Update Stack References

Update the stack lists in all other PRs to reference the new PR number:

```bash
# For each remaining PR in the stack:
BODY=$(gh pr view <pr-number> --json body -q '.body' | sed 's/#<old-number>/#<new-number>/g')
gh pr edit <pr-number> --body "$BODY"
```

### Step 4: Update Child PR Bases

Any PR that targeted the old branch needs its base updated:

```bash
gh pr edit <child-pr> --base <orphaned-branch>
```

The new PR will need fresh approval since GitHub treats it as a new PR.