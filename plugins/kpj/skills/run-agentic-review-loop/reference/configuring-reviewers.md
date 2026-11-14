# Configuring Reviewers

The loop logic is the same for every reviewer bot. What changes per bot is how a round is requested, how a finished round is recognized, and which logins own the findings. All of that lives in config.

## Precedence

Highest first. Objects merge key by key; arrays and scalars replace.

1. **Skill arguments**: `--config '<json>'`, `--max-iterations N`, `--mark-ready`
2. **Repo file**: `<repo-root>/.claude/review-loop.json`
3. **Defaults**: `scripts/default-reviewer-config.json` (Qodo)

`resolve-review-loop-config.mjs` prints the merged result and the `sources` it used. It exits with code 2 and lists every problem when the config is invalid.

## Settings

| Setting | Default | Meaning |
|---------|---------|---------|
| `reviewerName` | `"Qodo"` | Display name used in logs and the report |
| `botLogins` | `["qodo-code-review[bot]"]` | Logins whose threads and comments count as reviewer findings. A trailing `[bot]` is optional: REST returns `name[bot]` and GraphQL returns `name`, and both match |
| `trigger.type` | `"comment"` | `comment` posts a PR comment. `request-reviewer` (re-)requests a reviewer. `none` relies on the bot running on push |
| `trigger.body` | `"/agentic_review"` | Comment text for `comment` triggers |
| `trigger.extraArgs` | `""` | Appended to `trigger.body` after a space |
| `trigger.reviewer` | (unset) | Reviewer login for `request-reviewer` triggers |
| `completionSignal.type` | `"comment-match"` | `comment-match` waits for a new bot comment matching `pattern`. `review-submitted` waits for a bot review whose `commit_id` is the head SHA |
| `completionSignal.pattern` | `"updated up to the latest commit \\S*/commit/{headSha}"` | Regex for `comment-match`. `{headSha}` is replaced by the escaped full head SHA |
| `summaryComment.marker` | `"Code Review by Qodo"` | Text identifying the bot's summary comment, used only as a cross-check. Set `summaryComment` to `null` to disable |
| `summaryComment.newFindingMarker` | `"⭐ New"` | Marks a new finding line in the summary. Struck-through lines are ignored |
| `pollIntervalSeconds` | `60` | Time between completion checks |
| `timeoutMinutes` | `15` | Wait limit per round. Qodo usually finishes in 1–5 minutes |
| `maxIterations` | `8` | Maximum review rounds per PR |
| `markReadyWhenClean` | `false` | Run `gh pr ready` after a clean review, then handle the automatic review that follows |

## Example: Repo File Tweaks for Qodo

`.claude/review-loop.json`:

```json
{
  "maxIterations": 5,
  "timeoutMinutes": 20
}
```

## Example: GitHub Copilot Code Review

Copilot is requested as a reviewer and finishes by submitting a review. It has no summary comment with new-finding markers.

```json
{
  "reviewerName": "Copilot",
  "botLogins": ["copilot-pull-request-reviewer[bot]"],
  "trigger": { "type": "request-reviewer", "reviewer": "copilot-pull-request-reviewer[bot]" },
  "completionSignal": { "type": "review-submitted" },
  "summaryComment": null
}
```

As a one-off argument:

```
/kpj:run-agentic-review-loop 1234 --config '{"reviewerName":"Copilot","botLogins":["copilot-pull-request-reviewer[bot]"],"trigger":{"type":"request-reviewer","reviewer":"copilot-pull-request-reviewer[bot]"},"completionSignal":{"type":"review-submitted"},"summaryComment":null}'
```

The REST reviewer-request endpoint may not accept Copilot's bot login on every GitHub plan. If `trigger-review.mjs` fails, request Copilot from the PR page and run the loop with `"trigger": {"type": "none"}`.

## Example: Comment-Triggered Bots

These follow the vendors' documented commands. They have not been exercised with this skill.

| Bot | `botLogins` | `trigger` | `completionSignal` |
|-----|-------------|-----------|--------------------|
| CodeRabbit | `["coderabbitai[bot]"]` | `{"type":"comment","body":"@coderabbitai review"}` | `{"type":"review-submitted"}` |
| Greptile | `["greptile-apps[bot]"]` | `{"type":"comment","body":"@greptileai review"}` | `{"type":"review-submitted"}` |
| Gemini Code Assist | `["gemini-code-assist[bot]"]` | `{"type":"comment","body":"/gemini review"}` | `{"type":"review-submitted"}` |

Set `summaryComment` to `null` unless the bot keeps a summary comment with a per-finding "new" marker.

## Choosing a Completion Signal

Choose a signal that is new for each round and tied to a commit:

- A comment the bot **creates** per round that names the commit, like Qodo's "updated up to the latest commit …/commit/&lt;sha&gt;", fits `comment-match`.
- A **review** submitted against the commit fits `review-submitted`. A bot that posts no review when it finds nothing never satisfies this signal, so the round times out. Use a comment signal for such bots if one exists.
- Never use the `updated_at` of a summary comment the bot edits in place. Bots edit those when threads resolve or commits land, without running a review.
