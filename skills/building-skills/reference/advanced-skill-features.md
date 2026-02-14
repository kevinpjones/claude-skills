# Advanced Skill Features

This reference covers advanced skill capabilities documented in the official Claude Code Skills system.

## Table of Contents

- [String Substitutions](#string-substitutions)
- [Dynamic Context Injection](#dynamic-context-injection)
- [Forked Subagent Execution](#forked-subagent-execution)
- [Skill Scope and Priority](#skill-scope-and-priority)
- [Nested Directory Discovery](#nested-directory-discovery)
- [Evaluation-Driven Development](#evaluation-driven-development)

## String Substitutions

Skills support variable substitution in their markdown content, allowing dynamic behavior based on how the skill is invoked.

### Argument Substitutions

When a user invokes a skill with arguments (e.g., `/my-skill arg1 arg2`), the arguments are available via substitution variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `$ARGUMENTS` | The full argument string | `/my-skill foo bar` -> `foo bar` |
| `$ARGUMENTS[0]` | First argument (0-indexed) | `/my-skill foo bar` -> `foo` |
| `$ARGUMENTS[1]` | Second argument | `/my-skill foo bar` -> `bar` |
| `$1` | Alias for `$ARGUMENTS[0]` | `/my-skill foo` -> `foo` |
| `$2` | Alias for `$ARGUMENTS[1]` | `/my-skill foo bar` -> `bar` |

### Environment Substitutions

| Variable | Description |
|----------|-------------|
| `${CLAUDE_SESSION_ID}` | Unique identifier for the current Claude Code session |

### Usage in SKILL.md

```markdown
---
name: checking-pr
description: Use this skill when reviewing a specific pull request by number.
argument-hint: "[PR-number]"
---

# PR Review

Review pull request #$ARGUMENTS for code quality, security, and best practices.

Run:
```bash
gh pr view $1 --json title,body,commits
gh pr diff $1
```
```

### Tips

- Use `argument-hint` in frontmatter to show users what arguments are expected
- Arguments are optional; design skills to work with or without them
- `$ARGUMENTS` is the full string, useful when you don't know argument count

## Dynamic Context Injection

Skills can dynamically inject content from commands or files using the `` <bang>`command` `` syntax. The command runs at skill load time and its stdout is inlined into the skill content.

### Syntax

```markdown
The current git branch is: <bang>`git branch --show-current`

Recent commits:
<bang>`git log --oneline -5`
```

### Use Cases

**Inject project context:**
```markdown
## Current Project State

Package info:
<bang>`cat package.json | jq '{name, version, scripts}'`

Git status:
<bang>`git status --short`
```

**Inject file contents:**
```markdown
## Configuration Reference

Current eslint config:
<bang>`cat .eslintrc.json`
```

**Inject command output:**
```markdown
## Available Scripts

<bang>`npm run --json 2>/dev/null | jq -r 'keys[]'`
```

### Important Notes

- Commands run in the project's working directory
- Commands execute at skill load time, not at invocation time
- Keep commands fast; slow commands delay skill loading
- Stderr is not captured; only stdout is injected
- If a command fails, the substitution is empty

## Forked Subagent Execution

The `context: fork` frontmatter field causes a skill to execute in a separate subagent context rather than the main conversation.

### Configuration

```yaml
---
name: analyzing-test-coverage
description: Use this skill when analyzing test coverage reports or identifying untested code paths.
context: fork
agent: code-coverage-reviewer
---

Analyze test coverage for the specified files or the most recently changed files.
```

### When to Use `context: fork`

- **Isolated analysis**: Tasks that should not pollute the main conversation context
- **Parallel execution**: Skills that can run independently alongside other work
- **Resource-intensive tasks**: Skills that consume significant context window
- **Specialized subagents**: When you want to leverage a specific agent type

### The `agent` Field

When using `context: fork`, the optional `agent` field specifies which subagent type handles execution:

```yaml
context: fork
agent: code-reviewer  # Uses the code-reviewer subagent type
```

If `agent` is omitted, the default general-purpose agent is used.

## Skill Scope and Priority

Skills can be installed at multiple levels. When skills with the same name exist at different levels, priority determines which one is used.

### Priority Order (highest to lowest)

1. **Enterprise skills** - Managed by organization admins
2. **Personal skills** - `~/.claude/skills/` (user-specific, all projects)
3. **Project skills** - `.claude/skills/` (project-specific, shared with team)

### Implications

- A personal skill named `deploying-services` overrides a project skill with the same name
- Enterprise skills cannot be overridden
- Use unique, specific names to avoid unintended collisions
- Project skills are version-controlled and shared; personal skills are private

### Choosing Skill Location

| Use Case | Location | Why |
|----------|----------|-----|
| Cross-project utility | `~/.claude/skills/` | Available everywhere |
| Team workflow | `.claude/skills/` | Shared via version control |
| Personal preference | `~/.claude/skills/` | Only you use it |
| Project-specific | `.claude/skills/` | Tied to project context |

## Nested Directory Discovery

Claude Code discovers skills in nested directories, which is useful for monorepo setups.

### How It Works

Skills are discovered from:
- `~/.claude/skills/*/SKILL.md` (personal)
- `.claude/skills/*/SKILL.md` (project root)
- `packages/*/. claude/skills/*/SKILL.md` (nested packages in monorepos)

### Monorepo Example

```
my-monorepo/
├── .claude/skills/
│   └── deploying-services/SKILL.md     # Shared across monorepo
├── packages/
│   ├── frontend/
│   │   └── .claude/skills/
│   │       └── building-ui/SKILL.md     # Frontend-specific
│   └── backend/
│       └── .claude/skills/
│           └── managing-api/SKILL.md    # Backend-specific
```

### Tips

- Place shared skills at the monorepo root `.claude/skills/`
- Place package-specific skills in the package's `.claude/skills/`
- Skills in nested packages are only discovered when working within that package's directory

## Evaluation-Driven Development

Use automated evaluations to iteratively improve skill quality, similar to test-driven development.

### Approach

1. **Define expected outcomes**: Write test cases describing what the skill should produce for specific inputs
2. **Create the skill**: Write the initial SKILL.md and supporting files
3. **Run evaluations**: Test the skill against your expected outcomes
4. **Iterate**: Refine instructions based on evaluation results

### Evaluation Structure

```
skill-name/
├── SKILL.md
├── evals/
│   ├── eval-basic-usage.md
│   ├── eval-edge-cases.md
│   └── eval-complex-scenario.md
```

### Example Evaluation File

```markdown
# Eval: Basic CSV Processing

## Input
User says: "Filter the users.csv file to only show active users"

## Expected Behavior
1. Reads the CSV file structure first
2. Uses xsv or similar CLI tool
3. Filters on status/active column
4. Outputs filtered results

## Success Criteria
- [ ] Correct CLI command used
- [ ] Filter applied to correct column
- [ ] Output is valid CSV
- [ ] No data loss in non-filtered columns
```

### Tips

- Start with 3-5 core evaluation cases
- Include edge cases (empty input, malformed data, missing files)
- Test both the "happy path" and error handling
- Evaluate description quality by testing if the skill is invoked for expected queries
- Iterate on instructions based on evaluation failures
