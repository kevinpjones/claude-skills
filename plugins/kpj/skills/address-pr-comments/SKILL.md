---
name: address-pr-comments
description: Use this skill when addressing, resolving, or working through PR review comments. This includes checking out a PR branch, fetching unresolved review threads, making code changes to address feedback, committing fixes, adding reply comments, and resolving threads. Trigger keywords include "PR comments", "review feedback", "address feedback", "resolve comments", "fix PR", "review threads".
argument-hint: "[PR link or number] [--unattended] [--author <login>]... [--no-push] [--summary-file <path>]"
---

# Addressing PR Comments

Systematically work through unresolved PR review comments, making code changes, committing fixes, and resolving threads with proper attribution.

Scripts live in this skill's `scripts/` directory. `<skill-dir>` below means the base directory shown when this skill loads ("Base directory for this skill: …").

# Arguments

Parse `$ARGUMENTS`:

| Argument | Effect |
|----------|--------|
| PR link or number | The PR to work on (see Option A below) |
| `--unattended` | Run without asking the user anything. See [Unattended Mode](#unattended-mode) |
| `--author <login>` | Only process threads opened by this login. Repeatable. Pass through to `fetch-unresolved-threads.mjs` |
| `--no-push` | Skip Step 5; the caller pushes |
| `--summary-file <path>` | Also write the Step 6 summary as JSON to this path |

With no flags, the skill runs interactively as described in the workflow.

# Unattended Mode

Callers such as `run-agentic-review-loop` use `--unattended` to process automated-reviewer findings without a human in the loop. Every decision point that normally asks the user is replaced by a fixed rule, and every processed thread ends with a reply:

| Interactive step | Unattended behavior |
|------------------|---------------------|
| Confirm the discovered PR (Option B) | Use it without asking. If no PR is found, stop and report |
| Unclear comment (4b) | Decline: reply stating what is ambiguous and why no change was made, then resolve |
| Invalid suggestion (4c) | Decline with justification (4c-i), then resolve. No draft review |
| Lint or tests fail after a fix and cannot be made to pass | Revert the uncommitted change, reply with the failure, leave the thread open, record it as `deferred` |
| Reply/resolve choice (4g) | Reply with the commit link and resolve |

Reply style in unattended mode: write for the human reviewers of the PR, in a plain tone. Do not thank or address the bot, do not @-mention it, and use no emoji.

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

If this succeeds, confirm with the user that this is the PR they want to work on (skip the confirmation in unattended mode).

### Option C: Prompt for PR
If neither option works, prompt the user for a PR link or number using the ask question tool.

# Workflow

## Step 1: Check Out the PR Branch (If Needed)

If the user is already on the PR branch (discovered via Option B above), skip checkout.

Otherwise, check out the PR branch:

```bash
gh pr checkout <PR_NUMBER_OR_URL>
```

## Step 2: Get PR Context

Run the context script to get PR number, owner, repo, branch, and stack info in one call:

```bash
<skill-dir>/scripts/get-pr-context.mjs [PR_NUMBER_OR_URL]
```

If no argument is provided, it detects the PR from the current branch. The output includes:
- `pr_number`, `owner`, `repo`, `branch`, `base_branch`, `url`
- `stack` — `null` if not stacked, or `{ stack_id, parent_branch, position }` if part of a stack

Store these values for use in subsequent steps.

## Step 3: Fetch Unresolved Review Comments

Run the fetch script to get all unresolved review threads:

```bash
<skill-dir>/scripts/fetch-unresolved-threads.mjs <OWNER> <REPO> <PR_NUMBER> [--author <login>]... [--exclude-outdated]
```

`--author` keeps only threads whose first comment is by that login (`[bot]` suffix optional). Pass every `--author` from the skill arguments.

The script outputs a JSON array with each thread containing:
- `thread_id` - For replying and resolving
- `is_outdated` - Whether the commented lines have since changed
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
<skill-dir>/scripts/respond-to-thread.mjs --reply "Your justification here" <THREAD_ID>

# Reply and resolve
<skill-dir>/scripts/respond-to-thread.mjs --reply "Your justification here" --resolve <THREAD_ID>
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

Use only the subject line - no commit body. If the branch's existing commits start with a ticket prefix (for example `BILL-123:`), use that prefix instead of `Address PR comment:`.

### 4f. Get Commit Hashes

```bash
<skill-dir>/scripts/get-reply-commit-hash.mjs
```

Defaults to HEAD. Pass an optional commit ref to target a different commit. The output includes `short_hash`, `full_hash`, `subject`, and `respond_args` (pre-formatted for `respond-to-thread.mjs --commit`).

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
<skill-dir>/scripts/respond-to-thread.mjs --commit <SHORT_HASH> <FULL_HASH> <OWNER> <REPO> <PR_NUMBER> --resolve <THREAD_ID>

# Reply only
<skill-dir>/scripts/respond-to-thread.mjs --commit <SHORT_HASH> <FULL_HASH> <OWNER> <REPO> <PR_NUMBER> <THREAD_ID>

# Resolve only
<skill-dir>/scripts/respond-to-thread.mjs --resolve <THREAD_ID>
```

### 4i. Continue to Next Comment

Repeat from step 4a for each remaining unresolved comment.

## Step 5: Push Changes

After all comments are addressed, push the branch. The push script is stack-aware:

```bash
<skill-dir>/scripts/push-branch.mjs
```

For non-stacked branches, this does a simple `--force-with-lease` push.

For stacked branches, it automatically:
1. Rebases child branches using the `@{1}` refspec technique
2. Force-pushes all affected branches in one command
3. Updates "Resolved by" comment links on each affected PR

Options:
- `--dry-run` — show what would be done without making changes
- `--no-links` — skip updating PR comment links after push

Skip this step when `--no-push` was passed.

## Step 6: Summary

After processing all comments, provide a summary:
- Number of comments addressed
- Number of commits made
- Any comments that were skipped and why
- Any comments that need user attention

When `--summary-file <path>` was passed, also write the summary as JSON to that path:

```json
{
  "pr_number": 42,
  "addressed": [{ "thread_id": "PRRT_…", "commit": "<full sha>" }],
  "declined": [{ "thread_id": "PRRT_…", "reason": "one-line rationale" }],
  "deferred": [{ "thread_id": "PRRT_…", "reason": "why it was left open" }],
  "skipped": [{ "thread_id": "PRRT_…", "reason": "…" }],
  "commits": ["<full sha>"],
  "pushed": false
}
```

`addressed` and `declined` threads are resolved; `deferred` and `skipped` threads are still open.

# CLI Tools Required

- `gh` - GitHub CLI for PR operations and GraphQL API
- `git` - Version control operations
- `npm` / project build tools - For running linting and tests

# Scripts

All scripts are in `<skill-dir>/scripts/` and are directly executable (no `node` prefix needed):

| Script | Purpose |
|--------|---------|
| `get-pr-context.mjs` | Get PR number, owner, repo, branch, and stack info in one call |
| `get-reply-commit-hash.mjs` | Get commit hash info formatted for `respond-to-thread.mjs --commit` |
| `push-branch.mjs` | Stack-aware push with child rebase and comment link updates |
| `fetch-unresolved-threads.mjs` | Fetch unresolved PR review threads via GraphQL (`--author`, `--exclude-outdated`) |
| `respond-to-thread.mjs` | Reply to and/or resolve a thread (`--commit`, `--reply`, `--resolve`) |
| `check-prerequisites.mjs` | Verify gh CLI installation and authentication |
