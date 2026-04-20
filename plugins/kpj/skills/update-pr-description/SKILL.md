---
name: update-pr-description
description: Use this skill when updating, writing, or populating a GitHub pull request description. This includes describing PR changes in problem/solution format, enhancing existing PR summaries, or filling in the description section of a PR template. Trigger keywords include "update PR description", "describe PR", "PR summary", "pull request description", "fill in PR", "write PR description".
argument-hint: [pr-number]
---

# Updating Pull Request Descriptions

Generate high-level PR descriptions in **Problem / Solution** format by gathering context and understanding the changes conceptually.

## Prerequisites

- An existing pull request (local branch must be pushed)
- GitHub CLI (`gh`) authenticated

## Workflow

### Step 1: Identify the Pull Request

Determine the PR number:
- If provided as argument, use `$ARGUMENTS`
- Otherwise, get the PR for the current branch:
  ```bash
  gh pr view --json number,title,body,baseRefName,headRefName
  ```

If no PR exists, inform the user and stop.

### Step 2: Gather Context

Collect information from multiple sources to understand the changes:

**2a. Get the PR diff and metadata:**
```bash
gh pr diff <pr-number>
gh pr view <pr-number> --json title,body,baseRefName,headRefName,commits
```

**2b. Determine the Memory Bank project:**

First, list available memory bank projects:
```
Use mcp__memory_bank__list_projects to see available projects
```

**If a memory bank project has already been established in this conversation**, use that project.

**If no project has been specified and it is ambiguous which project applies** (e.g., multiple projects exist, or the repository name doesn't clearly match a project), you MUST use the `AskUserQuestion` tool:

```
Question: "Which Memory Bank project should I reference for context?"
Options:
- List each available project as an option
- Include "None - skip memory bank context" as final option
```

Wait for user response before proceeding.

**Once the project is determined**, read relevant context files:
- Use `mcp__memory_bank__list_project_files` to find available files
- Read `projectbrief.md`, `productContext.md`, and `activeContext.md` if available
- This provides background on project goals and current focus

**2c. Use code retrieval for semantic understanding:**
- Use `mcp__augment__codebase-retrieval` to understand affected code areas
- Query for concepts related to the changed files

**2d. Examine commit messages:**
```bash
gh pr view <pr-number> --json commits --jq '.commits[].messageHeadline'
```

### Step 3: Analyze and Understand

Before writing, synthesize your understanding:

1. **What problem does this PR solve?**
   - Why were these changes needed?
   - What was broken, missing, or suboptimal?
   - What user need or technical debt does this address?

2. **What is the solution approach?**
   - How does the implementation solve the problem?
   - What key decisions or patterns were used?
   - What tradeoffs were made and why?

**Important constraints:**
- Focus on concepts, motivations, and tradeoffs
- Do NOT include code snippets
- Do NOT describe exact code changes (the diff shows that)
- Write at a level that explains "why" and "what" not "how"

### Step 4: Check Existing Description

Parse the current PR body:
```bash
gh pr view <pr-number> --json body --jq '.body'
```

**If the PR uses a template**, identify these sections:
- Description/Summary section (where your content goes)
- Other sections (testing, checklist, etc.) - **PRESERVE THESE**

**If the description section is NOT empty**, you MUST use the `AskUserQuestion` tool:

```
Question: "The PR description already has content. How should I handle it?"
Options:
1. "Overwrite" - Replace existing description with generated content
2. "Append" - Add generated content after existing description
3. "Combine" - Intelligently merge existing and generated content
4. "Cancel" - Keep existing description unchanged
```

Wait for user response before proceeding.

### Step 5: Generate the Description

Write the description in this format:

```markdown
## Problem

[1-3 paragraphs explaining the problem being solved]
- What issue or need prompted this change?
- What was the impact of not having this?

## Solution

[1-3 paragraphs explaining the solution approach]
- How does this PR address the problem?
- What key decisions were made?
- What tradeoffs were considered?
```

**Writing guidelines:**
- Be concise but complete
- Use clear, non-technical language where possible
- Explain the "why" behind decisions
- Mention any notable tradeoffs or alternatives considered
- Keep total length reasonable (aim for 100-300 words)

### Step 6: Update the PR

Construct the new body preserving template structure:

```bash
gh pr edit <pr-number> --body "$(cat <<'EOF'
<new body content here>
EOF
)"
```

**Template preservation:**
- If the PR has a template with multiple sections, only replace the description/summary section
- Keep all other sections (testing instructions, checklists, etc.) intact
- Maintain the original formatting and section headers

### Step 7: Confirm Success

```bash
gh pr view <pr-number> --json body --jq '.body'
```

Show the user the updated description.

## Example Output

**Problem**

The billing service was calculating usage summaries in a single batch, causing timeouts for accounts with large volumes of usage records. This blocked month-end invoice generation for enterprise customers and required manual intervention to complete billing cycles.

**Solution**

Implemented chunked processing for usage summaries that breaks large datasets into manageable batches. The chunking occurs at the usage-level rather than account-level, ensuring even accounts with millions of records can be processed within timeout limits. This approach was chosen over parallel processing to maintain consistency guarantees and avoid race conditions in the summary aggregation.

## CLI Reference

```bash
# View PR details
gh pr view [<number>] --json number,title,body,baseRefName,commits

# Get PR diff
gh pr diff [<number>]

# Update PR body
gh pr edit <number> --body "<new-body>"

# Get just the body
gh pr view <number> --json body --jq '.body'
```

## Troubleshooting

### No PR found for current branch
The branch may not be pushed or no PR exists. Create one first:
```bash
gh pr create
```

### Permission denied editing PR
Ensure you're authenticated and have write access:
```bash
gh auth status
```

### Template sections getting overwritten
Carefully parse the existing body to identify section boundaries. Use regex or string matching to find the description section markers and only replace content within those bounds.