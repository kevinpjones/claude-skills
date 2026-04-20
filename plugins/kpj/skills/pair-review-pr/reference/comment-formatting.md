# Comment Formatting Guide

## Line Width

**Wrap all comment text at 120 characters.** This applies to the comment body presented to the user in the terminal for approval AND the final text posted to GitHub. Code blocks and URLs are exempt — don't break those mid-line.

## Writing Style

Write review comments in **plain, conversational language**. No structured headers, severity badges, or category labels. Just describe the issue clearly — what's wrong and why it matters.

**Do NOT use formats like:**
```
**Correctness** · Severity: `high`
```
```
Review Note * Severity: medium
```

**Do use plain language:**
```
This parseInt call doesn't specify a radix, which can produce unexpected results for strings with leading zeros.
```

## Severity Callouts

For **high or critical** severity issues only, prefix with an emoji callout to draw attention:

```
🚨 URGENT — This parseInt call doesn't specify a radix...
```

Medium and low severity findings should NOT have any prefix or callout — just state the issue directly.

## Severity Definitions

| Level | Meaning | Action Expected |
|-------|---------|----------------|
| high | Bug, security issue, or incorrect behavior | Must fix before merge |
| medium | Maintainability, readability, or design concern | Should address in this PR |
| low | Style nit, minor optimization, or suggestion | Nice to have, can defer |

## GitHub Suggestion Blocks

Use GitHub's suggestion syntax for concrete single-hunk fixes:

````markdown
```suggestion
const result = existingHelper(input);
```
````

This renders as an "Apply suggestion" button in the GitHub UI. Use this only when:
- The fix is a single contiguous block of code
- The replacement is unambiguous
- The suggestion is complete (not a partial snippet)

For multi-location or complex changes, describe the fix in prose instead.

## Permalink References

When referencing existing code patterns in the codebase (not in the PR diff), use GitHub permalinks with commit hashes:

```markdown
See the existing pattern at [`src/utils/helpers.ts#L15-L24`](https://github.com/owner/repo/blob/abc1234/src/utils/helpers.ts#L15-L24)
```

**IMPORTANT**: Permalinks must use commit hashes reachable via github.com. Use the `generate-permalink.mjs` script to create valid links. Never use branch names in permalinks (they shift as new commits land).

## Example Comments

### High Severity — Bug (with emoji callout)

```markdown
🚨 URGENT — This `parseInt` call doesn't specify a radix, which can produce unexpected results for strings with leading zeros (e.g., `"08"` in older engines).

```suggestion
const count = parseInt(input, 10);
```
```

### Medium Severity — With Permalink

```markdown
This date formatting logic duplicates the existing `formatISODate` utility. See [`src/utils/date-helpers.ts#L12-L18`](https://github.com/owner/repo/blob/abc1234/src/utils/date-helpers.ts#L12-L18).

```suggestion
const formatted = formatISODate(createdAt);
```
```

### Low Severity — Suggestion

```markdown
Consider using a discriminated union instead of separate boolean flags. This would let TypeScript narrow the type automatically in switch/if statements.

```typescript
// Instead of:
type Config = { isAsync: boolean; isRetryable: boolean; ... }

// Consider:
type Config =
  | { mode: 'sync'; ... }
  | { mode: 'async'; retryPolicy: RetryPolicy; ... }
```
```

### General Comment (non-file-specific, for review summary)

```markdown
The overall approach of decomposing the monolithic handler into separate pipeline stages looks solid. One concern: the error recovery strategy differs between stages — stage 1 retries silently while stage 3 throws immediately. Consider standardizing the error handling pattern across all stages.
```

General comments don't attach to specific diff lines. They are collected during the review and included in the review summary body (see Step 9 in SKILL.md).
