# Memory Bank MCP Tools Reference

Complete reference for the Memory Bank MCP tools used during project initialization.

## Tool Overview

| Tool | Purpose | When to Use |
|---|---|---|
| `list_projects` | List all projects | Check existing projects before creating |
| `list_project_files` | List files in a project | Verify file structure after creation |
| `peek_file` | Quick file inspection | Check file size before reading |
| `memory_bank_read` | Read file content | Read files with line numbers for patching |
| `memory_bank_write` | Create a new file | Initialize project files |
| `memory_bank_update` | Overwrite entire file | Replace file content completely |
| `memory_bank_patch` | Surgical line-range edit | Targeted updates (preferred) |
| `memory_bank_delete` | Archive and remove file | Remove outdated files |
| `memory_bank_grep_file` | Search within a file | Find specific content in one file |
| `memory_bank_grep_project` | Search across project | Find content across all project files |
| `get_project_history` | View change history | Review what changed and when |
| `get_file_at_time` | Read historical version | Compare with previous state |
| `get_project_file_history_diff` | Diff between versions | See what changed between versions |

## Detailed Tool Usage

### Listing and Discovery

**List all projects:**
```
mcp__memory_bank__list_projects()
```
Always check this before creating a new project to avoid duplicates.

**List files in a project:**
```
mcp__memory_bank__list_project_files(projectName)
```
Use after initialization to verify all core files were created.

### Reading Files

**Peek first, read second.** Always peek before reading to check file size:

```
mcp__memory_bank__peek_file(projectName, fileName, previewLines=10)
```
Returns: total line count + preview of first N lines.

**Read full file (small files, <50 lines):**
```
mcp__memory_bank__memory_bank_read(projectName, fileName)
```

**Read with line numbers (for patching):**
```
mcp__memory_bank__memory_bank_read(projectName, fileName, includeLineNumbers=true)
```
Returns lines prefixed with `1|`, `2|`, etc. Required before using `memory_bank_patch`.

**Read a section (large files):**
```
mcp__memory_bank__memory_bank_read(projectName, fileName, startLine=10, maxLines=20)
```
Reads 20 lines starting from line 10. Use this for files over 50 lines.

### Writing Files

**Create a new file:**
```
mcp__memory_bank__memory_bank_write(projectName, fileName, content)
```
Use for initial file creation. Fails if file already exists — use `memory_bank_update` to overwrite.

**Overwrite entire file:**
```
mcp__memory_bank__memory_bank_update(projectName, fileName, content)
```
Replaces all content. Use sparingly — prefer `memory_bank_patch` for targeted updates.

### Patching Files (Preferred for Updates)

**Apply a surgical patch:**
```
mcp__memory_bank__memory_bank_patch(
  projectName,
  fileName,
  startLine,    // 1-based line number where replacement starts
  endLine,      // 1-based line number where replacement ends (inclusive)
  oldContent,   // exact content at those lines (for verification)
  newContent    // replacement content
)
```

**Patch workflow:**
1. Read the file with line numbers enabled
2. Identify the line range to modify
3. Copy the exact `oldContent` from those lines (without line number prefixes)
4. Write the `newContent` replacement
5. The tool verifies `oldContent` matches before applying

**Example: Adding a new requirement to projectbrief.md**

First, read with line numbers:
```
mcp__memory_bank__memory_bank_read("my-project", "projectbrief.md", includeLineNumbers=true)
```

Output might show:
```
8|## Requirements
9|
10|- User authentication
11|- Dashboard view
12|
13|## Constraints
```

Patch to add a requirement:
```
mcp__memory_bank__memory_bank_patch(
  "my-project",
  "projectbrief.md",
  10, 11,
  "- User authentication\n- Dashboard view",
  "- User authentication\n- Dashboard view\n- API rate limiting\n- Role-based access control"
)
```

### Searching

**Search within one file:**
```
mcp__memory_bank__memory_bank_grep_file(projectName, fileName, pattern, contextLines=2)
```
Literal string match (not regex). Returns matches with surrounding context.

**Search across all project files:**
```
mcp__memory_bank__memory_bank_grep_project(projectName, pattern, contextLines=2, maxResults=100)
```
Use before creating content to check if it already exists somewhere.

### History and Diffing

**View project change history:**
```
mcp__memory_bank__get_project_history(projectName)
```
Returns metadata for all changes: timestamp, action, actor, fileName.

**Read a file at a specific point in time:**
```
mcp__memory_bank__get_file_at_time(projectName, fileName, timestamp)
```
Timestamp format: ISO 8601 (e.g., `2024-01-15T10:30:00.000Z`).

**Diff between file versions:**
```
mcp__memory_bank__get_project_file_history_diff(projectName, fileName, versionFrom, versionTo)
```
Returns unified diff format. `versionFrom` and `versionTo` are 1-based version numbers.

## Best Practices

### Performance
- **Peek before reading** — avoid loading large files into context unnecessarily
- **Read sections** — use `startLine`/`maxLines` for files over 50 lines
- **Grep before creating** — check for existing content to avoid duplication

### Data Integrity
- **Always use patch with verification** — the `oldContent` parameter prevents accidental overwrites
- **Read with line numbers before patching** — ensures accurate line targeting
- **Re-read after each patch** — line numbers shift after every update, so you must re-read the file before applying another patch to the same file
- **Use `memory_bank_write` for new files** — it fails if the file exists, preventing accidental overwrites
- **Use `memory_bank_update` only for full rewrites** — when the entire file content needs replacement

### File Organization
- Keep files focused on a single concern
- Use consistent heading structure within files
- Add a `## Last Updated` section to `activeContext.md` to track currency
