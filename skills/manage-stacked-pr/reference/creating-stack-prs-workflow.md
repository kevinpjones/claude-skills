# Creating PRs for a Stack

Create GitHub PRs with each targeting its parent branch, including a stack navigation section.

## Step 1: Detect Stack and Ensure Branches Are Pushed

```bash
~/.claude/skills/manage-stacked-pr/scripts/detect-stack.mjs
# Push any unpushed branches
git push -u origin <branch-name>
```

## Step 2: Check for PR Template

```bash
find .github -name 'PULL_REQUEST_TEMPLATE*' -o -name 'pull_request_template*' 2>/dev/null
```

If a template exists, use it. Otherwise use Problem/Solution format.

## Step 3: Create PRs Bottom-to-Top

Each PR uses `--base` to target its parent branch and includes a **PR Stack** section at the bottom of the body using a **numbered list** (not a table).

**Why a list instead of a table:** GitHub auto-renders PR references (`#123`) with the full PR title and merge status icon in list items, but NOT inside table cells. A list stays current automatically — no stale Title column to maintain.

### Stack List Format

For a 3-PR stack, from the perspective of PR #2:

```markdown
---

#### PR Stack: `auth-system`

1. #101
2. 👉 **This PR** — login API
3. #103
```

- Use `👉 **This PR**` for the current PR's row, followed by `—` and a short stable role description
- For other PRs, just use the `#number` reference — GitHub renders the title and status automatically
- The role description after `—` should describe the PR's purpose in the stack (not duplicate the PR title)

### Example PR Creation

Create PRs bottom-to-top, each targeting its parent branch:

```bash
gh pr create --base main --head PROJ-123/feat/user-model \
  --title "PROJ-123: Add user model" --body "$(cat <<'EOF'
## Problem
...

## Solution
...

---

#### PR Stack: `auth-system`

1. 👉 **This PR** — database migration
2. #TBD
3. #TBD
EOF
)"
```

## Step 4: Update Stack Lists

After all PRs are created, update each PR body with actual PR numbers using `gh pr edit <number> --body "..."`. Replace `#TBD` placeholders with real PR numbers.

Use the `update-pr-description` skill for richer Problem/Solution content.