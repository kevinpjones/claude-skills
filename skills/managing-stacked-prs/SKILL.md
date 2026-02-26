---
name: managing-stacked-prs
description: Use this skill when creating, managing, or working with stacked pull requests using native git and GitHub CLI. This includes initializing PR stacks, adding branches to a stack, adopting existing stacked branches and PRs, rebasing stacked branches, force pushing stack branches safely, creating PRs with correct base branch targets, addressing review feedback across a stack, managing stack metadata via commit trailers, checking CI status across a PR stack, squash-merging stacked PRs in order, and managing test-split stacks where tests are separated from implementation. Trigger keywords include "stacked PRs", "PR stack", "stack branches", "stacked pull requests", "rebase stack", "stack review comments", "adopt stack", "import stack", "existing stack", "CI status", "check status", "failing checks", "required checks", "stack CI", "split tests", "test branch", "collapse stack", "merge stack", "squash merge stack", "merge PRs in order", "merge all PRs".
---

# Managing Stacked Pull Requests

Create, manage, and maintain stacked PR workflows using native git commands and GitHub CLI (`gh`). Stack relationships are tracked through git commit trailers.

## Stack Orientation

A stack is ordered from **bottom** (closest to `main`) to **top** (furthest from `main`):

```
main ← branch-1 (bottom) ← branch-2 ← branch-3 (top)
```

| Term | Meaning |
|------|---------|
| **Bottom** | The first branch, targeting `main` directly |
| **Top** | The last branch, furthest from `main` |
| **Above** | Closer to the top (further from `main`) |
| **Below** | Closer to the bottom (closer to `main`) |
| **Parent** | The branch directly below (e.g., branch-1 is branch-2's parent) |
| **Child** | The branch directly above (e.g., branch-2 is branch-1's child) |

Operations like rebasing, merging, and creating PRs proceed **bottom-to-top** — from `main` outward.

## Prerequisites

1. **Git 2.32+** (for `--trailer` flag):
   ```bash
   git --version
   ```

2. **GitHub CLI** installed and authenticated:
   ```bash
   gh --version && gh auth status
   ```

3. Must be in a git repository with a remote.

4. **Companion skills** (some workflows reference these):
   - `addressing-pr-comments` — for replying to and resolving PR review threads
   - `updating-pr-description` — for writing PR descriptions in Problem/Solution format

## Stack Metadata Format

Stack relationships are tracked via git commit trailers on the initial commit of each branch:

| Trailer | Purpose | Example |
|---------|---------|---------|
| `Stack-Id` | Unique stack identifier | `auth-system` |
| `Stack-Parent-Branch` | Branch this one is based on | `main` |
| `Stack-Position` | Ordinal position in stack (1-based) | `2` |

**Example commit with trailers:**
```bash
git commit -m "PROJ-123: Add user model" \
  --trailer "Stack-Id: auth-system" \
  --trailer "Stack-Parent-Branch: main" \
  --trailer "Stack-Position: 1"
```

Resulting commit message:
```
PROJ-123: Add user model

Stack-Id: auth-system
Stack-Parent-Branch: main
Stack-Position: 1
```

## Branch Naming Convention

All branches MUST follow: `<ISSUE-ID>/<TYPE>/<kebab-cased-summary>`

**Valid types:** `feat`, `fix`, `chore`, `perf`, `security`, `refactor`

**Examples:**
- `PROJ-123/feat/add-user-authentication`
- `BILLING-456/fix/invoice-rounding-error`
- `CORE-789/refactor/simplify-data-pipeline`

**No issue number:** If the user specifies there is no issue, drop the issue prefix:
- `feat/add-user-authentication`
- `fix/invoice-rounding-error`

## Commit Message Format

All commit message subjects MUST follow: `<ISSUE-ID>: <Imperative mood description>`

**Examples:**
- `PROJ-123: Add user authentication`
- `BILLING-456: Fix invoice rounding error`
- `CORE-789: Simplify data pipeline`

**No issue number:** Drop the prefix entirely — just use the imperative mood subject:
- `Add user authentication`
- `Fix invoice rounding error`

Validate before committing:
```bash
~/.claude/skills/managing-stacked-prs/scripts/validate-commit-message.mjs "PROJ-123: Add user model"
```

If the issue ID is unknown, prompt the user with the AskUserQuestion tool.

Only the **initial commit** on each branch needs stack trailers. Subsequent commits on the same branch use the standard message format without trailers.

---

## Workflow 1: Initialize a New Stack

Create the foundation branch of a new PR stack.

### Step 1: Gather Parameters

Ask the user (if not already provided):
- **Stack name** (kebab-case, e.g., `auth-system`)
- **Base branch** (usually `main` or `develop`)
- **First branch description** (e.g., `user-model`)
- **Issue ID** (e.g., `PROJ-123`) — if the user says there is no issue, omit the issue prefix from branch names and commit messages

### Step 2: Create the First Branch

```bash
git checkout main
git pull origin main
git checkout -b "PROJ-123/feat/user-model"
```

Branch naming convention: `<ISSUE-ID>/<TYPE>/<kebab-cased-summary>` (or `<TYPE>/<kebab-cased-summary>` with no issue)

### Step 3: Make Changes and Commit

After the user makes changes:

```bash
git add <specific-files>
git commit -m "PROJ-123: Add user model" \
  --trailer "Stack-Id: auth-system" \
  --trailer "Stack-Parent-Branch: main" \
  --trailer "Stack-Position: 1"
```

Validate:
```bash
~/.claude/skills/managing-stacked-prs/scripts/validate-commit-message.mjs --check-last
```

### Step 4: Push

```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
```

---

## Workflow 2: Add a Branch to an Existing Stack

### Step 1: Detect Current Stack

```bash
~/.claude/skills/managing-stacked-prs/scripts/detect-stack.mjs
```

The script outputs the stack structure and `instructions.next_steps.add_branch` with the exact command to create the next branch.

### Step 2: Create and Commit

Follow the `add_branch` command from the output. After making changes, commit with stack trailers:

```bash
git add <specific-files>
git commit -m "PROJ-123: Add session tokens" \
  --trailer "Stack-Id: auth-system" \
  --trailer "Stack-Parent-Branch: PROJ-123/feat/login-api" \
  --trailer "Stack-Position: 3"
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
```

---

## Workflow 3: Insert a Branch at the Bottom or Middle of a Stack

This is the **most dangerous stacked PR operation**. Inserting a new branch can bring unwanted intermediate commits from main if existing branches were forked from a different point.

### Step 1: Create the New Branch from Main

```bash
git checkout main && git pull origin main
git checkout -b new-bottom-branch
# ... make changes and commit with trailers ...
git push -u origin new-bottom-branch
```

### Step 2: Rebase the Old Bottom Branch onto the New Branch

```bash
git rebase --onto new-bottom-branch main old-branch-1
```

### Step 3: Verify Immediately

```bash
git log --oneline new-bottom-branch..old-branch-1
```

If unexpected commits appear, use the **cherry-pick escape hatch**: reset to parent tip and cherry-pick only desired commits from `origin/old-branch-1`. See `./stack-rebase-and-sync-workflow.md`.

### Step 4: Cascade Rebase and Push

```bash
git rebase --onto old-branch-1 old-branch-1@{1} old-branch-2
git push --force-with-lease origin old-branch-1 old-branch-2
```

### Step 5: Update PR Base Branches

```bash
gh pr edit <old-branch-1-pr> --base new-bottom-branch
```

### Step 6: Create PR for New Branch

```bash
gh pr create --base main --head new-bottom-branch --title "..." --body "..."
```

---

## Workflow 4: Apply Changes to a Specific Branch

When changes need to go to a branch that is NOT the current branch.

### Option A: Uncommitted Changes (Use Stash)

```bash
git stash save "transfer: <description>"
git checkout <target-branch>
git stash pop
git add <specific-files>
git commit -m "<ISSUE-ID>: <Imperative mood description>"
```

### Option B: Already-Committed Changes (Use Cherry-Pick)

```bash
git checkout <target-branch>
git cherry-pick <commit-hash>
# Return to original branch and remove the commit (only if it was the most recent):
git checkout <original-branch>
git reset --hard HEAD~1
```

If the target branch has branches above it in the stack, you MUST rebase the stack (Workflow 5).

---

## Workflow 5: Rebase and Synchronize Stack

After changes to any branch, rebase all branches above it to maintain stack integrity.

### The `@{1}` Refspec Technique (Preferred)

When a single branch was modified, use `@{1}` to precisely replay only each child's commits:

```bash
# After modifying branch-1:
git rebase --onto branch-1 branch-1@{1} branch-2
git rebase --onto branch-2 branch-2@{1} branch-3
```

`branch@{1}` refers to the branch's previous ref state, ensuring only the child's own commits are replayed.

### Simple Cascade (Alternative)

```bash
git checkout <child-branch>
git rebase --empty=drop <parent-branch>
```

### After Every Rebase: Verify Each Layer

**Essential safety check** - use exclusive commit ranges to confirm each branch has only its own commits:

```bash
git log --oneline main..branch-1
git log --oneline branch-1..branch-2
git log --oneline branch-2..branch-3
```

If unexpected commits appear, use the cherry-pick escape hatch (see `./stack-rebase-and-sync-workflow.md`).

For the full rebase procedure, `--onto` patterns, inserting branches, rebasing onto updated `main`, and the cherry-pick escape hatch, see `./stack-rebase-and-sync-workflow.md`. For conflict strategies, see `./conflict-resolution-guide.md`.

---

## Workflow 6: Force Push Stack Branches

After rebasing, push all branches in a single command using `--force-with-lease`:

```bash
git fetch origin
git push --force-with-lease origin branch-1 branch-2 branch-3
```

**CRITICAL:** Always use `--force-with-lease` (never `--force`) to prevent overwriting changes pushed by others.

### Update PR Comment Links After Force Push

Force pushes invalidate commit hashes in "Resolved by [hash](link)" comment replies. Update them for each affected PR:

```bash
~/.claude/skills/managing-stacked-prs/scripts/update-pr-comment-links.mjs <owner> <repo> <pr_number>
```

The script outputs `instructions.tip` for handling multiple PRs. See `./managing-pr-comment-links-after-force-push.md` for manual fallback.

---

## Workflow 7: Create PRs for Stack

Create GitHub PRs bottom-to-top, each targeting its parent branch. Include a **PR Stack** numbered list (not a table) at the bottom of each PR body — GitHub auto-renders `#123` references with title and status in list items.

For the full procedure including PR template detection, stack list format, and `#TBD` placeholder workflow, see `./creating-stack-prs-workflow.md`.

---

## Workflow 8: Address PR Review Comments Across Stack

### Step 1: Gather Context and Fetch Comments

```bash
REPO_INFO=$(PAGER= gh repo view --json owner,name -q '.owner.login + " " + .name')
OWNER=$(echo $REPO_INFO | cut -d' ' -f1)
REPO=$(echo $REPO_INFO | cut -d' ' -f2)

# Detect stack and get PR numbers
~/.claude/skills/managing-stacked-prs/scripts/detect-stack.mjs
gh pr list --json number,headRefName -q '.[] | "\(.headRefName) \(.number)"'

# Fetch all unresolved comments
~/.claude/skills/managing-stacked-prs/scripts/fetch-stack-pr-comments.mjs $OWNER $REPO <pr1> <pr2> <pr3>
```

The fetch script outputs `instructions.workflow` with the complete bottom-up processing steps. Follow those instructions to address, rebase, push, and resolve threads.

For the complete bottom-up review cycle with cross-branch comments and batching, see `./stack-pr-review-workflow.md`.

---

## Workflow 9: Adopt an Existing Stack

Import existing stacked branches that already have PRs but lack stack metadata trailers.

```bash
# From a PR number
~/.claude/skills/managing-stacked-prs/scripts/adopt-stack.mjs 42

# From a branch name
~/.claude/skills/managing-stacked-prs/scripts/adopt-stack.mjs --branch feature-auth-login
```

The script discovers the full stack by walking the GitHub PR chain and outputs:
- The stack structure with branch names, descriptions, parents, positions, and PR titles
- A suggested stack name with a `naming_tip` explaining how to pick a better one
- Ready-to-run `adoption_commands` (with `STACK_NAME` placeholder)
- Step-by-step `instructions.steps` for completing the adoption

Follow the `instructions` in the script output to confirm with the user and complete the adoption.

**Pre-commit hook note:** Adoption uses `git commit --allow-empty` which can trigger pre-commit hooks (lint, prettier) on unrelated files. If a hook fails on files unrelated to the adoption, use `--no-verify` for the empty adoption commits only:

```bash
git commit --allow-empty --no-verify -m "chore: adopt into stack" \
  --trailer "Stack-Id: <name>" \
  --trailer "Stack-Parent-Branch: <parent>" \
  --trailer "Stack-Position: <n>"
```

---

## Workflow 10: Check Stack CI Status

Check CI status across all PRs in the stack, distinguishing required from optional checks.

```bash
~/.claude/skills/managing-stacked-prs/scripts/check-stack-ci-status.mjs <pr1> <pr2> <pr3>
```

The script outputs per-PR check summaries and a stack-level status. Follow `instructions.blocking` to identify which PRs have failing required checks. Optional failures are listed in `instructions.non_blocking`.

---

## Workflow 11: Manage Test-Split Stacks

When tests are split from implementation into a separate branch for review manageability, CI on the implementation branch may fail because existing tests reference old types/fields/behaviors.

Before fixing, categorize each failure:

- **Fix on impl branch**: Mechanical changes — renamed imports, type casts, mock discriminators, formatting
- **Do NOT fix on impl branch**: Behavioral rewrites — changed assertions, new test cases, rewritten logic
- **Collapse the stack**: When fixes are too extensive and the tests PR is approved — `gh pr merge <tests-pr> --squash`

For the full categorization guide, decision tree, fix procedures, and collapse workflow, see `./test-split-stack-workflow.md`.

---

## Workflow 12: Squash-Merge a Stack

Merge all PRs in a stack sequentially from bottom to top using squash merges.

**CRITICAL: NEVER use `--delete-branch`** with `gh pr merge` for stacked PRs. Deleting a branch auto-closes all PRs targeting it as their base. Auto-closed PRs **cannot be reopened** — they must be recreated, requiring fresh approval.

**Merge cycle** (repeat for each PR, bottom-to-top):
1. `gh pr merge <pr> --squash` (no `--delete-branch`)
2. `git fetch origin main`
3. `git rebase --onto origin/main <old-base-commit> <next-branch>` — skip squashed commits
4. `gh pr edit <next-pr> --base main`
5. Cascade rebase remaining branches above, force push
6. Wait for CI, then merge next

For the full step-by-step procedure, complete 4-PR example, and recovery from accidental `--delete-branch`, see `./squash-merging-stack-workflow.md`.

---

## Scripts Reference

All scripts are in `~/.claude/skills/managing-stacked-prs/scripts/` and are directly executable (no `node` prefix needed).

| Script | Purpose |
|--------|---------|
| `detect-stack.mjs` | Detect stack structure from commit trailers |
| `validate-commit-message.mjs` | Validate commit message format |
| `fetch-stack-pr-comments.mjs` | Fetch unresolved comments across all stack PRs |
| `adopt-stack.mjs` | Discover existing stack from GitHub PR relationships |
| `update-pr-comment-links.mjs` | Fix commit links in PR comments after force push |
| `check-stack-ci-status.mjs` | Check CI status across all PRs in a stack |

**Shared scripts** from the `addressing-pr-comments` skill:

| Script | Purpose |
|--------|---------|
| `respond-to-thread.mjs` | Reply to and/or resolve PR review threads |
| `fetch-unresolved-threads.mjs` | Fetch threads for a single PR |

---

## Troubleshooting

### Stack Detection Fails
- Ensure commits have `Stack-Id` trailers: `git log --format=%B -5`
- Verify branches are local: `git branch`
- Re-run with explicit stack ID: `detect-stack.mjs --stack-id auth-system`

### Rebase Conflicts
See `./conflict-resolution-guide.md` for detailed strategies.

### Force Push Rejected
Another contributor pushed changes. Run `git fetch origin` then `git log origin/<branch>..<branch>` to inspect, merge their changes, and retry.

### Git Too Old for --trailer
Write trailers manually in the commit body (blank line after subject, then `Stack-Id: ...` etc.).

### PR Base Branch Is Wrong
Run `gh pr edit <number> --base <correct-base-branch>`.

### PR Auto-Closed After Merge
If `--delete-branch` was used during a squash merge, child PRs are auto-closed and **cannot be reopened**. See "Recovery: Auto-Closed PR Due to Branch Deletion" above. The PR must be recreated and will need fresh approval.

---

## Supporting Files

- `./squash-merging-stack-workflow.md` - Full merge procedure, 4-PR example, and auto-closed PR recovery
- `./creating-stack-prs-workflow.md` - PR creation procedure, stack list format, and template detection
- `./stack-rebase-and-sync-workflow.md` - Detailed rebase procedures, `@{1}` technique, `--onto` patterns, inserting branches, cherry-pick escape hatch
- `./stack-pr-review-workflow.md` - Full PR review cycle across stacked branches
- `./conflict-resolution-guide.md` - Rebase conflict resolution strategies and recovery
- `./managing-pr-comment-links-after-force-push.md` - Updating commit links in PR comments after force pushes
- `./test-split-stack-workflow.md` - Managing stacks where tests are split from implementation for reviewability
- `./scripts/` - Executable Node.js scripts for stack operations
