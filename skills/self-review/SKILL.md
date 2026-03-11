---
name: self-review
description: Use this skill for deep self-review of local branch changes before creating a PR. Coordinates multiple AI sub-agent reviewers in parallel, presents consolidated findings with coordinator analysis, collects user approval, and fixes approved issues with individual commits. Trigger keywords include "self review", "self-review", "review my changes", "review my branch", "review before PR", "pre-PR review", "review local changes".
argument-hint: "[base branch (optional, default: auto-detect)]"
---

# Self-Review Local Changes

Orchestrate parallel AI code reviews of local branch changes, present findings with coordinator analysis and advice, collect user approval on each finding, then fix approved issues — each in its own commit (or logically grouped).

No PR required. No comments posted to GitHub. Everything happens locally.

# Workflow

## Step 1: Collect Branch Diff

Determine the base branch and get the diff:

```bash
# File stats
./scripts/get-branch-diff.mjs --stat [--base <branch>]

# Full diff to temp file
./scripts/get-branch-diff.mjs [--base <branch>]
```

If the user provided a base branch argument, pass it with `--base`. Otherwise the script auto-detects.

Parse the temp file path from stdout and read the diff file. Also read key changed source files directly (not just diff hunks) to understand surrounding code.

If there are no changes, inform the user and exit.

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
You are performing a READ-ONLY code review of local branch changes. Do NOT modify any files.
Do NOT use the Edit, Write, or NotebookEdit tools.
```

Each agent MUST report findings in the structured JSON format defined in `./reference/sub-agent-review-prompts.md`.

Launch all selected agents in a single message for true parallel execution.

## Step 4: Collect User Feedback

**BLOCKING STEP — Do NOT proceed to Step 5 until the user has responded.**

After sub-agents complete, **use the AskUserQuestion tool** to ask:

"The sub-agent reviews are complete. Before I consolidate findings, do you have any additional observations or areas of concern to include? (Reply 'none' to skip)"

Wait for the user's response. If the user provides feedback, normalize each item into the same structured format as agent findings with category "Review Note".

## Step 5: Consolidate and Deduplicate Findings

Aggregate all findings from sub-agents and user feedback:

1. **Parse** each agent's output, extracting the structured JSON findings
2. **Separate general from file-specific** — findings with `"file": null` are general; set aside for the summary in Step 8
3. **Deduplicate across agents** — if multiple agents flag the same line/issue, merge into one finding attributed to all sources
4. **Prioritize**: High > Medium > Low severity

Present a numbered summary table:

```
| # | File | Line(s) | Severity | Category | Source | Description |
|---|------|---------|----------|----------|--------|-------------|
| 1 | src/index.ts | 15-20 | high | Correctness | code-reviewer | Missing null check |
| 2 | src/utils.ts | 42 | medium | Simplification | code-simplifier | Duplicated logic |
```

## Step 6: Present Findings for Approval

For EACH file-specific finding (in priority order), present using the format in `./reference/finding-presentation-format.md`.

For each finding, provide your **coordinator analysis**:
- Your independent assessment of the finding's validity
- Practical impact analysis
- Fix complexity estimate
- Grouping recommendations (which findings should be fixed together)
- Your recommendation: **Approve** (fix it), **Skip** (not worth it), or **Defer** (valid but not now)

**Use the AskUserQuestion tool** to present each finding:

Format: `"Finding N of M — [severity] — Source: [agent-name] — Approve / Skip / Defer?"`

The user responds with:
- **Approve**: Queue this finding for fixing
- **Skip**: Do not fix
- **Defer**: Acknowledged but not fixing in this branch

**For user-generated findings (from Step 4):** Flesh out the user's notes with specific file locations, code references, and concrete fix suggestions before presenting.

Track all decisions. After all findings are presented, confirm the final list of approved fixes before proceeding.

## Step 7: Fix Approved Issues

**BLOCKING STEP — Confirm the fix plan with the user before making any changes.**

Present the approved findings grouped by commit:
- Show which findings will be fixed individually
- Show which findings are grouped (per `./reference/fix-commit-guidelines.md`)
- Ask: "Ready to proceed with these fixes? (yes / adjust grouping / cancel)"

For each fix (or group):

1. **Read the full source file(s)** — understand context beyond the diff
2. **Make the minimal change** that addresses the finding
3. **Run linting** to verify no issues introduced
4. **Run tests** if available and fast
5. **Stage only the specific files changed** — `git add <files>`, never `git add -A`
6. **Commit** using the format in `./reference/fix-commit-guidelines.md`:
   ```
   self-review: [brief description]

   Addresses [category] finding in [file(s)]:
   [what was wrong and what was fixed]
   ```

If a fix introduces lint errors or test failures, fix them within the same commit. If a fix is more complex than expected, ask the user whether to proceed or skip.

**IMPORTANT**: Never leave the working tree in a broken state between fixes.

## Step 8: Review Summary

After all fixes are committed, present a final summary:

```
## Self-Review Complete

### Findings
- **Total**: N findings across M reviewers
- **Approved & Fixed**: N (in K commits)
- **Skipped**: N
- **Deferred**: N
- **General observations**: N

### Commits Created
1. `abc1234` — self-review: [description]
2. `def5678` — self-review: [description]

### General Observations
[Present any general/non-file-specific findings that were set aside in Step 5.
These are cross-cutting concerns the user should be aware of but don't map to
specific fixable locations.]
```

# Error Handling

| Scenario | Action |
|----------|--------|
| No changes on branch | Inform user, exit gracefully |
| Branch is main/master | Warn user — self-review is meant for feature branches |
| Sub-agent fails or times out | Report which agent failed, continue with remaining results |
| Fix introduces lint/test failure | Fix within same commit; if too complex, ask user |
| Working tree has uncommitted changes | Warn user — recommend committing or stashing first |

# Scripts Reference

All scripts are in `./scripts/`, executable (no `node` prefix needed), and support `--help`:

| Script | Purpose |
|--------|---------|
| `get-branch-diff.mjs` | Get diff of current branch vs base, with file stats |
