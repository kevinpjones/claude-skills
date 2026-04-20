# Managing PR Comment Links After Force Push

Force pushing rebased branches invalidates commit hashes referenced in PR review comment replies. This is a recurring friction point in stacked PR workflows because every rebase/force-push cycle requires updating previously posted "Resolved by [hash](link)" comments.

## The Problem

When you reply to a PR comment with:
```
Resolved by [abc1234](https://github.com/owner/repo/pull/123/commits/abc1234full...)
```

After force pushing, that commit hash no longer exists on the branch. The link becomes a 404.

## Solution: Update Comment Links

### Automated Approach

Use the update script to find and fix comment links for a PR:

```bash
~/.claude/skills/manage-stacked-pr/scripts/update-pr-comment-links.mjs <owner> <repo> <pr_number>
```

The script:
1. Fetches all review comments on the PR
2. Finds comments containing commit links (the `Resolved by [hash](link)` pattern)
3. Maps old commit hashes to new ones by matching commit messages via `git log`
4. Updates comment bodies with corrected hashes via GraphQL

### Manual Approach

If the automated approach doesn't work (e.g., commit messages changed during rebase):

1. **Find the new commit hash** by matching the commit message:
   ```bash
   git log --oneline -10 <branch>
   ```

2. **Find PR comment IDs** that need updating:
   ```bash
   gh api repos/<owner>/<repo>/pulls/<pr>/comments \
     --jq '.[] | select(.body | contains("Resolved by")) | {id, body}'
   ```

3. **Update each comment** via GraphQL:
   ```bash
   gh api graphql -f query='
   mutation($id: ID!, $body: String!) {
     updatePullRequestReviewComment(input: {
       pullRequestReviewCommentId: $id
       body: $body
     }) {
       pullRequestReviewComment { id }
     }
   }' -f id="<comment-node-id>" -f body="Resolved by [<new-short>](<new-link>)"
   ```

## When to Update Links

- After every force push that follows a rebase
- After rebasing onto updated main
- After inserting a new branch and cascading rebases

## Batch Operations

For multiple PRs in a stack, run the update script for each PR:

```bash
~/.claude/skills/manage-stacked-pr/scripts/update-pr-comment-links.mjs owner repo 42
~/.claude/skills/manage-stacked-pr/scripts/update-pr-comment-links.mjs owner repo 43
~/.claude/skills/manage-stacked-pr/scripts/update-pr-comment-links.mjs owner repo 44
```

## Batching GraphQL Mutations

When resolving multiple threads, batch them in a single API call:

```bash
gh api graphql -f query='mutation {
  t1: resolveReviewThread(input: {threadId: "PRRT_abc"}) { thread { isResolved } }
  t2: resolveReviewThread(input: {threadId: "PRRT_def"}) { thread { isResolved } }
  t3: resolveReviewThread(input: {threadId: "PRRT_ghi"}) { thread { isResolved } }
}'
```

This is more efficient than making separate API calls for each thread.

## Prevention

To minimize the link invalidation problem:
- Batch all comment replies/resolutions AFTER the final force push (not before)
- Address all review comments on a branch before rebasing (reduces rebase cycles)
- When possible, combine the "address comments + rebase + push" cycle to minimize the number of force pushes
