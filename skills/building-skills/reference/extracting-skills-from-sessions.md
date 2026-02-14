# Extracting Skills from Claude Code Sessions

This guide covers how to mine your Claude Code conversation history for reusable skill candidates, evaluate them, and extract them into well-structured skills.

## Table of Contents

- [Overview](#overview)
- [Browsing Sessions](#browsing-sessions)
- [Identifying Skill Candidates](#identifying-skill-candidates)
- [Evaluation Criteria](#evaluation-criteria)
- [Extraction Process](#extraction-process)
- [Session File Format Reference](#session-file-format-reference)

## Overview

Your Claude Code session history is a rich source of potential skills. Conversations where you solved complex problems, built multi-step workflows, or repeatedly performed similar tasks are all candidates for extraction into reusable skills.

**The key insight**: If you've done it well once in a conversation, you can codify it as a skill so Claude does it well every time.

## Browsing Sessions

### Using the Session Browser

List recent sessions across all projects:

```bash
node scripts/list-sessions.mjs
```

Filter by project:

```bash
node scripts/list-sessions.mjs --project my-project
```

Show sessions from the last week:

```bash
node scripts/list-sessions.mjs --since 2026-02-01
```

Output as JSON for further processing:

```bash
node scripts/list-sessions.mjs --json | jq '.[] | select(.messageCount > 10)'
```

### Examining a Session

Get a summary of tool usage and message counts:

```bash
node scripts/extract-session.mjs <session-id> --summary-only
```

View the full conversation in condensed form:

```bash
node scripts/extract-session.mjs <session-id>
```

See only tool interactions (useful for identifying CLI workflows):

```bash
node scripts/extract-session.mjs <session-id> --tools-only
```

Export as JSON for analysis:

```bash
node scripts/extract-session.mjs <session-id> --json
```

### Using the JSONL File Directly

You can also read session files directly with Claude Code:

```
Read the session at ~/.claude/projects/<project-dir>/<session-id>.jsonl
```

This gives Claude the full conversation context for extraction.

## Identifying Skill Candidates

### What Makes a Conversation Skill-Worthy?

**Strong candidates:**

1. **Repeated workflows**: Tasks you've asked Claude to do multiple times across sessions
   - "Every time I create a PR, I want it to follow this format..."
   - "I always run these same validation steps before deploying..."

2. **Specialized knowledge**: Conversations where Claude needed domain-specific context
   - Complex GraphQL queries for a specific API
   - Project-specific build and deploy processes
   - Custom data transformation pipelines

3. **CLI chains**: Multi-step command sequences that work well together
   - `gh` + `jq` + `git` workflows
   - AWS CLI orchestration
   - Database migration sequences

4. **Complex decision trees**: Workflows with conditional branching
   - "If the PR has review comments, do X, otherwise do Y..."
   - "Check if the service is running, if not, start it, then..."

5. **Template-driven outputs**: Conversations that produce structured output
   - PR descriptions in a specific format
   - Documentation following a template
   - Code generation with consistent patterns

**Weak candidates (probably not worth extracting):**

- One-off debugging sessions (too specific)
- Simple file edits (Claude already knows how)
- Conversations mostly about understanding code (not actionable enough)
- Tasks with no repeatable pattern

### Quick Scan Strategy

1. Run `list-sessions.mjs --limit 50` to see recent sessions
2. Look for sessions with high message counts (10+) - these often involve complex workflows
3. Check summaries for repeated themes across sessions
4. Run `--summary-only` on promising sessions to see tool usage patterns
5. Sessions heavy on `Bash`, `Write`, and `Edit` tools often contain extractable workflows

## Evaluation Criteria

Score each candidate on these dimensions (1-5 scale):

### 1. Reusability (Weight: High)

How often would this skill be used again?

- **5**: Weekly or more often (PR workflows, deploy scripts)
- **3**: Monthly (data migrations, report generation)
- **1**: Probably never again (one-off investigation)

### 2. Complexity (Weight: Medium)

Is it complex enough to warrant a skill?

- **5**: Multi-step workflow with branching logic and multiple tools
- **3**: Several steps that are easy to forget or get wrong
- **1**: Simple enough to describe in a single sentence

### 3. Specificity (Weight: Medium)

Does it encode specific knowledge Claude wouldn't have?

- **5**: Project-specific APIs, custom formats, internal tooling
- **3**: Standard tools but in a specific combination
- **1**: General knowledge Claude already has

### 4. Generalizability (Weight: Low-Medium)

Can it work across different inputs/projects?

- **5**: Works with any input (parameterized, flexible)
- **3**: Works for a category of inputs (e.g., any Node.js project)
- **1**: Only works for one exact scenario

### Scoring Guide

| Total Score | Recommendation |
|-------------|----------------|
| 16-20 | Extract immediately - high-value skill |
| 11-15 | Good candidate - extract when you have time |
| 6-10 | Maybe - consider if you'll really reuse it |
| 4-5 | Skip - not worth the overhead |

## Extraction Process

### Step 1: Gather the Conversation

```bash
# Get the full conversation
node scripts/extract-session.mjs <session-id> --max-text 0

# Or read the JSONL directly for maximum context
# (useful when working inside Claude Code)
```

### Step 2: Identify the Core Workflow

From the conversation, extract:

1. **The trigger**: What user request started this workflow?
2. **The steps**: What sequence of actions did Claude take?
3. **The tools**: Which CLI tools and commands were used?
4. **The decisions**: What conditional logic was involved?
5. **The output**: What was the end result?

### Step 3: Generalize

Transform conversation-specific details into parameterized instructions:

**Before (from conversation):**
```
I ran `gh pr view 42 --json reviewDecision` to check the PR status...
```

**After (generalized):**
```
Check the PR status:
```bash
gh pr view $1 --json reviewDecision
```
```

Look for:
- Hardcoded values that should be parameters (`$ARGUMENTS`)
- Project-specific paths that should be relative
- Usernames/repos that should be dynamically resolved
- One-off workarounds that shouldn't be in the skill

### Step 4: Structure as a Skill

Follow the standard skill creation process:

1. Choose a gerund-form name
2. Write a description with trigger keywords
3. Organize into SKILL.md + supporting files
4. Add the CLI commands and scripts from the conversation
5. Include the decision logic as clear instructions

### Step 5: Test Against the Original Session

The original conversation is your first test case:

1. Would the new skill have been triggered by the original user query?
2. Does the skill's workflow match what actually worked in the conversation?
3. Are all the CLI commands and scripts present?
4. Did you miss any edge cases the conversation handled?

### Example: Extracting a PR Comment Skill

**From session**: A conversation where the user addressed PR review comments using `gh` CLI with GraphQL queries.

**Extracted into**:
```
addressing-pr-comments/
├── SKILL.md (workflow overview, triggers, step-by-step)
├── reference/
│   └── graphql-queries.md (the GraphQL queries for fetching/resolving threads)
└── scripts/
    └── fetch-pr-threads.js (Node.js script wrapping the GraphQL query)
```

**Key extraction decisions**:
- The GraphQL query was complex enough to put in a reference file
- The workflow had clear conditional branching (skill-worthy)
- PR numbers and repo info were parameterized
- The commit-and-comment-and-resolve loop was preserved as structured steps

## Session File Format Reference

### Location

Session files are stored in `~/.claude/projects/<project-dir>/`:
- `sessions-index.json` - Index of all sessions for the project
- `<session-id>.jsonl` - Individual session conversation data

### sessions-index.json Structure

```json
{
  "version": 1,
  "entries": [
    {
      "sessionId": "uuid",
      "fullPath": "/absolute/path/to/session.jsonl",
      "fileMtime": 1769642987115,
      "firstPrompt": "First 120 chars of first user message...",
      "summary": "AI-generated session summary",
      "messageCount": 12,
      "created": "2026-01-28T22:41:20.913Z",
      "modified": "2026-01-28T23:15:09.350Z",
      "gitBranch": "main",
      "projectPath": "/Users/name/projects/my-project",
      "isSidechain": false
    }
  ],
  "originalPath": "/Users/name/projects/my-project"
}
```

### JSONL Line Types

Each line in a `.jsonl` session file is a JSON object with a `type` field:

| Type | Description | Useful for extraction? |
|------|-------------|----------------------|
| `user` | User messages | Yes - shows what triggered the workflow |
| `assistant` | Claude's responses (text, tool_use, thinking) | Yes - contains the workflow steps |
| `file-history-snapshot` | File state snapshots | No - skip |
| `progress` | Progress updates | No - skip |

### Message Content Blocks

Assistant messages contain an array of content blocks:

| Block Type | Description |
|-----------|-------------|
| `text` | Claude's text response |
| `tool_use` | Tool invocation (name + input) |
| `thinking` | Claude's internal reasoning (skip for extraction) |
| `tool_result` | Result from a tool call |

### Useful Fields on Message Entries

| Field | Description |
|-------|-------------|
| `message.role` | `user` or `assistant` |
| `message.content` | String (user) or array of blocks (assistant) |
| `timestamp` | ISO timestamp |
| `sessionId` | Session identifier |
| `gitBranch` | Active git branch |
| `cwd` | Working directory |
