# Safe Stack Reorder Algorithm

## Contents
- Why naive reorder causes auto-close
- How GitHub auto-close works
- The safe algorithm
- Prerequisite: dependency check
- Computing `--onto` arguments
- Edge cases
- Worked examples

---

## Why Naive Reorder Causes Auto-Close

Given stack: A (bottom→main) → B → C → D (top)

**What goes wrong** if you rebase A on top of D first and push:

1. `git rebase --onto D main A` — A's commit history now includes all of B, C, D's commits
2. `git push --force-with-lease origin A` — GitHub receives the new A, which includes B, C, D's head commits
3. GitHub checks: are B's, C's, D's head commits now in their base branch (A)? Yes.
4. GitHub **auto-closes** B, C, and D as "merged". They **cannot be reopened**.

The root cause: rebasing from top-down means the upper branches get their commits absorbed into lower branches' histories before the PR base tracking is updated.

---

## How GitHub Auto-Close Works

GitHub auto-closes a PR when a push to the PR's **base branch** causes the **head branch's commits** to appear in the base branch history.

Specifically: if PR has `head=B, base=A`, and you push a new commit to `A` that contains all of `B`'s commits, GitHub treats it as merged and closes the PR.

This is intentional behavior — GitHub is detecting that "the work in this PR has been incorporated into its base." But in a reorder, we don't want this; we're restructuring the stack, not merging.

**The decoupling insight:** If you update the PR base to a branch that does NOT contain B's commits before rebasing, GitHub never sees the condition that triggers auto-close.

---

## Prerequisite: Dependency Check

Reordering is only safe when the branches being repositioned are **independent** — they must not touch the same files. If branch A and branch B both modify `src/payments/transfer.ts`, and you move B past A, the rebase will either conflict or silently produce incorrect code.

**Rule: ABORT if any file appears in both branches' own diffs.**

Check file overlap for each pair that will swap relative order:

```bash
# Get files changed exclusively in branch-A (not inherited from its parent)
git diff --name-only origin/<old-parent-of-A>..origin/branch-A | sort > /tmp/files-A.txt

# Get files changed exclusively in branch-B
git diff --name-only origin/<old-parent-of-B>..origin/branch-B | sort > /tmp/files-B.txt

# Check overlap
comm -12 /tmp/files-A.txt /tmp/files-B.txt
```

If `comm -12` produces any output: **STOP**. Tell the user which files overlap and which branches conflict. The branches have a dependency and cannot be safely reordered.

If `comm -12` produces no output: the branches are file-independent and safe to reorder.

> Note: This check detects file-level overlap only. Semantic dependencies (e.g., one branch exports a function that another imports) will not be caught here. If the user suspects such dependencies exist, they should review the changes manually before proceeding.

---

## The Safe Algorithm

### Phase 1: Update GitHub PR Bases (Before Any Git Operations)

For each PR, set its new base branch on GitHub:

```bash
gh pr edit <PR-number> --base <new-base-branch>
```

At this point, branches still have their old commits, so no PR will be auto-closed. GitHub's check looks at commit history, and the old history doesn't satisfy the auto-close condition for the new base assignments.

### Phase 2: Capture Old Branch Tips

```bash
# Before any rebase, capture current SHAs
OLD_A=$(git rev-parse origin/branch-A)
OLD_B=$(git rev-parse origin/branch-B)
OLD_C=$(git rev-parse origin/branch-C)
OLD_D=$(git rev-parse origin/branch-D)
```

These are needed as the `<upstream>` argument in `git rebase --onto`. They tell git "drop commits that were already in <upstream> (the old parent)".

### Phase 3: Rebase Bottom-to-Top with `--onto`

Process branches in **new bottom-to-top order**:

```
git rebase --onto <new-parent> <old-parent-tip> <branch>
```

This command: "Take `<branch>`, drop commits that were already in `<old-parent-tip>`, and replay them on top of `<new-parent>`."

### Phase 4: Force Push All

```bash
git push --force-with-lease origin <all-branches>
```

Safe because PR bases were already updated in Phase 1.

---

## Computing `--onto` Arguments

Given:
- `original_order`: the old stack, index 0 = bottom
- `new_order`: the desired stack, index 0 = new bottom
- `base`: the root branch (usually `main`)

For each branch at position `i` in `new_order`:

```
new_parent = base                      if i == 0
           = new_order[i-1]            otherwise

old_parent_tip = base                  if original_position(branch) == 0
               = rev-parse(original_order[original_position(branch) - 1])  otherwise
```

The rebase command:
```
git rebase --onto <new_parent> <old_parent_tip> <branch>
```

**Important:** `old_parent_tip` must be captured BEFORE any rebase begins, because rebasing a lower branch changes its SHA. Use the values captured in Phase 2.

---

## Edge Cases

### Partial Reorder

Only some branches change position, but branches above a moved branch are affected. Always process the full stack using the algorithm above — branches whose relative order doesn't change relative to their neighbors will rebase cleanly with no commit changes.

### Branch with No PR

If a branch in the stack has no associated PR, skip the `gh pr edit` step for it but still include it in the git rebase sequence.

### Uncommitted Changes

Stash before starting:
```bash
git stash
# ... complete entire reorder ...
git stash pop
```

### Conflicts During Rebase

If `git rebase` stops with a conflict:
1. Resolve the conflict
2. `git add <resolved-files>`
3. `git rebase --continue`
4. Do NOT `git rebase --abort` unless you want to abandon the entire reorder and start over

If you abort mid-sequence, you must also revert the GitHub base changes made in Phase 1 before retrying.

### Circular Reorder (All Branches Move)

Example: [A, B, C, D] → [D, A, B, C] (rotate by 1). Works identically with the algorithm. D becomes the new bottom (parent=main), A is based on D, B on A, C on B.

### Swapping Two Adjacent Branches

Example: [A, B, C] → [A, C, B]. Only B and C change. GitHub bases: B→C, C→A. Rebases: C onto A (dropping old-A-tip), B onto C (dropping old-C-tip).

### Swapping Two Non-Adjacent Branches

Example: [A, B, C, D] → [A, D, C, B]. Process as the full new order: D on A, C on D, B on C. Branches that end up between them (C) must be rebased even though its "position" in the middle doesn't change.

---

## Worked Examples

### Example 1: Move Bottom Branch to Top

Original: [A, B, C, D] (A→main, B→A, C→B, D→C)
New:      [B, C, D, A] (B→main, C→B, D→C, A→D)

**Phase 1 - Update GitHub bases:**
```bash
gh pr edit <PR-B> --base main
gh pr edit <PR-C> --base branch-B
gh pr edit <PR-D> --base branch-C
gh pr edit <PR-A> --base branch-D
```

**Phase 2 - Capture tips:**
```bash
OLD_A=$(git rev-parse origin/branch-A)  # old bottom; parent was main
OLD_B=$(git rev-parse origin/branch-B)  # parent was A
OLD_C=$(git rev-parse origin/branch-C)  # parent was B
OLD_D=$(git rev-parse origin/branch-D)  # parent was C
```

**Phase 3 - Rebase (new-bottom-to-new-top):**
```bash
# B: new parent=main, old parent tip=OLD_A (A was B's old parent)
git checkout branch-B && git rebase --onto main $OLD_A branch-B

# C: new parent=branch-B, old parent tip=OLD_B
git checkout branch-C && git rebase --onto branch-B $OLD_B branch-C

# D: new parent=branch-C, old parent tip=OLD_C
git checkout branch-D && git rebase --onto branch-C $OLD_C branch-D

# A: new parent=branch-D, old parent tip=main (A was originally based on main)
git checkout branch-A && git rebase --onto branch-D main branch-A
```

**Phase 4 - Push:**
```bash
git push --force-with-lease origin branch-B branch-C branch-D branch-A
```

---

### Example 2: Move Top Branch to Bottom

Original: [A, B, C, D] (A→main)
New:      [D, A, B, C] (D→main)

**Phase 1 - Update bases:**
```bash
gh pr edit <PR-D> --base main
gh pr edit <PR-A> --base branch-D
gh pr edit <PR-B> --base branch-A
gh pr edit <PR-C> --base branch-B
```

**Phase 2 - Capture tips:**
```bash
OLD_A=$(git rev-parse origin/branch-A)
OLD_B=$(git rev-parse origin/branch-B)
OLD_C=$(git rev-parse origin/branch-C)
OLD_D=$(git rev-parse origin/branch-D)
```

**Phase 3 - Rebase (new order: D, A, B, C):**
```bash
# D: new parent=main, old parent=OLD_C (D's original parent)
git checkout branch-D && git rebase --onto main $OLD_C branch-D

# A: new parent=branch-D, old parent=main (A was originally at bottom)
git checkout branch-A && git rebase --onto branch-D main branch-A

# B: new parent=branch-A, old parent=OLD_A
git checkout branch-B && git rebase --onto branch-A $OLD_A branch-B

# C: new parent=branch-B, old parent=OLD_B
git checkout branch-C && git rebase --onto branch-B $OLD_B branch-C
```

---

### Example 3: Swap Two Middle Branches

Original: [A, B, C, D] (A→main)
New:      [A, C, B, D] (C and B swap positions)

**Phase 1 - Update bases:**
```bash
gh pr edit <PR-A> --base main          # unchanged
gh pr edit <PR-C> --base branch-A      # C's new base (was branch-B)
gh pr edit <PR-B> --base branch-C      # B's new base (was branch-A)
gh pr edit <PR-D> --base branch-B      # D's new base (was branch-C)
```

**Phase 2 - Capture tips:**
```bash
OLD_A=$(git rev-parse origin/branch-A)
OLD_B=$(git rev-parse origin/branch-B)
OLD_C=$(git rev-parse origin/branch-C)
```

**Phase 3 - Rebase (new order: A, C, B, D):**
```bash
# A: unchanged (still bottom, still on main) — skip or verify
# git checkout branch-A && git rebase --onto main main branch-A  # no-op

# C: new parent=branch-A, old parent=OLD_B (C was on top of B)
git checkout branch-C && git rebase --onto branch-A $OLD_B branch-C

# B: new parent=branch-C, old parent=OLD_A (B was on top of A)
git checkout branch-B && git rebase --onto branch-C $OLD_A branch-B

# D: new parent=branch-B, old parent=OLD_C (D was on top of C)
git checkout branch-D && git rebase --onto branch-B $OLD_C branch-D
```

**Phase 4 - Push:**
```bash
git push --force-with-lease origin branch-C branch-B branch-D
```
