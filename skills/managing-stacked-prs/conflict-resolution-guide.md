# Conflict Resolution Guide for Stacked PRs

Strategies for resolving rebase conflicts that arise during stacked PR management.

**Orientation:** Bottom = first branch (targeting `main`). Top = last branch. "Lower" = closer to `main`. "Upper" = further from `main`.

## Why Conflicts Happen in Stacks

Conflicts occur when changes in a branch overlap with changes in its parent. Common scenarios:

1. **Same file modified in adjacent branches** - Both branches touch the same code region
2. **Refactoring in a lower branch** - Renames or moves that affect code in upper branches
3. **Cherry-picked changes** - Moving commits between branches can create overlapping patches
4. **Base branch updates** - Rebasing onto updated `main` introduces upstream changes

## Conflict Resolution During Rebase

### Step 1: Identify Conflicting Files

When a rebase stops with conflicts:

```bash
git status
```

Look for files marked as "both modified" or "unmerged".

### Step 2: Understand the Conflict

For each conflicting file, examine the conflict markers:

```
<<<<<<< HEAD
// This is the version from the parent branch (upstream)
=======
// This is the version from the current branch being rebased
>>>>>>> commit-message
```

Read both versions to understand what changed and why.

### Step 3: Resolve

Choose the appropriate resolution strategy:

#### Strategy A: Accept Parent's Version
If the change in the parent branch supersedes the current branch's version:
```bash
git checkout --theirs <file>
git add <file>
```

#### Strategy B: Keep Current Branch's Version
If the current branch's changes should take precedence:
```bash
git checkout --ours <file>
git add <file>
```

#### Strategy C: Manual Merge
If both changes need to be combined, edit the file to remove conflict markers and merge the code manually:

1. Open the conflicting file
2. Remove `<<<<<<<`, `=======`, and `>>>>>>>` markers
3. Combine or choose the appropriate code
4. Save the file

```bash
git add <file>
```

### Step 4: Continue the Rebase

```bash
git rebase --continue
```

If there are more commits with conflicts, repeat steps 1-3 for each.

### Step 5: Skip a Commit (If Appropriate)

If a commit becomes entirely redundant after conflict resolution:

```bash
git rebase --skip
```

**Use sparingly** - only when the commit's changes are fully incorporated in the parent.

## Aborting a Rebase

If the conflicts are too complex or you need to reconsider the approach:

```bash
git rebase --abort
```

This returns the branch to its pre-rebase state. No changes are lost.

## Common Conflict Scenarios

### Scenario 1: Import Statement Conflicts

**Cause:** Multiple branches add imports to the same file.

**Resolution:** Combine all imports, removing duplicates. Sort alphabetically if the project convention requires it.

### Scenario 2: Adjacent Line Changes

**Cause:** Branch 1 modifies line 10, Branch 2 modifies line 11.

**Resolution:** Usually keep both changes. Git sometimes flags these as conflicts even though they don't truly overlap.

### Scenario 3: File Renamed in Parent

**Cause:** Parent branch renamed a file that the current branch also modifies.

**Resolution:**
1. Check if the renamed file exists: `git log --diff-filter=R --summary -5`
2. Apply the current branch's changes to the new filename
3. Remove the old file reference

### Scenario 4: Deleted File Conflict

**Cause:** Parent branch deleted a file that the current branch modifies.

**Resolution:**
1. Determine if the deletion is intentional
2. If yes, remove the file: `git rm <file>` and adjust dependent code
3. If no, restore it: `git checkout --ours <file> && git add <file>`

### Scenario 5: Cherry-Pick Residue

**Cause:** A commit was cherry-picked between branches, creating overlapping patches during rebase.

**Resolution:** Git usually detects identical patches and skips them. If it doesn't:
1. Check if the conflicting commit is the same as one already in the parent: `git log --oneline <parent>`
2. If duplicate, skip: `git rebase --skip`

## Recovery from Failed Rebases

### State: Rebase In Progress

If you're stuck in a rebase state:
```bash
# Check current state
git status

# Option 1: Continue if conflicts are resolved
git rebase --continue

# Option 2: Abort and start over
git rebase --abort
```

### State: Detached HEAD After Rebase Issues

```bash
# Find the branch reference
git reflog

# Reset to the pre-rebase state
git checkout <branch-name>
git reset --hard <pre-rebase-commit>
```

### State: Stack Is Inconsistent

If a rebase succeeded on branch 2 but failed on branch 3:

1. Branch 2 is already rebased - leave it
2. Fix branch 3's rebase:
   ```bash
   git checkout auth-system-3-session-tokens
   git rebase --abort   # if rebase is still in progress
   git rebase --empty=drop auth-system-2-login-api
   ```
3. Resolve conflicts and continue

### State: Accidentally Force Pushed Bad State

If you force-pushed a branch with bad rebase results:

```bash
# Find the pre-push commit in reflog
git reflog <branch-name>

# Reset to the good state
git checkout <branch-name>
git reset --hard <good-commit-hash>

# Force push the corrected state
git push --force-with-lease origin <branch-name>
```

**Note:** `--force-with-lease` may reject this if someone else pushed in between. In that case, coordinate with your team before using `--force`.

## Prevention Tips

1. **Keep branches focused** - Each branch should have a clear, narrow scope to minimize overlapping changes
2. **Avoid modifying shared code** - If multiple branches need to change the same file, try to isolate changes to different regions
3. **Rebase frequently** - Small, frequent rebases are easier to resolve than large ones
4. **Commit atomically** - Small, focused commits are easier to rebase than large ones
5. **Review diffs before rebasing** - `git diff <parent>..HEAD` to understand what will be replayed
