# Stack Rebase and Synchronization Workflow

Detailed procedures for rebasing stacked branches after changes to branches closer to `main`. Derived from real-world stacked PR management patterns.

**Orientation:** Bottom = first branch (targeting `main`). Top = last branch. "Above" = further from `main`. "Below" = closer to `main`.

## When to Rebase

Rebase the stack whenever:
- A commit is added to any branch that has branches above it (closer to the top)
- A commit is amended or squashed on any branch other than the top
- The base branch (`main`) is updated and you want to incorporate changes
- After cherry-picking or moving commits between branches
- After inserting a new branch at the bottom or middle of the stack

## Rebase Techniques

### Technique 1: Simple Cascade Rebase

Use when the stack is already clean and you just need to propagate a change upward.

```bash
# For each branch above the modified one (bottom to top):
git checkout <child-branch>
git rebase --empty=drop <parent-branch>
```

The `--empty=drop` flag drops both duplicate commits (same patch-id) and empty commits.

### Technique 2: The `@{1}` Refspec Technique (Preferred for Single-Branch Modifications)

When you've modified a base branch (e.g., added a commit, renamed a file), the `@{1}` refspec refers to **the previous state of that branch ref**. This allows precise `--onto` rebasing that only replays the child branch's own commits.

```bash
# After modifying branch-1 (e.g., added a commit):
git rebase --onto branch-1 branch-1@{1} branch-2
git rebase --onto branch-2 branch-2@{1} branch-3
```

**How it works:**
- `--onto branch-1` = new base (current state of branch-1)
- `branch-1@{1}` = old base (state of branch-1 before modification)
- `branch-2` = branch to rebase

This replays exactly the commits between the old base and the child branch tip onto the new base. It's the cleanest technique because it never picks up unwanted intermediate commits.

### Technique 3: `--onto` with Explicit Base (For Inserting Branches)

When inserting a new branch at the bottom of a stack:

```bash
# After creating new-bottom-branch from main:
git rebase --onto new-bottom-branch main old-branch-1
git rebase --onto old-branch-1 old-branch-1@{1} old-branch-2
```

**WARNING:** This is the most dangerous operation. See "Inserting a Branch at the Bottom" below.

## Full Rebase Procedure

### Step 1: Detect the Stack

```bash
~/.claude/skills/managing-stacked-prs/scripts/detect-stack.mjs
```

### Step 2: Identify the Starting Point

Determine which branch was modified. All branches **above** it must be rebased.

### Step 3: Rebase Each Branch Sequentially (Bottom to Top)

Use the `@{1}` technique when a single branch was modified:

```bash
# Branch 1 was modified, rebase branches 2 and 3:
git rebase --onto branch-1 branch-1@{1} branch-2
git rebase --onto branch-2 branch-2@{1} branch-3
```

Or use simple cascade when the modification is straightforward:

```bash
git checkout branch-2
git rebase --empty=drop branch-1

git checkout branch-3
git rebase --empty=drop branch-2
```

### Step 4: Verify Each Layer

**This is the essential safety check.** Use exclusive commit ranges to verify each layer contains only its own commits:

```bash
echo "=== Branch 1 (from main) ==="
git log --oneline main..branch-1

echo "=== Branch 2 (from branch 1) ==="
git log --oneline branch-1..branch-2

echo "=== Branch 3 (from branch 2) ==="
git log --oneline branch-2..branch-3
```

Each range should show ONLY the commits belonging to that branch. If you see commits from other branches or unexpected PRs, the stack is contaminated (see "Cherry-Pick Escape Hatch" below).

### Step 5: Force Push All Affected Branches

Push all branches in a single command (efficient, reduces round trips):

```bash
git push --force-with-lease origin branch-1 branch-2 branch-3
```

### Step 6: Update PR Comment Links (If Applicable)

Force pushes invalidate commit hashes in PR reply comments. If you've previously posted "Resolved by [hash](link)" comments, update them:

```bash
~/.claude/skills/managing-stacked-prs/scripts/update-pr-comment-links.mjs <owner> <repo> <pr_number>
```

See `./managing-pr-comment-links-after-force-push.md` for details.

## Rebasing onto Updated Base Branch

When `main` has been updated and you want to incorporate those changes:

```bash
# Update main
git fetch origin main

# Rebase bottom branch onto main
git rebase origin/main branch-1

# Cascade upward
git rebase branch-1 branch-2
git rebase branch-2 branch-3

# Verify each layer
git log --oneline origin/main..branch-1
git log --oneline branch-1..branch-2
git log --oneline branch-2..branch-3

# Push all at once
git push --force-with-lease origin branch-1 branch-2 branch-3
```

**Conflict note:** When other PRs have been squash-merged to main since your stack was created, you may see conflicts during rebase because the squash-merged commits have different hashes than the originals. If the conflicts show "HEAD is empty, incoming has content", resolve with:
```bash
git checkout --theirs <conflicting-file>
git add <conflicting-file>
git rebase --continue
```

If a commit is entirely redundant (already in main via squash merge):
```bash
git rebase --skip
```

## Inserting a Branch at the Bottom of a Stack

This is the **most dangerous stacked PR operation**. When inserting a new branch at the bottom (e.g., adding a migration before existing code), the existing branches may have been forked from a different point in main's history. Rebasing `--onto` the new branch can bring along unwanted intermediate commits from main.

### Safe Procedure

1. **Create the new bottom branch from latest main:**
   ```bash
   git checkout -b new-bottom-branch main
   # ... make changes and commit ...
   git push -u origin new-bottom-branch
   ```

2. **Rebase the old bottom branch onto the new branch:**
   ```bash
   git rebase --onto new-bottom-branch main old-branch-1
   ```

3. **Verify immediately** - check for unwanted commits:
   ```bash
   git log --oneline new-bottom-branch..old-branch-1
   ```
   If you see extra commits that don't belong to `old-branch-1`, the rebase picked up intermediate commits. Use the cherry-pick escape hatch below.

4. **Cascade rebase up the stack:**
   ```bash
   git rebase --onto old-branch-1 old-branch-1@{1} old-branch-2
   ```

5. **Update existing PR base branches:**
   ```bash
   gh pr edit <old-branch-1-pr> --base new-bottom-branch
   ```

6. **Create a PR for the new bottom branch:**
   ```bash
   gh pr create --base main --head new-bottom-branch --title "..." --body "..."
   ```

## Cherry-Pick Escape Hatch

When a rebase contaminates a branch with unwanted commits, the cleanest fix is to reset and cherry-pick only the desired commits:

```bash
# Identify the commits that belong to this branch
git log --oneline origin/<branch>   # see commits on remote (pre-rebase)

# Reset the branch to its parent's tip
git checkout -B <branch> <parent-branch>

# Cherry-pick only the desired commits from the remote version
git cherry-pick <commit-hash-1>
git cherry-pick <commit-hash-2>

# If cherry-pick conflicts (e.g., squash-merged dependency):
git checkout --theirs <file>
git add <file>
git cherry-pick --continue --no-edit
```

**When to use this:**
- After a `rebase --onto` brings in extra commits
- When `git log parent..branch` shows unexpected commits
- When a first rebase attempt makes things worse

**Key insight:** Cherry-pick from `origin/<branch>` (the remote pre-rebase version) rather than the local branch, since the local branch may have already been corrupted by a bad rebase.

## Handling Duplicate Commits

Git's `rebase` automatically skips commits with the same patch-id as upstream. The `--empty=drop` flag drops commits that become empty.

If duplicates persist during rebase:
```bash
git rebase --skip
```

## Verifying Stack Integrity

The **exclusive commit range** check is the primary verification tool:

```bash
# Must show ONLY branch-1's own commits:
git log --oneline main..branch-1

# Must show ONLY branch-2's own commits:
git log --oneline branch-1..branch-2

# Must show ONLY branch-3's own commits:
git log --oneline branch-2..branch-3
```

If any range shows commits from other branches, the stack needs cleanup (see cherry-pick escape hatch).

Also verify overall structure:
```bash
git branch -vv
```

## Edge Cases

### Squash-Merged PRs Cause Phantom Commits
When a dependency PR has been squash-merged to main, its commits exist in the stack branch history but with different hashes than on main. During rebase, git may not recognize them as duplicates because squash merging creates a single commit with a different hash. Resolve by skipping or cherry-picking.

### Branch Has No Unique Commits
```bash
git checkout <branch>
git reset --hard <parent-branch>
```

### Rebase Produces Merge Conflicts
See `./conflict-resolution-guide.md` for resolution strategies.

### Stack Has Gaps (Missing Branch)
1. Rebase the orphaned branch onto the branch below the gap
2. Update stack metadata trailers if using them
3. Update PR base branch: `gh pr edit <number> --base <new-parent>`
