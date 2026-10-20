---
name: pair-review-pr
description: Use this skill for collaborative pair-review style PR code review that coordinates multiple AI sub-agent reviewers in parallel (code-simplifier, code-reviewer, typescript-enforcer, efficiency-reviewer), collects user feedback, and publishes refined comments to a GitHub PR review. Supports a pending-review mode where the user leaves their own draft comments on GitHub as input, which are then revised in place and merged with the sub-agent findings. Trigger keywords include "pair review", "collaborative review", "pair review PR", "co-review", "review PR together", "multi-agent review", "I'll leave comments on GitHub", "use my pending review", "review with pending comments".
argument-hint: "[PR number or URL (optional if on PR branch)] [--pending-review]"
---

# Collaborative PR Review

Orchestrate parallel AI code reviews, collect user feedback, and publish refined comments to GitHub PR reviews. Each comment requires user approval before posting. The review itself is never submitted without the user's explicit choice.

The user's own feedback arrives in one of two **input modes** (see Prerequisites §4):

- **Chat mode** (default) — the user types observations into the conversation after the sub-agents finish.
- **Pending-review mode** — the user writes draft comments directly on GitHub, in a pending review, while the sub-agents run. Those comments are the user's input: they get revised in place, and sub-agent findings are deduped against them.

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

## 4. Choose Input Mode

Use **pending-review mode** when the user asks for it (`--pending-review`, "I'll leave comments on GitHub", "use my pending review", "I've already started a review") or when a pending review of theirs already has comments. Otherwise use **chat mode**. If the signal is ambiguous, ask once.

To check for an existing pending review without creating one:

```bash
./scripts/manage-pending-review.mjs <OWNER> <REPO> <PR_NUMBER>
```

Exit code 2 means there is none. If one exists with `existing_comments > 0` and the user didn't name a mode, ask whether those comments are their input for this review.

# Pending-Review Mode Setup

Skip this section in chat mode.

Open the review **before** collecting the diff, so the user can start writing while you do the rest of the setup:

```bash
./scripts/manage-pending-review.mjs <OWNER> <REPO> <PR_NUMBER> --create
```

This reuses the user's existing pending review if there is one (GitHub allows only one per user per PR) and creates one otherwise. Store `review_id`. Then notify the user in plain text, adapting to `created`:

> I created a pending review on #<N> (or: I'll use your existing pending review on #<N>, which has <K> comments). Add your comments here: <pr_url>/files
>
> Use **Add review comment** / **Start a review** on each line, not **Add single comment** — single comments post immediately and won't be in the pending review. Don't submit the review; I'll add to it and you'll finalize at the end. I'll run the sub-agent reviewers in the meantime and wait for you to tell me you're done.

Then continue with Step 1 without waiting.

# Workflow

## Step 1: Collect PR Diff

Get the changed files list, file stats, and full diff. The script uses `gh pr diff` to fetch the **authoritative** diff from GitHub — only files that GitHub considers part of the PR.

```bash
# Changed file paths (JSON array) — this defines the review scope
./scripts/fetch-pr-diff.mjs --files --pr <PR_NUMBER>

# File stats (additions/deletions per file)
./scripts/fetch-pr-diff.mjs --stat --pr <PR_NUMBER>

# Full diff to temp file (auto-generates unique filename, excludes lock files by default)
# Also writes a companion -files.json with the changed file list
./scripts/fetch-pr-diff.mjs --pr <PR_NUMBER>
```

The script prints the temp file path to stdout (e.g., `Diff written to /tmp/pr-review-diff-a1b2c3d4.txt (12345 bytes)`). Parse this path and read the diff file.

**Store the changed files list** — this is the authoritative PR scope used throughout the review. Only files in this list should receive inline review comments.

Also read key changed source files directly (not just diff hunks) to understand surrounding code. You may read additional non-changed files for context, but these are NOT in scope for review findings.

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
- The **explicit list of PR-changed files** (from Step 1) as the review scope
- The full diff content
- Key source file contents for context
- The review prompt template from `./reference/sub-agent-review-prompts.md`

**CRITICAL**: Every agent prompt MUST start with the READ-ONLY preamble from `./reference/sub-agent-review-prompts.md`, which includes the scope constraint.

**CRITICAL**: Every agent prompt MUST include the changed files list in this format:
```
## PR Changed Files (review scope)
These are the ONLY files you may produce file-specific findings for:
- path/to/file1.ts
- path/to/file2.js
...

Any other files provided below are for context only — do NOT produce findings for them.
```

Each agent MUST report findings in the structured JSON format defined in `./reference/sub-agent-review-prompts.md`.

Launch all selected agents in a single message for true parallel execution. In pending-review mode, run them in the background so the conversation stays free while the user writes comments on GitHub.

## Step 4: Collect User Feedback

**BLOCKING STEP — Do NOT proceed to Step 5 until the user has responded.**

### Pending-review mode

Wait for **both** of these: every sub-agent has reported, and the user has confirmed they're done adding comments. Don't fetch, revise, or comment on the user's pending comments before they confirm; a partial review is a draft they're still shaping, and reacting to half of it wastes their time and yours.

When the last sub-agent reports, end your turn with a short plain-text message (not AskUserQuestion — the user is working in the browser and may take a while):

> All <N> reviewers are done (<H> high, <M> medium, <L> low before dedup). I'm holding until you've finished your comments on GitHub — tell me when you're done. (Say "show findings" if you'd like to see them first.)

Don't list the findings unprompted. The user's independent read is the point of this mode, and the findings get deduped against their comments later anyway. If the user asks to see them, show them, then keep waiting.

If the user replies before the sub-agents finish, or says they have more to add, acknowledge and keep holding. Only an explicit "done" (or equivalent) releases the hold.

Once released, fetch the pending comments fresh — the user may have added, edited, or deleted comments since the review was opened:

```bash
./scripts/manage-pending-review.mjs <OWNER> <REPO> <PR_NUMBER> --comments > /tmp/pr-pending-comments.json
```

Each comment becomes a **user comment** (`U1`, `U2`, … in file/line order) carrying its `id`, `path`, `line`, `start_line` and `body`. These are handled in Step 6a, not as new findings. If the review has no comments, tell the user and fall back to chat mode for this step.

### Chat mode

After sub-agents complete, **use the AskUserQuestion tool** to ask the user:

"The sub-agent reviews are complete. Before I consolidate findings, do you have any additional review observations or areas of concern to include? (Reply 'none' to skip)"

Wait for the user's response. Do not move on to consolidation or any subsequent step until the user has explicitly replied. This ensures the user has a chance to review the diff themselves and contribute their own observations before the comment list is finalized.

If the user provides feedback, normalize each item into the same structured format as agent findings with category "Review Note". User feedback items may be file-specific or general (non-file-specific).

## Step 5: Fetch Existing Threads for Dedup

Fetch ALL existing review threads (resolved AND unresolved):

```bash
./scripts/fetch-all-review-threads.mjs <OWNER> <REPO> <PR_NUMBER> > /tmp/pr-existing-threads.json
```

**IMPORTANT**: This MUST include resolved threads. Previously addressed feedback should not be re-raised.

In pending-review mode, the results may include the user's own pending threads. Exclude any thread whose comment IDs match the pending comments from Step 4, so findings aren't marked as duplicates of the user's input (that comparison happens in Step 6a instead).

## Step 6: Consolidate Findings

Aggregate all findings from sub-agents and user feedback into a single prioritized list:

1. **Parse** each agent's output, extracting the structured JSON findings
2. **Filter out-of-scope findings** — discard any file-specific finding where the `file` path is NOT in the PR changed files list from Step 1. Log discarded findings count so the user knows they were filtered.
3. **Separate general from file-specific** — findings with `"file": null` are general comments; set them aside for the review summary (Step 9)
4. **Deduplicate across agents** — if multiple agents flag the same line/issue, merge into one finding attributed to all sources
5. **Prioritize**: High > Medium > Low severity
6. **Detect duplicates against existing threads** — Read the existing threads JSON from Step 5 and compare each proposed finding against ALL threads (resolved and unresolved). For each finding, determine:
   - Does an existing thread cover the same file and overlapping line range?
   - Does the existing thread's content address the same concern (wholly or partially)?
   - Is the existing thread resolved or still open?

   Mark findings as one of:
   - **New** — no existing thread covers this concern
   - **Full duplicate** — an existing thread fully addresses the same issue
   - **Partial duplicate** — an existing thread partially overlaps (e.g., same area but different concern, or same concern but different location)

In pending-review mode, also compare each finding against the user's pending comments (Step 4). When a finding covers the same concern, don't raise it separately: either drop it, or — if it adds a concrete detail the user's comment lacks — fold that detail into the revision of their comment in Step 6a and note which finding was folded in. Mark the remaining findings `Partial (U3)` etc. where they overlap a user comment without duplicating it.

Present a numbered summary table to the user. Include duplicate status in the table:

```
| # | File | Line(s) | Severity | Category | Source | Dup? | Description |
|---|------|---------|----------|----------|--------|------|-------------|
| 1 | src/index.ts | 15-20 | high | Correctness | code-reviewer | — | Missing null check |
| 2 | src/utils.ts | 42 | medium | Simplification | code-simplifier | Full | Duplicates existing resolved thread |
| 3 | src/api.ts | 8-12 | medium | Type Safety | ts-enforcer | Partial | Overlaps open thread on unsafe cast |
```

## Step 6a: Revise the User's Pending Comments (pending-review mode only)

The user's comments are their review; your job is to make them read well and hold up, not to replace their judgment.

1. **Verify each comment's factual claims against the code** (and any other repos it references). When a comment conflicts with what the code shows, don't silently "fix" it — raise it as a question with the evidence (file and line), and offer to keep their framing, reword it, or delete it. Resolve these first, since the answer can change other revisions.
2. **Draft a revision** of each comment: clear, professional, plain language per `./reference/comment-formatting.md`, preserving the user's intent and position. Expand terse notes into complete sentences, add code references, permalinks, or suggestion blocks where they help, and fold in overlapping sub-agent detail from Step 6. Comments that already read well can stay as they are — say so instead of rewording for its own sake.
3. **Present each one for approval** following Step 8b's display rules, with both versions inside the question:
   ```
   U3 — DESIGN.md:37-38

   Original:
   I like this. Should run the audit on a cron.

   Revised:
   I like this. I'd also run the audit on a schedule instead of relying on someone to run it before each
   bill run. ...
   ```
   Options: **Approve** (update in place) / **Edit** / **Keep original** / **Delete**.
4. **Apply approved changes in place** — the comment stays where the user anchored it:
   ```bash
   cat > /tmp/pr-comment-<ID>.md << 'ENDCOMMENT'
   <revised body>
   ENDCOMMENT
   ./scripts/update-review-comment.mjs --id <COMMENT_ID> --body-file /tmp/pr-comment-<ID>.md
   # or, if the user chose Delete:
   ./scripts/update-review-comment.mjs --id <COMMENT_ID> --delete
   ```

Then present the remaining sub-agent findings (Step 8) — they're added to the same pending review.

## Step 7: Manage Pending Review

In pending-review mode the review already exists (`review_id` from setup) — skip this step.

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

**Use the AskUserQuestion tool** to present each comment for approval.

Put the **complete comment body, exactly as it will be posted, inside the `question` field itself**. Prose written before the tool call can render collapsed in the terminal, and the `preview` panel truncates long lines, so the user may otherwise approve text they never saw. Never summarize or paraphrase the body ("same as before, but…"). For several items, use one question per item (up to 4 per AskUserQuestion call) rather than one batched question that refers to text above it. Use the numbering from the consolidated table (`#3`, `U2`), not a renumbered "N of M". The same rule applies to the review summary in Step 9c.

The presentation MUST include:

1. **Comment source** — clearly indicate which sub-agent produced the finding (e.g., "Source: code-reviewer") or "Source: user-generated" for user feedback from Step 4
2. **File and line** — where the comment will be posted
3. **The fully formatted comment body** — as it will appear on GitHub

Format: `"#N — [file:line] — Source: [agent-name|user-generated]\n\n<full comment body>\n\nApprove / Edit / Skip?"`

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

**Use the AskUserQuestion tool** to present the draft summary, with the full summary text inside the question (see Step 8b). They can:
- **Approve**: Use as the review body
- **Edit**: Revise and re-present
- **Skip**: No summary body (user will write their own on GitHub)

### 9d. Save the Summary

If approved, write the summary to `/tmp/pr-review-summary-<OWNER>-<REPO>-<PR_NUMBER>.md` for use in Step 10.

## Step 10: Submit or Copy Review

After the review summary is finalized, present the user with submission options.

### 10a. Recommend a Review Type

Based on the findings (and, in pending-review mode, the user's own comments), recommend a review type:

- **APPROVE** — if no high-severity findings were posted, or all high-severity items were skipped
- **COMMENT** — if findings are informational or mixed severity with nothing blocking
- **REQUEST_CHANGES** — if high-severity findings were posted that must be addressed before merge

Present the recommendation with rationale, e.g.:
> "You posted 2 high-severity comments flagged as must-fix. I recommend **Request Changes**."

### 10b. Ask the User

**Use the AskUserQuestion tool** to ask the user how to proceed:

```
How would you like to finalize this review?

1. Submit as APPROVE
2. Submit as COMMENT (feedback only)
3. Submit as REQUEST_CHANGES
4. Copy summary to clipboard (I'll submit manually on GitHub)
5. Skip (leave review pending)
```

Include your recommendation (e.g., "Recommended: option 3 — Request Changes").

### 10c. Execute the User's Choice

**If the user chose to submit (options 1-3):**

```bash
./scripts/submit-review.mjs <OWNER> <REPO> <PR_NUMBER> \
  --event <APPROVE|COMMENT|REQUEST_CHANGES> \
  --body-file /tmp/pr-review-summary-<OWNER>-<REPO>-<PR_NUMBER>.md
```

Report the result including the review URL from the script output.

**If the user chose to copy to clipboard (option 4):**

```bash
cat /tmp/pr-review-summary-<OWNER>-<REPO>-<PR_NUMBER>.md | pbcopy
```

Confirm: "Review summary copied to clipboard. Your review is still pending — visit the PR on GitHub to paste the summary and submit."

**If the user chose to skip (option 5):**

Confirm: "Review left as pending. Visit the PR on GitHub to finalize when ready."

## Step 11: Final Summary

After submission (or skip), provide a final summary:

```
## Review Complete
- **Your comments** (pending-review mode): N revised in place, N kept as written, N deleted
- **Posted**: N inline comments (H high, M medium, L low)
- **Skipped**: N comments
- **Duplicates avoided**: N (already covered by existing threads)
- **General comments**: N (included in review summary)
- **Review**: Submitted as APPROVE/COMMENT/REQUEST_CHANGES / Copied to clipboard / Left pending
- **URL**: <review URL if submitted>
```

# Error Handling

| Scenario | Action |
|----------|--------|
| No PR found for current branch | Ask user for PR number/URL |
| No changed files in diff | Inform user, exit gracefully |
| Sub-agent fails or times out | Report which agent failed, continue with remaining results |
| Comment posting fails | Show error, offer to retry or skip |
| Duplicate detected | Present to user with existing thread preview and recommendation |
| User submitted the pending review early | `manage-pending-review.mjs` finds none; tell the user, then post remaining comments to a new pending review |
| Updating a pending comment fails | Show the error and the revised text so the user can paste it on GitHub; continue with the rest |
| `gh` not authenticated | Run `./scripts/check-prerequisites.mjs` and follow its guidance |

# Scripts Reference

All scripts are in `./scripts/`, are self-executable (no `node` prefix needed), and support `--help`:

| Script | Purpose |
|--------|---------|
| `check-prerequisites.mjs` | Verify gh CLI installation and authentication |
| `get-pr-context.mjs` | Get PR number, owner, repo, branch, stack info |
| `fetch-pr-diff.mjs` | Get PR diff, changed file list, and file stats via `gh pr diff` |
| `fetch-all-review-threads.mjs` | Fetch ALL threads (resolved + unresolved) for dedup |
| `add-review-comment.mjs` | Post comment to PR review via GraphQL |
| `manage-pending-review.mjs` | Find or create pending review for current user; `--comments` lists its comments |
| `update-review-comment.mjs` | Update or delete a comment on the pending review (revise user comments in place) |
| `submit-review.mjs` | Submit pending review (APPROVE/COMMENT/REQUEST_CHANGES) via GraphQL |
| `generate-permalink.mjs` | Generate GitHub permalinks with verified commit hashes |

`check-prerequisites.mjs` and `get-pr-context.mjs` are symlinked from the `address-pr-comments` skill.
