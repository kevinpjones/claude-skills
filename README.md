# Claude Code Skills

A collection of personal [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) that extend Claude Code with reusable workflows for GitHub PR management, skill authoring, and project knowledge management.

The Memory Bank skills are designed to work with [memory-bank-mcp](https://github.com/kevinpjones/memory-bank-mcp/).

## Installation

Clone or symlink this repository into your Claude Code skills directory:

```bash
# Clone directly into the skills directory
git clone <repo-url> ~/.claude/skills

# Or symlink individual skills
ln -s /path/to/claude-skills/skills/address-pr-comments ~/.claude/skills/address-pr-comments
```

### Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- Git 2.32+ (required for `--trailer` flag in stacked PRs)
- Node.js v24+ (for helper scripts)

## Skills

### initialize-memory-bank-project

Sets up a new [Memory Bank](https://github.com/kevinpjones/memory-bank-mcp/) project through structured codebase analysis, iterative user interviews, and documentation initialization. Creates and populates core memory bank files (projectbrief, productContext, systemPatterns, techContext, activeContext), analyzes the codebase for patterns and tech stack, then conducts a guided interview to capture requirements, constraints, and architectural decisions. Finishes by generating an implementation plan.

**Invoke with:** `/initialize-memory-bank-project [project-name]`

### resume-memory-bank-project

Resumes work on an existing [Memory Bank](https://github.com/kevinpjones/memory-bank-mcp/) project by reviewing all memory bank files, validating context integrity, assessing current codebase state, and generating a summary with implementation plan. Runs in a forked subagent (`context: fork`) to perform research and report back with line-number references into the memory bank for easy navigation.

**Invoke with:** `/resume-memory-bank-project [project-name] [initial-focus]`

### address-pr-comments

Systematically works through unresolved PR review comments: fetches threads via the GitHub GraphQL API, makes code changes, commits fixes, replies with commit links, and resolves threads. Supports declining feedback with professional justifications and skipping comments.

**Invoke with:** `/address-pr-comments [PR link or number]`

### build-skill

An interactive guide for creating, editing, converting, and extracting Claude Code skills. Covers SKILL.md authoring, frontmatter configuration, description writing for reliable invocation, progressive disclosure patterns, sub-agent-to-skill conversion, and mining session history for reusable skill candidates. Adapted from [metaskills/skill-builder](https://github.com/metaskills/skill-builder).

**Invoke with:** `/build-skill`

### manage-stacked-pr

Manages stacked PR workflows using native git and GitHub CLI. Tracks stack relationships through commit trailers (`Stack-Id`, `Stack-Parent-Branch`, `Stack-Position`). Supports initializing stacks, adding/inserting branches, rebasing and synchronizing, force-pushing safely with `--force-with-lease`, creating PRs with correct base targets, adopting existing stacks, checking CI status across a stack, and managing test-split stacks.

**Invoke with:** `/manage-stacked-pr`

### update-pr-description

Generates high-level PR descriptions in Problem/Solution format by analyzing the diff, commit history, and project context from Memory Bank. Preserves existing PR template sections and prompts before overwriting content.

**Invoke with:** `/update-pr-description [pr-number]`

## Structure

Each skill follows the standard Claude Code skill layout:

```
skills/<skill-name>/
  SKILL.md              # Required - instructions and frontmatter
  scripts/              # Optional - Node.js helper scripts (ESM, .mjs)
  *.md                  # Optional - supporting docs with intention-revealing names
```

Scripts are executable Node.js modules that handle GitHub GraphQL queries, stack detection, commit validation, and other operations that benefit from structured output.

## Companion Skills

Several skills reference each other:

- **manage-stacked-pr** uses `address-pr-comments` for resolving review threads across a stack and `update-pr-description` for writing PR bodies.
- **address-pr-comments** operates standalone but integrates naturally into the stacked PR review workflow.
- **update-pr-description** reads from Memory Bank projects (via [memory-bank-mcp](https://github.com/kevinpjones/memory-bank-mcp/)) for project context when generating PR descriptions.
- **initialize-memory-bank-project** creates the Memory Bank project structure that `update-pr-description` and `resume-memory-bank-project` read from.
- **resume-memory-bank-project** loads and validates the project context created by `initialize-memory-bank-project`, producing a summary for the main conversation.
