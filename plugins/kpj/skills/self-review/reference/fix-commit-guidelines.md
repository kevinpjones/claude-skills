# Fix Commit Guidelines

## Commit Strategy

Each approved finding should be fixed in its own commit, EXCEPT when findings are logically related and should be grouped.

### When to Group Fixes

Group fixes into a single commit when:

- **Same root cause**: Multiple findings stem from the same underlying issue (e.g., missing null checks on the same data flow)
- **Same refactor**: Fixing one finding naturally addresses another (e.g., extracting a helper function that eliminates duplication in two places)
- **Dependent changes**: Fixing finding A requires changing code that also addresses finding B
- **Same file, same concern**: Multiple findings in the same file about the same category of issue (e.g., three type safety fixes in the same module)

### When NOT to Group

Keep fixes in separate commits when:

- Findings are in different files with no logical connection
- Findings address different categories of concern (e.g., a bug fix and a performance optimization)
- One fix is high-risk and another is trivial — keep them separate so the high-risk change can be reverted independently

## Commit Message Format

```
self-review: [brief description of the fix]

Addresses [category] finding in [file(s)]:
[one-line description of what was wrong and what was fixed]
```

Examples:

```
self-review: Add null check for user input in processOrder

Addresses correctness finding in src/orders/processOrder.ts:
Input validation was missing for the optional discount parameter,
which could cause a TypeError when calculating totals.
```

```
self-review: Extract shared date formatting utility

Addresses simplification findings in src/reports/daily.ts and
src/reports/weekly.ts: Both files contained identical date
formatting logic that now uses a shared formatReportDate helper.
```

## Fix Execution

For each fix (or group of fixes):

1. **Read the full source file(s)** — not just the diff hunks. Understand the surrounding context.
2. **Make the minimal change** that addresses the finding. Do not refactor surrounding code or add unrelated improvements.
3. **Run linting** after each fix to catch any issues introduced.
4. **Run tests** if the project has them and they're fast enough to run per-fix.
5. **Stage only the files changed for this fix** — use `git add <specific-files>`, not `git add -A`.
6. **Commit** with the format above.

## Handling Fix Failures

If a fix introduces lint errors or test failures:

- Fix the lint/test issue as part of the same commit
- If the fix turns out to be more complex than expected, inform the user and ask whether to proceed or skip
- Never leave the working tree in a broken state between fixes
