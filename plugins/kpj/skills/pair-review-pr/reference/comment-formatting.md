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

## Writing Concise, Clear Comments

PR authors read every word of a comment, so each extra sentence costs them time. The user's edit requests consistently ask for the same thing: a shorter comment that keeps the point and the action and drops the walkthrough. Get there on the first draft.

**Structure: point, evidence, action.**

1. **Point.** The first sentence says what's wrong and why it matters. Don't open with background or restate what the code does.
2. **Evidence.** Give the one concrete fact the author needs in order to believe the point: a symbol, a line, an error message, a permalink. A step-by-step failure scenario ("run A completes, then run B starts, then…") belongs only when the failure isn't obvious otherwise, and even then it's one sentence.
3. **Action.** One recommendation, stated assertively. Write "Move X into Y" or "I'd do X", not "I'm not sure…", "What do you think?", or a menu of alternatives. Offer an either/or only when the choice really is the author's to make.

**Explain the principle, not the mechanics.** When a suggestion rests on a design principle, name the principle in one clause. Say "the value object models how the status behaves, so its methods document themselves", not a line-by-line account of how the method body would change.

**Cut:**
- Hedges and softeners ("might", "probably worth", "just a thought").
- Restatements of the code, the diff, or the PR description.
- Detail that belongs to another comment. Write "see my comment on the activity" instead of repeating it.
- Second and third examples once the first one has made the point.
- Remedies for states the code's own invariants forbid. Check what the domain guarantees before suggesting how to handle a case, and drop the suggestion if the case can't happen.

**Length.** Most comments fit in 2-4 sentences. Use at most three short paragraphs, plus a code block when the code is the suggestion.

**Before presenting a draft,** reread it once and delete every sentence the author wouldn't miss.

### Revising the user's own comments

Keep the user's position and voice. You're editing their comment, not writing a new one. Tighten the wording and make it assertive, then add only evidence that makes it more convincing (a symbol name, a concrete consequence). If the revision is longer than the original, every added sentence needs to justify itself.

### Before and after

Each pair below is a first draft the user rejected, followed by the version they approved.

Too much walkthrough:
> ~~Without a version check, a full `save()` could overwrite a concurrently written tax status. The reverse already happens with this approach: `toAttributes()` now includes `creditCardFeeStatus` and `creditCardFeeAttemptId`, so any other writer that loads and saves the invoice while a fee run is in flight writes back the fee state it loaded. For example, a tax calculation activity resets `processing` to `pending`, and then the owning run's completion fails non-retryably even though the fee is already in Orb. The fence here only protects writes that go through this method.~~
>
> Without a version check, `save()` could overwrite concurrent writes. That already happens to the fee state here: any other writer's full save writes back the fee status it loaded, and the fence only covers writes made through this method.

Hedged, so it lacked an action:
> ~~I'm not sure run ownership belongs in the invoice aggregate. … I'd rather document that than carry the attempt ID through the aggregate, the repository and a migration. What do you think?~~
>
> Run ownership doesn't belong in the invoice aggregate. `creditCardFeeAttemptId` is a workflow run ID, which is orchestration state, so let Temporal enforce single execution instead: give the fee workflow a deterministic ID per invoice with a conflict policy that rejects a second start while one is open.

Explained mechanics where a principle was enough:
> ~~I'd move the intent onto the value object instead: `fail()` (only `processing` → `pending`) and `invalidate()` (settled → `pending`). Then this method becomes a no-op on `pending` and `this._creditCardFeeStatus = this._creditCardFeeStatus.fail()` otherwise, and most of the docblock can go.~~
>
> The value object is the model of how the status behaves, so it should carry that intent itself: `fail()` (only `processing` → `pending`) and `invalidate()` (settled → `pending`). Its methods then document themselves, and this method doesn't need a long docblock explaining which edge it means.

Offered options and type detail where one recommendation would do:
> ~~…the entity declares `creditCardFeeStatus: CreditCardFeeStatus` (non-null), but `CreditCardFeeStatusTransformer.from()` can return `null`. So per the types, this fallback guards a value that can't exist, and a later cleanup could remove it as dead code. Either type the entity field as `CreditCardFeeStatus | null`, or move the fail-safe default into the domain…~~
>
> The entity types this field as non-null, so this fallback looks like dead code and could get cleaned up by mistake. I'd move the fail-safe default into the domain, e.g. `CreditCardFeeStatus.fromPersisted(value)`, so the issuance-gate reasoning lives on the value object.

## No Severity Prefixes

Don't prefix comments with emoji or labels such as `🚨 URGENT —`, whatever the severity. State the issue plainly, and let the consequence you describe show how serious it is.

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

### High Severity — Bug

```markdown
This `parseInt` call doesn't specify a radix, which can produce unexpected results for strings with leading zeros (e.g., `"08"` in older engines).

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
