# Stack-Wide PR Review Workflow

Detailed procedure for fetching and addressing PR review comments across all PRs in a stacked PR workflow.

**Orientation:** Bottom = first branch (targeting `main`). Top = last branch. "Bottom-up" = processing from `main` outward.

## Overview

When working with stacked PRs, review comments may exist across multiple PRs. The key insight is to **process comments bottom-up** starting from the lowest branch in the stack. This ensures that when you rebase upper branches after fixing comments on lower branches, the rebased commits incorporate all fixes cleanly.

## Prerequisites

- Stack is detected and all PRs are created
- GitHub CLI (`gh`) is authenticated
- The `address-pr-comments` skill scripts are available

## Full Workflow

### Step 1: Gather Repository and Stack Context

```bash
# Get repo owner and name
REPO_INFO=$(PAGER= gh repo view --json owner,name -q '.owner.login + " " + .name')
OWNER=$(echo $REPO_INFO | cut -d' ' -f1)
REPO=$(echo $REPO_INFO | cut -d' ' -f2)

# Detect the stack structure
~/.claude/skills/manage-stacked-pr/scripts/detect-stack.mjs
```

### Step 2: Map Branches to PR Numbers

```bash
# Get all open PRs and their branches
gh pr list --json number,headRefName -q '.[] | "\(.headRefName) \(.number)"'
```

Match each stack branch to its PR number. Store this mapping for later use.

### Step 3: Fetch All Unresolved Comments

```bash
~/.claude/skills/manage-stacked-pr/scripts/fetch-stack-pr-comments.mjs $OWNER $REPO <pr1> <pr2> <pr3>
```

This returns a JSON structure grouping unresolved threads by PR.

### Step 4: Present Aggregated View to User

Display a summary:
```
Stack Review Summary: auth-system
================================
PR #42 (PROJ-123/feat/user-model) - 3 unresolved comments
PR #43 (PROJ-123/feat/login-api) - 1 unresolved comment
PR #44 (PROJ-123/feat/session-tokens) - 0 unresolved comments

Total: 4 unresolved comments across 2 PRs
```

Ask the user if they want to proceed with addressing all comments or focus on specific PRs.

### Step 5: Process Each Branch (Bottom-Up)

Starting from the lowest branch that has comments:

#### 5a. Check Out the Branch

```bash
git checkout PROJ-123/feat/user-model
```

#### 5b. Process Each Comment on This Branch

For each unresolved thread, follow the same pattern as the `address-pr-comments` skill:

1. **Display** comment details (file, line range, author, body)
2. **Read** the referenced code
3. **Analyze** what change is requested
4. **Evaluate** validity - ask user if the suggestion should be adopted
5. **Implement** the change if approved

#### 5c. Run Quality Checks

After all changes for this branch:
```bash
npm run lint    # or project equivalent
npm test        # or project equivalent
```

Fix any failures before proceeding.

#### 5d. Commit the Changes

```bash
git add <specific-files>
git commit -m "<ISSUE-ID>: Address review feedback"
```

Validate the commit message:
```bash
~/.claude/skills/manage-stacked-pr/scripts/validate-commit-message.mjs --check-last
```

#### 5e. Rebase All Branches Above

```bash
# For each branch above (in order):
git checkout PROJ-123/feat/login-api
git rebase --empty=drop PROJ-123/feat/user-model

git checkout PROJ-123/feat/session-tokens
git rebase --empty=drop PROJ-123/feat/login-api
```

Handle any conflicts (see `./conflict-resolution-guide.md`).

#### 5f. Force Push All Affected Branches

```bash
git fetch origin
git push --force-with-lease origin PROJ-123/feat/user-model
git push --force-with-lease origin PROJ-123/feat/login-api
git push --force-with-lease origin PROJ-123/feat/session-tokens
```

#### 5g. Respond to and Resolve Threads

For each comment that was addressed:

```bash
SHORT=$(git log -1 --format=%h)
FULL=$(git log -1 --format=%H)

~/.claude/skills/address-pr-comments/scripts/respond-to-thread.mjs \
  --commit $SHORT $FULL $OWNER $REPO <pr_number> --resolve <thread_id>
```

**Note:** The commit hash should reference the fixing commit on the specific branch, not on a rebased branch.

#### 5h. Move to Next Branch

Return to step 5a for the next branch up in the stack that has unresolved comments.

### Step 6: Final Verification

After all comments are addressed:

```bash
# Re-fetch comments to verify all are resolved
~/.claude/skills/manage-stacked-pr/scripts/fetch-stack-pr-comments.mjs $OWNER $REPO <pr1> <pr2> <pr3>
```

The `total_unresolved` should be 0.

### Step 7: Summary

Provide a summary:
- Number of comments addressed per branch
- Number of commits made
- Any comments skipped (and why)
- Any remaining unresolved comments

## Handling Cross-Branch Comments

Sometimes a review comment on one PR requires changes in a different branch of the stack:

1. **Identify** which branch actually needs the change
2. **Check out** that branch (not the one with the comment)
3. **Make the fix** there
4. **Commit and rebase** the stack from that point
5. **Respond** on the original comment thread explaining where the fix was applied

Example reply:
```
Fixed in [abc1234](commit-link) on branch `PROJ-123/feat/user-model`. The change propagates to this PR via rebase.
```

## Declining Feedback on Stack PRs

When the user decides not to adopt feedback:

1. Draft a professional justification (see address-pr-comments skill for examples)
2. Use the respond script to reply:
   ```bash
   ~/.claude/skills/address-pr-comments/scripts/respond-to-thread.mjs \
     --reply "Thanks for the suggestion! We intentionally..." <thread_id>
   ```
3. Ask user whether to resolve the thread or leave it open for discussion

## Batch Operations

For stacks with many comments, consider batching:

1. Address ALL comments on branch 1 before rebasing
2. Only rebase once per branch (not per comment)
3. Batch force-push all branches once at the end of each branch's comment cycle
4. Batch respond/resolve all threads for a branch together

This minimizes the number of rebase/push cycles.
