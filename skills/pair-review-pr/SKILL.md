---
name: pair-review-pr
description: Use this skill for collaborative pair-review style PR code review that coordinates multiple AI sub-agent reviewers in parallel (code-simplifier, code-reviewer, typescript-enforcer, efficiency-reviewer), collects user feedback, and publishes refined comments to a GitHub PR review. Trigger keywords include "pair review", "collaborative review", "pair review PR", "co-review", "review PR together", "multi-agent review".
argument-hint: "[PR number or URL (optional if on PR branch)]"
---

# Collaborative PR Review

Orchestrate parallel AI code reviews, collect user feedback, and publish refined comments to GitHub PR reviews. Each comment requires user approval before posting. The review itself is never submitted — the user finalizes it.

# Prerequisites

## 1. GitHub CLI

```bash
./scripts/check-prerequisites.mjs
```

If prerequisites are not met, follow the script's output to guide the user.

## 2. PR Discovery

Determine the target PR:

1. **User provided**: Use PR number/URL from invocation arguments
2. **Current branch**: `gh pr view --json number,url -q '"\(.number) - \(.url)"'`
3. **Prompt**: Ask the user for a PR number or URL

## 3. PR Context

```bash
./scripts/get-pr-context.mjs [PR_NUMBER_OR_URL]
```

Store `owner`, `repo`, `pr_number`, `branch`, `base_branch` for all subsequent steps.

# Workflow

## Step 1: Collect PR Diff

Get the changed files overview and full diff:

```bash
# File stats
./scripts/fetch-pr-diff.mjs --stat

# Full diff to temp file (auto-generates unique filename, excludes lock files/toml by default)
./scripts/fetch-pr-diff.mjs
```

The script prints the temp file path to stdout (e.g., `Diff written to /tmp/pr-review-diff-a1b2c3d4.txt (12345 bytes)`). Parse this path and read the diff file. Also read key changed source files directly (not just diff hunks) to understand surrounding code.

## Step 2: Select Reviewers

Present the user with available sub-agent reviewers. Use the AskUserQuestion tool with a checklist:

| Reviewer | Focus | Default |
|----------|-------|---------|
| **code-simplifier** | Reuse, duplication, readability | Selected |
| **code-reviewer** | Correctness, edge cases, security | Not selected |
| **typescript-enforcer** | Type safety, TS best practices | Not selected |
| **efficiency-reviewer** | Performance, allocations, batching | Not selected |

Ask: "Which reviewers should I include? (code-simplifier is selected by default)"

## Step 3: Launch Parallel Reviews

Launch selected sub-agents concurrently using the Agent tool. Each agent receives:
- The full diff content
- Key source file contents for context
- The review prompt template from `./reference/sub-agent-review-prompts.md`

**CRITICAL**: Every agent prompt MUST start with the READ-ONLY preamble:
```
You are performing a READ-ONLY code review of a pull request. Do NOT modify any files.
Do NOT use the Edit, Write, or NotebookEdit tools.
```

Each agent MUST report findings in the structured JSON format defined in `./reference/sub-agent-review-prompts.md`.

Launch all selected agents in a single message for true parallel execution.

## Step 4: Collect User Feedback

While sub-agents are running (or after they complete), ask the user:

"Do you have any additional review observations or areas of concern to include?"

If the user provides feedback, normalize each item into the same structured format as agent findings with category "Review Note".

## Step 5: Fetch Existing Threads for Dedup

Fetch ALL existing review threads (resolved AND unresolved):

```bash
./scripts/fetch-all-review-threads.mjs <OWNER> <REPO> <PR_NUMBER> > /tmp/pr-existing-threads.json
```

**IMPORTANT**: This MUST include resolved threads. Previously addressed feedback should not be re-raised.

## Step 6: Consolidate Findings

Aggregate all findings from sub-agents and user feedback into a single prioritized list:

1. **Parse** each agent's output, extracting the structured JSON findings
2. **Separate general from file-specific** — findings with `"file": null` are general comments; set them aside for the review summary (Step 9)
3. **Deduplicate across agents** — if multiple agents flag the same line/issue, merge into one finding attributed to all sources
4. **Prioritize**: High > Medium > Low severity
5. **Detect duplicates against existing threads** — Read the existing threads JSON from Step 5 and compare each proposed finding against ALL threads (resolved and unresolved). For each finding, determine:
   - Does an existing thread cover the same file and overlapping line range?
   - Does the existing thread's content address the same concern (wholly or partially)?
   - Is the existing thread resolved or still open?

   Mark findings as one of:
   - **New** — no existing thread covers this concern
   - **Full duplicate** — an existing thread fully addresses the same issue
   - **Partial duplicate** — an existing thread partially overlaps (e.g., same area but different concern, or same concern but different location)

Present a numbered summary table to the user. Include duplicate status in the table:

```
| # | File | Line(s) | Severity | Category | Source | Dup? | Description |
|---|------|---------|----------|----------|--------|------|-------------|
| 1 | src/index.ts | 15-20 | high | Correctness | code-reviewer | — | Missing null check |
| 2 | src/utils.ts | 42 | medium | Simplification | code-simplifier | Full | Duplicates existing resolved thread |
| 3 | src/api.ts | 8-12 | medium | Type Safety | ts-enforcer | Partial | Overlaps open thread on unsafe cast |
```

## Step 7: Manage Pending Review

Find or create a pending GitHub PR review:

```bash
./scripts/manage-pending-review.mjs <OWNER> <REPO> <PR_NUMBER> --create
```

Store the `review_id` for attaching comments.

## Step 8: Present and Publish Comments

**Only process file-specific findings here.** General findings (with `file: null`) are handled in Step 9.

For EACH file-specific finding (in priority order), follow this approval loop:

### 8a. Format the Comment

Format using the patterns in `./reference/comment-formatting.md`:
- Write in plain language — NO structured headers, severity badges, or category labels
- For high/critical severity only, prefix with `🚨 URGENT —` or similar emoji callout
- Add code snippets using markdown fenced blocks
- Use GitHub `suggestion` blocks for concrete single-hunk fixes
- Generate permalinks for cross-references to existing codebase code:

```bash
./scripts/generate-permalink.mjs <OWNER> <REPO> --file <path> --line <line> --ref <default-branch>
```

**IMPORTANT**: Permalinks must use commit hashes, not branch names. Always use `generate-permalink.mjs` to ensure reachable hashes.

### 8b. Present for Approval

**Use the AskUserQuestion tool** to present each comment for approval. The presentation MUST include:

1. **Comment source** — clearly indicate which sub-agent produced the finding (e.g., "Source: code-reviewer") or "Source: user-generated" for user feedback from Step 4
2. **File and line** — where the comment will be posted
3. **The fully formatted comment body** — as it will appear on GitHub

Format: `"Comment N of M — [file:line] — Source: [agent-name|user-generated] — Approve / Edit / Skip?"`

Options:
- **Approve**: Post as-is
- **Edit**: User provides revised text, re-present for approval
- **Skip**: Do not post this comment

**For user-generated comments (from Step 4):** These require special handling:
- Revise the user's original notes for clarity and professional tone
- Augment with code snippets, GitHub suggestion blocks, and/or permalinks as appropriate
- Show **both** the original user note and the revised comment side-by-side so the user can see what changed:
  ```
  Original: "the error handling here looks wrong"
  Revised:  "This catch block swallows the error silently — the caller has no way to
             know the operation failed. Consider re-throwing or returning a Result type."
  ```
- The user approves or edits the **revised** version

**For findings flagged as duplicates:** Still present the comment, but clearly note the duplication:
- Show the existing thread's content (preview of first comment)
- State whether the existing thread is **resolved** or **unresolved**
- Provide a recommended action:
  - **Full duplicate, resolved**: Recommend **Skip** — "This was already addressed and resolved"
  - **Full duplicate, unresolved**: Recommend **Skip** — "This is already raised in an open thread"
  - **Partial duplicate, resolved**: Recommend **Approve** — "Related feedback was resolved, but this adds a new angle"
  - **Partial duplicate, unresolved**: Recommend **Edit** — "Consider referencing the existing open thread"
- The user always makes the final decision

### 8c. Post Approved Comment

Write the comment body to a temp file to avoid shell escaping issues:

```bash
cat > /tmp/pr-comment-body.md << 'ENDCOMMENT'
<formatted comment body>
ENDCOMMENT

# For multi-line comments (start_line differs from line):
./scripts/add-review-comment.mjs <OWNER> <REPO> <PR_NUMBER> \
  --path <file> \
  --line <line> \
  --start-line <start_line> \
  --body-file /tmp/pr-comment-body.md \
  --review-id <REVIEW_ID>

# For single-line comments (omit --start-line entirely):
./scripts/add-review-comment.mjs <OWNER> <REPO> <PR_NUMBER> \
  --path <file> \
  --line <line> \
  --body-file /tmp/pr-comment-body.md \
  --review-id <REVIEW_ID>
```

**IMPORTANT**: For single-line comments, do NOT pass `--start-line`. The GitHub GraphQL API rejects empty `startLine`/`startSide` values. Only include `--start-line` when the comment spans multiple lines and `start_line` differs from `line`.

### 8d. Continue

Repeat 8a-8c for each remaining finding.

## Step 9: Compose Review Summary

After all inline comments are processed, compose a suggested **review summary body** for the user. This is the text that appears as the top-level review comment when submitting the review on GitHub.

### 9a. Gather General Comments

Collect all general (non-file-specific) findings from Step 6 that were set aside. Also include any observations from user feedback in Step 4 that don't map to specific diff lines.

### 9b. Draft the Summary

Write a concise review summary in plain language that includes:

1. **Overall assessment** — one or two sentences on the PR's approach and quality
2. **General comments** — any cross-cutting concerns, architectural observations, or patterns noticed across the PR that don't belong on a specific diff line
3. **Key inline highlights** — brief mention of the most important inline comments posted (high severity), so the author knows what to prioritize

Format as plain markdown. No structured headers like "Severity: high". Keep the tone constructive and direct.

Example:

```markdown
The decomposition of the monolithic handler into pipeline stages is a solid approach. A few concerns to address:

- The error recovery strategy differs between stages — stage 1 retries silently while stage 3 throws immediately. Consider standardizing error handling across all stages.
- Several of the new utility functions duplicate existing helpers in `src/utils/` (see inline comments).

The most important inline comments are the missing null check in `processOrder.ts:42` and the unhandled promise rejection in `pipeline.ts:78`.
```

### 9c. Present for Approval

**Use the AskUserQuestion tool** to present the draft summary. They can:
- **Approve**: Use as the review body
- **Edit**: Revise and re-present
- **Skip**: No summary body (user will write their own on GitHub)

### 9d. Copy to Clipboard

If approved, copy the summary to the user's clipboard (using `pbcopy` on macOS or equivalent) so they can paste it as the review body on GitHub. Also write it to `/tmp/pr-review-summary.md` as a backup.

**IMPORTANT**: The GitHub API does not support setting the body on a pending review after creation. The user must paste this summary when submitting the review on GitHub.

## Step 10: Final Summary

After all comments and the review summary are processed, provide a final summary:

```
## Review Complete
- **Posted**: N inline comments (H high, M medium, L low)
- **Skipped**: N comments
- **Duplicates avoided**: N (already covered by existing threads)
- **General comments**: N (included in review summary)
- **Review summary**: Copied to clipboard / Skipped
- **Review status**: PENDING — visit the PR to finalize and submit your review
```

Remind the user: "Your review is pending. Visit the PR on GitHub to paste the review summary and submit."

**Do NOT submit the review.** The user controls when and how to finalize it.

# Error Handling

| Scenario | Action |
|----------|--------|
| No PR found for current branch | Ask user for PR number/URL |
| No changed files in diff | Inform user, exit gracefully |
| Sub-agent fails or times out | Report which agent failed, continue with remaining results |
| Comment posting fails | Show error, offer to retry or skip |
| Duplicate detected | Present to user with existing thread preview and recommendation |
| `gh` not authenticated | Run `./scripts/check-prerequisites.mjs` and follow its guidance |

# Scripts Reference

All scripts are in `./scripts/`, are self-executable (no `node` prefix needed), and support `--help`:

| Script | Purpose |
|--------|---------|
| `check-prerequisites.mjs` | Verify gh CLI installation and authentication |
| `get-pr-context.mjs` | Get PR number, owner, repo, branch, stack info |
| `fetch-pr-diff.mjs` | Get PR diff and changed file stats |
| `fetch-all-review-threads.mjs` | Fetch ALL threads (resolved + unresolved) for dedup |
| `add-review-comment.mjs` | Post comment to PR review via GraphQL |
| `manage-pending-review.mjs` | Find or create pending review for current user |
| `generate-permalink.mjs` | Generate GitHub permalinks with verified commit hashes |

`check-prerequisites.mjs` and `get-pr-context.mjs` are symlinked from the `address-pr-comments` skill.
