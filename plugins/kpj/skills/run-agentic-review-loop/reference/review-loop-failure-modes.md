# Review Loop Failure Modes

These are the known ways a bot review loop goes wrong, and how this skill prevents or reports each one.

| Failure | Symptom | Handling |
|---------|---------|----------|
| Summary edits mistaken for a finished review | Loop proceeds while the bot is still reviewing, or exits on a stale review | `wait-for-review.mjs` accepts only a signal **created** after `--since` **and** tied to the head SHA. Edits to existing comments are ignored |
| Clean review of an old commit | Loop exits but the latest push was never reviewed | The signal must reference the current head SHA. `head-changed` (exit 4) restarts the round |
| Agent's own trigger comment read as the bot's reply | Loop proceeds right after triggering | Signals are filtered to `botLogins` |
| REST vs GraphQL login forms | A filter on `qodo-code-review[bot]` never matches GraphQL authors | All login comparisons strip a trailing `[bot]` and ignore case |
| Draft PR push does not start a review | Waiter times out | Trigger explicitly every round. A timeout retriggers once before stopping |
| Overlapping triggers | Two triggers produce one review; the second wait never completes | One trigger per round. Step 1 checks with `--once` whether the head is already reviewed before triggering |
| Automatic review on open/ready plus a manual trigger | Duplicate rounds | When the PR was just opened or marked ready, wait without triggering |
| Same false positive raised every round | Ping-pong between decline and re-raise | `address-pr-comments` declines it again. A round with no commits ends the loop, and `maxIterations` caps the rest |
| Bot resolves its own threads | Finding disappears with no reply | Listed under `bot_auto_resolved` in the report. Usually a later commit fixed it |
| Summary lists a finding with no thread | Finding never reaches `address-pr-comments` | Listed from `summary.new_findings` in the report for the user to review |
| Summary comment truncated by the bot | Summary cross-check misses findings | Threads are the source of truth; the summary is informational only |
| Marking ready starts another review | New threads appear after the loop "finished" | With `markReadyWhenClean`, the loop waits for that review and keeps going |
| Lint or tests fail on a fix | Fix cannot be committed | `address-pr-comments --unattended` reverts it, leaves the thread open, and records it as `deferred`. Outcome becomes `needs-attention` |
| Stacked PRs | Fixing a lower PR rewrites upper PRs and re-triggers their reviews | Loop bottom-up, finishing one PR before the next. `push-branch.mjs` rebases and pushes children in one step |
| No shell `timeout` on macOS; fragile shell polling | Watchers hang or never match | Polling lives in Node (`wait-for-review.mjs`), run in the background with its own timeout |
