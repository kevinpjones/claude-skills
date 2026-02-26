# Test-Split Stack Workflow

Detailed guidance for managing stacked PRs where tests are deliberately separated from implementation to keep reviews manageable.

## When to Use This Pattern

Split tests from implementation when:
- The implementation introduces significant type/interface changes that require extensive test rewrites
- Keeping tests in the implementation PR would make review unwieldy (hundreds of lines of test diff mixed with implementation diff)
- Reviewers have approved the approach of splitting tests separately

**Stack structure:**
```
main → implementation-branch (PR #1) → tests-branch (PR #2)
```

The tests branch targets the implementation branch as its base.

## The Core Problem

CI runs each branch independently. When the implementation branch changes types, renames fields, or alters behavior, existing tests inherited from the base branch break on the implementation PR — even though the tests branch has the correct fixes.

## Categories of CI Fixes on the Implementation Branch

When CI fails on the implementation branch, categorize each failure before fixing:

### Category 1: Type/Import Updates (Fix on implementation branch)

Straightforward renames and import changes that don't duplicate test logic:

- Renamed type imports (`SummaryChunk` → `SummaryRangeChunk`)
- Type casts needed for union type narrowing (`chunk as SummaryRangeChunk`)
- Added discriminator fields to existing mock objects (`type: 'summary_range'`)
- New mock activities/functions added to `mockActivities` objects

**These are safe short-term fixes** because they're mechanical updates that don't change test logic. They keep tests compiling and running against the new types without rewriting assertions.

```typescript
// Example: Adding a discriminator to an existing mock
// BEFORE (fails with "Unknown chunk type: undefined"):
{ startId: 'bus_aaa', endId: 'bus_zzz', estimatedRecordCount: 500 }

// AFTER (minimal fix):
{ type: 'summary_range', startId: 'bus_aaa', endId: 'bus_zzz', estimatedRecordCount: 500 }
```

### Category 2: Behavioral/Assertion Changes (Do NOT fix on implementation branch)

Changes where the implementation altered runtime behavior and existing test assertions no longer match:

- Renamed fields that change assertion targets (`lastProcessedUsageId` → `nextStartId` with different semantics)
- Changed function signatures requiring new test setup
- Altered control flow that changes expected call sequences
- New code paths requiring new test cases

**Do NOT duplicate these fixes** from the tests branch. The tests branch was created specifically to contain these changes in a reviewable way. Duplicating them defeats the purpose of the split.

### Category 3: Formatting/Lint (Fix on implementation branch)

Prettier or ESLint issues introduced by Category 1 fixes:

```bash
npx prettier --write <modified-test-file>
npx eslint --fix <modified-test-file>
```

Always run formatters after making Category 1 fixes.

## Decision Tree

```
CI fails on implementation branch
    │
    ├─ Are ALL failures Category 1 or 3?
    │   └─ YES → Apply minimal fixes, commit, cascade rebase, push
    │
    ├─ Are some failures Category 2?
    │   ├─ Can the failing tests be skipped/disabled with a comment?
    │   │   └─ YES → Skip with `describe.skip` + comment referencing tests PR
    │   │
    │   └─ Are fixes too extensive to apply minimally?
    │       └─ YES → Consider collapsing the stack (merge tests into implementation)
    │
    └─ Is the tests PR approved?
        ├─ YES → Collapse is safe — merge the tests PR
        └─ NO → Do not collapse; use describe.skip or wait for approval
```

## Applying Category 1 Fixes

### Step 1: Check out the implementation branch

```bash
git checkout <implementation-branch>
```

### Step 2: Identify failures

```bash
~/.claude/skills/managing-stacked-prs/scripts/check-stack-ci-status.mjs <pr1> <pr2>
# Then fetch CI logs for failing checks
gh run view <run-id> --log-failed 2>&1 | tail -80
```

### Step 3: Categorize each failure

For each failing test file, compare what the test branch changes:

```bash
git diff <implementation-branch>..<tests-branch> -- <failing-test-file>
```

If the diff shows only type imports, casts, and discriminator additions → Category 1.
If the diff shows changed assertions, new test cases, or rewritten test logic → Category 2.

### Step 4: Apply minimal fixes

Only fix Category 1 issues. Common patterns:

```bash
# Rename imports (use replace_all in Edit tool)
# Add discriminator fields to mock objects
# Add new mock functions to mockActivities
# Run prettier after each file
npx prettier --write <file>
```

### Step 5: Run tests locally

```bash
# Run the specific failing test files
docker compose exec <service> npm run jest -- <test-file-1> <test-file-2>
```

### Step 6: Commit, cascade rebase, push

```bash
git add <specific-files>
git commit -m "<ISSUE-ID>: Update test types for new interfaces"

# Cascade rebase the tests branch
git rebase --onto <implementation-branch> <implementation-branch>@{1} <tests-branch>

# Verify layers
git log --oneline <implementation-branch>..<tests-branch>

# Push
git fetch origin
git push --force-with-lease origin <implementation-branch> <tests-branch>
```

### Step 7: Update PR comment links

```bash
~/.claude/skills/managing-stacked-prs/scripts/update-pr-comment-links.mjs <owner> <repo> <impl-pr>
~/.claude/skills/managing-stacked-prs/scripts/update-pr-comment-links.mjs <owner> <repo> <tests-pr>
```

## Handling Category 2 Failures

When Category 2 failures remain after applying Category 1 fixes:

### Option A: Skip failing tests with a comment

If only a few tests are affected, skip them with an explanation:

```typescript
// Tests rewritten in PR #<tests-pr> to match new <field/type> behavior
describe.skip('generates heartbeat with tracking field', () => {
  // ...
});
```

Commit this on the implementation branch with a clear message:

```bash
git commit -m "<ISSUE-ID>: Skip tests rewritten in tests PR"
```

### Option B: Collapse the stack

When too many tests fail or the skip approach is untenable, merge the tests PR into the implementation branch. See "Collapsing the Stack" below.

## Collapsing the Stack

When the test-split becomes more trouble than it's worth — typically when:
- Category 2 failures are extensive
- Multiple rounds of fixes are needed
- **The tests PR is already approved** (required — do not collapse an unapproved tests PR)

### Step 1: Confirm with the user

Present the situation: "The implementation branch has Category 2 test failures that would require duplicating changes from the tests branch. Since both PRs are approved, should we collapse by merging the tests PR?"

### Step 2: Merge via GitHub CLI

**Use `gh pr merge`, not local `git merge`** — this properly closes the PR and maintains the GitHub audit trail:

```bash
gh pr merge <tests-pr-number> --squash
```

If the tests PR has required checks failing, you may need `--admin` (if you have admin access) or fix the checks first.

### Step 3: Pull the merged result locally

```bash
git fetch origin <implementation-branch>
git checkout <implementation-branch>
git reset --hard origin/<implementation-branch>
```

### Step 4: Verify CI

```bash
~/.claude/skills/managing-stacked-prs/scripts/check-stack-ci-status.mjs <remaining-pr-numbers>
```

The stack is now reduced by one layer. The implementation PR contains both code and tests.

## Preventing Rebase Conflicts After Fixes

When making Category 1 fixes on the implementation branch, the same lines are often modified on the tests branch. This creates predictable rebase conflicts. To minimize friction:

1. **Run prettier after every edit** on the implementation branch — this prevents formatter conflicts later
2. **Resolve import conflicts by keeping the tests branch version** — the tests branch typically has a superset of imports (e.g., `UsageRangeChunk` added on top of `SummaryRangeChunk`)
3. **After cascade rebase, always verify** with `git log --oneline <parent>..<child>` to confirm only expected commits remain
