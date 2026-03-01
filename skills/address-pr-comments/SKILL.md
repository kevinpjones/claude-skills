---
name: address-pr-comments
description: Use this skill when addressing, resolving, or working through PR review comments. This includes checking out a PR branch, fetching unresolved review threads, making code changes to address feedback, committing fixes, adding reply comments, and resolving threads. Trigger keywords include "PR comments", "review feedback", "address feedback", "resolve comments", "fix PR", "review threads".
argument-hint: "[PR link or number (optional if on PR branch)]"
---

# Addressing PR Comments

Systematically work through unresolved PR review comments, making code changes, committing fixes, and resolving threads with proper attribution.

# Prerequisites Check

Before starting, verify these requirements:

## 1. GitHub CLI Installation

```bash
gh --version
```

If `gh` is not installed, inform the user:
- **macOS**: `brew install gh`
- **Linux**: See https://github.com/cli/cli/blob/trunk/docs/install_linux.md
- **Windows**: `winget install GitHub.cli` or `choco install gh`

## 2. GitHub CLI Authentication

```bash
gh auth status
```

If not authenticated, instruct user to run:
```bash
gh auth login
```

## 3. PR Reference

Determine the PR to work on using one of these methods (in order of preference):

### Option A: User Provided PR
If the user provided a PR link or number in the invocation arguments, use that.

### Option B: Discover from Current Branch
If no PR was provided, check if the current branch has an associated PR:

```bash
gh pr view --json number,url -q '"\(.number) - \(.url)"'
```

If this succeeds, confirm with the user that this is the PR they want to work on.

### Option C: Prompt for PR
If neither option works, prompt the user for a PR link or number using the ask question tool.

# Workflow

## Step 1: Check Out the PR Branch (If Needed)

If the user is already on the PR branch (discovered via Option B above), skip checkout.

Otherwise, check out the PR branch:

```bash
gh pr checkout <PR_NUMBER_OR_URL>
```

After checkout (or if already on the branch), capture the PR number for later use:

```bash
PR_NUMBER=$(gh pr view --json number -q '.number')
```

## Step 2: Determine Repository Owner and Name

```bash
PAGER= gh repo view --json owner,name -q '.owner.login + "/" + .name'
```

Store these values for use in subsequent API calls.

## Step 3: Fetch Unresolved Review Comments

Run the fetch script to get all unresolved review threads:

```bash
~/.claude/skills/address-pr-comments/scripts/fetch-unresolved-threads.mjs <OWNER> <REPO> <PR_NUMBER>
```

The script outputs a JSON array with each thread containing:
- `thread_id` - For replying and resolving
- `code_context` - File path and line numbers
- `diff_side` - Which side of the diff (LEFT/RIGHT)
- `comments` - The comment thread with author and body

## Step 4: Process Each Comment

For EACH unresolved comment, follow this workflow:

### 4a. Display Comment Information

Print the comment details clearly:
- File and line range
- Author
- Comment body
- Any replies in the thread

### 4b. Analyze and Understand

Read the referenced file and line range. Consider:
- What change is being requested?
- Is it a style/convention issue or a functional concern?
- Are there any general instructions from the user to consider?

If the comment is unclear, use the ask question tool to get clarification from the user. Offer an option to skip this comment.

### 4c. Evaluate Validity

If you believe the comment's suggestion is not valid or shouldn't be adopted:
1. Present your rationale to the user
2. Ask the user how to proceed:
   - **Agree and skip**: Move to the next comment without any reply
   - **Decline with justification**: Reply explaining why the feedback won't be adopted (see 4c-i below)
   - **Implement anyway**: Proceed with implementing the requested change

### 4c-i. Declining Feedback with Justification

When the user decides not to adopt the feedback but wants to reply with an explanation:

1. **Draft the justification** - Write a professional, respectful response explaining:
   - Why the current implementation is preferred, OR
   - Technical constraints that prevent the change, OR
   - Alternative approaches already in place, OR
   - Why the suggestion doesn't apply to this context

2. **Review the reply with the user** - Present the draft justification and confirm they're satisfied with it.

3. **Ask about resolution** - Use the ask question tool to determine:
   - Reply only (leave thread open for further discussion)
   - Reply and resolve (close the thread after replying)

4. **Send the reply using the respond script**:

```bash
# Reply only (leave thread open)
~/.claude/skills/address-pr-comments/scripts/respond-to-thread.mjs --reply "Your justification here" <THREAD_ID>

# Reply and resolve
~/.claude/skills/address-pr-comments/scripts/respond-to-thread.mjs --reply "Your justification here" --resolve <THREAD_ID>
```

**Example justifications:**
- "Thanks for the suggestion! We intentionally use X here because [reason]. This aligns with our existing pattern in [other file/component]."
- "Good catch, but this is actually handled by [mechanism] which ensures [benefit]. Adding this here would duplicate that logic."
- "We considered this approach but opted for the current implementation because [tradeoff explanation]."

After sending the reply, continue to the next comment (skip steps 4d-4h for this thread).

### 4d. Make Code Changes

Edit the necessary files to address the PR comment.

**After making changes, run project quality checks:**
- Linting: `npm run lint` (or project equivalent)
- Tests: `npm test` (or project equivalent)

Fix any issues before proceeding.

### 4e. Commit the Changes

```bash
git add <specific-files>
git commit -m "Address PR comment: [brief description]"
```

Use only the subject line - no commit body.

### 4f. Get Commit Hashes

```bash
# Full hash for the link
FULL_HASH=$(git log -1 --format=%H)

# Short hash for display
SHORT_HASH=$(git log -1 --format=%h)
```

### 4g. Ask Approval to Reply and/or Resolve

Use the ask question tool to ask the user what actions to take on the thread:
- Add a "Resolved by" comment linking to the commit
- Resolve/close the thread
- Both (recommended)
- Neither (skip)

### 4h. Respond to Thread

Run the respond script with the appropriate flags based on user's choice:

```bash
# Reply and resolve (most common)
~/.claude/skills/address-pr-comments/scripts/respond-to-thread.mjs --commit <SHORT_HASH> <FULL_HASH> <OWNER> <REPO> <PR_NUMBER> --resolve <THREAD_ID>

# Reply only
~/.claude/skills/address-pr-comments/scripts/respond-to-thread.mjs --commit <SHORT_HASH> <FULL_HASH> <OWNER> <REPO> <PR_NUMBER> <THREAD_ID>

# Resolve only
~/.claude/skills/address-pr-comments/scripts/respond-to-thread.mjs --resolve <THREAD_ID>
```

### 4i. Continue to Next Comment

Repeat from step 4a for each remaining unresolved comment.

## Step 5: Summary

After processing all comments, provide a summary:
- Number of comments addressed
- Number of commits made
- Any comments that were skipped and why
- Any comments that need user attention

# CLI Tools Required

- `gh` - GitHub CLI for PR operations and GraphQL API
- `git` - Version control operations
- `npm` / project build tools - For running linting and tests

# Scripts

All GraphQL operations are handled by executable scripts in `./scripts/` (run directly, no `node` prefix needed):

- `check-prerequisites.mjs` - Verify gh CLI installation and authentication
- `fetch-unresolved-threads.mjs` - Fetch unresolved PR review threads
- `respond-to-thread.mjs` - Reply to and/or resolve a thread (supports `--commit`, `--reply`, `--resolve` flags)
