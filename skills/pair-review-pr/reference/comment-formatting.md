# Comment Formatting Guide

## Comment Structure

Each PR review comment should follow this format:

```markdown
**[Category]** · Severity: `high|medium|low`

<Description of the issue — 1-2 sentences explaining what's wrong and why it matters.>

<Optional: reference to existing pattern in codebase via GitHub permalink>

```suggestion
// GitHub inline suggestion block — only for concrete single-hunk fixes
// This renders as a clickable "Apply suggestion" button in GitHub
```

<Optional: Additional context, explanation, or alternative approaches>
```

## Severity Levels

| Level | Meaning | Action Expected |
|-------|---------|----------------|
| `high` | Bug, security issue, or incorrect behavior | Must fix before merge |
| `medium` | Maintainability, readability, or design concern | Should address in this PR |
| `low` | Style nit, minor optimization, or suggestion | Nice to have, can defer |

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

## Comment Categories

Map agent findings to these display categories:

| Agent Source | Category Label |
|-------------|----------------|
| code-simplifier | Simplification |
| code-reviewer | Correctness |
| typescript-enforcer | Type Safety |
| efficiency-reviewer | Performance |
| User feedback | Review Note |
| Multiple agents | Combined Review |

## Example Comments

### High Severity — Bug

```markdown
**Correctness** · Severity: `high`

This `parseInt` call doesn't specify a radix, which can produce unexpected results for strings with leading zeros (e.g., `"08"` in older engines).

```suggestion
const count = parseInt(input, 10);
```
```

### Medium Severity — With Permalink

```markdown
**Simplification** · Severity: `medium`

This date formatting logic duplicates the existing `formatISODate` utility. See [`src/utils/date-helpers.ts#L12-L18`](https://github.com/owner/repo/blob/abc1234/src/utils/date-helpers.ts#L12-L18).

```suggestion
const formatted = formatISODate(createdAt);
```
```

### Low Severity — Suggestion

```markdown
**Type Safety** · Severity: `low`

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
