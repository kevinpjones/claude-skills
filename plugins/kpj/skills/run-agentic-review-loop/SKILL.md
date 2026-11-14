---
name: run-agentic-review-loop
description: Use this skill when running an automated PR review loop against a review bot such as Qodo, meaning trigger the bot's review (for example by commenting /agentic_review), wait for it to finish, fix or decline every finding through address-pr-comments, push, and re-trigger until the review comes back clean or an iteration cap is hit. The reviewer is configurable (Qodo by default; Copilot or other bots via .claude/review-loop.json or arguments), and it works on a single PR or a whole PR stack. Trigger keywords include "agentic review loop", "run the qodo review loop", "qodo loop", "agentic review until clean", "loop on /agentic_review", "review bot loop", "re-run the review until clean", "address qodo findings", "usual agentic loop on the PR".
argument-hint: "[PR number or URL] [--stack] [--max-iterations N] [--mark-ready] [--config '<json>']"
---

# Run Agentic Review Loop

Drive a PR to a clean automated review: trigger the configured reviewer bot, wait for its review of the current head commit, hand its findings to `kpj:address-pr-comments`, push, and repeat until a review finds nothing new.

Scripts live in this skill's `scripts/` directory. `<skill-dir>` below means the base directory shown when this skill loads ("Base directory for this skill: …").

## Arguments

Parse `$ARGUMENTS`:

| Argument | Effect |
|----------|--------|
| PR number or URL | PR to loop on. Defaults to the PR for the current branch |
| `--stack` | Loop over every open PR in the stack, bottom-up |
| `--max-iterations N` | Override `maxIterations` |
| `--mark-ready` | Mark the PR ready for review once clean (overrides `markReadyWhenClean`) |
| `--config '<json>'` | Any other config override, merged over the repo file and defaults |

Fold `--max-iterations` and `--mark-ready` into the override JSON (`{"maxIterations": N}`, `{"markReadyWhenClean": true}`) before resolving config.

## Rules

- **All fixing, replying, and resolving goes through `kpj:address-pr-comments`.** This skill only triggers, waits, collects, pushes, and reports. Never call `respond-to-thread.mjs` or resolve threads directly.
- **One trigger per round.** Never post a second trigger while a round is pending; bots merge or drop overlapping requests.
- **A round is finished only when `wait-for-review.mjs` says so.** Edits to the bot's long-lived summary comment happen whenever threads are resolved or commits land and do not mean a new review ran.
- **Every bot finding ends with a reply.** Fixed findings get the commit link; declined findings get a plain rationale and are then resolved, so a declined finding does not block the loop.
- **Write replies for the PR's human reviewers.** Do not thank, address, or @-mention the bot.
- **Do not mark the PR ready** unless `markReadyWhenClean` is true.

## Step 0: Set Up

1. Confirm `gh auth status` succeeds.
2. Get PR context (detects the PR from the current branch when no argument is given):
   ```bash
   <skill-dir>/scripts/get-pr-context.mjs [PR_NUMBER_OR_URL]
   ```
   If the current branch is not the PR's head branch, run `gh pr checkout <PR>`.
3. Require a clean working tree (`git status --porcelain` prints nothing). Otherwise stop and tell the user.
4. Resolve config into a temp directory that lives for the whole run:
   ```bash
   RUN_DIR=$(mktemp -d -t review-loop)
   <skill-dir>/scripts/resolve-review-loop-config.mjs --override '<OVERRIDE_JSON>' --out "$RUN_DIR/config.json"
   ```
   Omit `--override` when there are no overrides. Precedence: arguments, then `<repo>/.claude/review-loop.json`, then `scripts/default-reviewer-config.json`. Settings: [./reference/configuring-reviewers.md](./reference/configuring-reviewers.md).
5. With `--stack`, list the stack and run the per-PR loop on each PR bottom-up, finishing one PR's loop before starting the next (checkout each with `gh pr checkout`):
   ```bash
   <skill-dir>/scripts/list-stack-prs.mjs <OWNER> <REPO> <PR_NUMBER>
   ```
   If `forks` is non-empty, ask the user which branch of the stack to follow.

## Per-PR Loop

Track `ROUND` (starts at 1) and `ROUND_SINCE` (epoch at first; the push time of the previous round afterward).

### Step 1: Start the Round

Get the head commit and check whether the reviewer already reviewed it:

```bash
HEAD_SHA=$(gh api repos/<OWNER>/<REPO>/pulls/<PR> --jq .head.sha)
<skill-dir>/scripts/wait-for-review.mjs <OWNER> <REPO> <PR> --config "$RUN_DIR/config.json" --head-sha "$HEAD_SHA" --once
```

- `completed`: this commit is already reviewed. Skip to Step 3.
- `pending`, and the PR was opened or marked ready within the last `timeoutMinutes`, or the user said the reviewer is already running: the bot's automatic review is likely in flight. Go to Step 2 without triggering and without `--since`.
- `pending` otherwise: trigger, and use the returned `triggered_at` as `--since` in Step 2:
  ```bash
  <skill-dir>/scripts/trigger-review.mjs <OWNER> <REPO> <PR> --config "$RUN_DIR/config.json"
  ```

Pushes to draft PRs often do not start a review, so trigger explicitly every round unless `trigger.type` is `none`.

### Step 2: Wait for the Review

Run the waiter with the Bash tool's `run_in_background: true`. It polls every `pollIntervalSeconds` and exits on its own, which notifies you. Do not poll its output or schedule extra wakeups.

```bash
<skill-dir>/scripts/wait-for-review.mjs <OWNER> <REPO> <PR> --config "$RUN_DIR/config.json" --head-sha "$HEAD_SHA" --since "<TRIGGERED_AT>"
```

| Exit | Status | Action |
|------|--------|--------|
| 0 | `completed` | Continue to Step 3 |
| 3 | `timeout` | Trigger once more and wait again. A second timeout ends the loop with outcome `reviewer-timeout` |
| 4 | `head-changed` | Someone pushed. Restart Step 1 with the new head; this does not count as a round |

### Step 3: Collect Findings

```bash
<skill-dir>/scripts/collect-review-findings.mjs <OWNER> <REPO> <PR> --config "$RUN_DIR/config.json" --since "<ROUND_SINCE>"
```

- `open_count` is 0: the review is clean. Go to Step 6.
- Otherwise continue to Step 4.

Keep `bot_auto_resolved` and `summary.new_findings` for the final report. The bot resolves some of its own threads (usually after a later commit fixed them), and some summary findings may have no thread.

### Step 4: Address Findings

Invoke the `kpj:address-pr-comments` skill with the Skill tool, passing one `--author` per entry in `botLogins`:

```
<PR_NUMBER> --unattended --author <LOGIN> --no-push --summary-file <RUN_DIR>/round-<ROUND>.json
```

It fixes, commits, replies, and resolves (or declines and resolves) each bot thread, and writes `{ addressed, declined, deferred, skipped, commits }` to the summary file. Read that file when it finishes.

### Step 5: Push or Stop

- **`commits` is empty** (every finding was declined or deferred): there is no new code to re-review, so the loop ends. Re-run Step 3 to confirm `open_count` is 0. Outcome is `clean-declined` if nothing was deferred, otherwise `needs-attention`.
- **`commits` is non-empty**: push with the stack-aware push script (rebases and pushes child branches when the PR is in a stack):
  ```bash
  <skill-dir>/scripts/push-branch.mjs
  ```
  Set `ROUND_SINCE` to now and increment `ROUND`. If `ROUND` exceeds `maxIterations`, stop with outcome `iteration-cap`, since the latest push has not been reviewed. Otherwise return to Step 1.

### Step 6: Finish a Clean PR

Outcome is `clean`. If `markReadyWhenClean` is true:

1. Record the time, then run `gh pr ready <PR>`.
2. Marking a PR ready usually starts an automatic review. Go to Step 2 without triggering, passing that time as `--since`, and continue the loop. Its rounds count toward `maxIterations`.

## Step 7: Report

For each PR, report:

- **Outcome:** `clean`, `clean-declined`, `needs-attention`, `iteration-cap`, or `reviewer-timeout`.
- **Rounds run** and **commits pushed**.
- **Fixed findings** (title and commit) and **declined findings** (title and one-line reason), gathered from the round summary files.
- **What is left**, for every outcome except `clean`:
  - open bot threads with links, from a final Step 3;
  - deferred threads with reasons;
  - whether the head commit is still unreviewed.
- **Informational:** `bot_auto_resolved` threads, and `summary.new_findings` that had no matching thread.

A run counts as successful only when zero unresolved threads from the configured bot remain. Every other outcome lists what remains.

Common failure modes and how the scripts handle them: [./reference/review-loop-failure-modes.md](./reference/review-loop-failure-modes.md).

## Scripts

| Script | Purpose |
|--------|---------|
| `resolve-review-loop-config.mjs` | Merge defaults, repo config, and overrides; validate; write config file |
| `default-reviewer-config.json` | Default reviewer settings (Qodo) |
| `trigger-review.mjs` | Request one review round (comment, reviewer request, or nothing) |
| `wait-for-review.mjs` | Wait for a review of a specific head SHA created after a given time |
| `collect-review-findings.mjs` | Open bot threads, bot-resolved threads, summary cross-check |
| `list-stack-prs.mjs` | Order a PR stack bottom-up via base/head links |
| `github-cli.mjs` | Shared `gh` helpers (imported, not run) |
| `get-pr-context.mjs`, `fetch-unresolved-threads.mjs`, `push-branch.mjs` | Shared from `address-pr-comments` via symlink |
