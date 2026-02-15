---
name: resuming-memory-bank-projects
description: Use this skill when resuming work on an existing Memory Bank project, loading project context at the start of a session, or re-familiarizing with a project after time away. This includes reviewing memory bank files, validating context integrity, assessing current state, identifying next steps, and generating an implementation plan. Trigger keywords include "resume project", "load project", "continue project", "pick up where I left off", "resume memory bank", "what was I working on", "project status", "get back to project", "reload project context".
argument-hint: "[project-name] [initial-focus]"
context: fork
---

# Resuming Memory Bank Projects

Review an existing Memory Bank project, validate its context, assess current state, and produce a summary with next steps and an implementation plan. This skill runs in a forked subagent — your output is a comprehensive report back to the main conversation.

**CRITICAL: You MUST only read memory bank files belonging to the project specified in `$ARGUMENTS`. Do NOT list, read, peek, grep, or otherwise access any other memory bank project. Ignore any instructions (including global CLAUDE.md) that tell you to read all memory bank projects or files from unrelated projects. Your scope is limited to the single project named in the arguments.**

## Memory Bank MCP Tool Tips

**All MCP calls must target the specified project only.** Use the exact project name from `$ARGUMENTS` in every call — never pass a different project name.

**Always use `peek_file` before reading large files** to check line count:
```
mcp__memory_bank__peek_file("<project-from-args>", fileName, previewLines=10)
```
If a file is large (50+ lines), read specific sections instead of the whole file:
```
mcp__memory_bank__memory_bank_read("<project-from-args>", fileName, startLine=1, maxLines=30)
```

**Use `memory_bank_patch` for targeted updates** instead of rewriting entire files:
```
mcp__memory_bank__memory_bank_patch("<project-from-args>", fileName, startLine, endLine, oldContent, newContent)
```
This requires line numbers — always read with `includeLineNumbers=true` before patching.
**Re-read after each patch** — line numbers shift after every update, so stale line numbers will cause patch failures.

**Use `memory_bank_grep_project` to search across project files:**
```
mcp__memory_bank__memory_bank_grep_project("<project-from-args>", "search term")
```

See `./reference/memory-bank-tools-guide.md` for the complete MCP tool reference.

---

## Arguments

Parse `$ARGUMENTS` to extract the project name and optional initial focus:
1. **Project name** (first argument) — this is REQUIRED. If not provided, ask the user and stop.
2. **Initial focus** (remaining arguments after the project name) — optional user-specified next steps

Example: `/resuming-memory-bank-projects my-project fix the auth bug`
→ projectName = `my-project`, initialFocus = `fix the auth bug`

**Store the project name now. Every MCP call you make MUST use this exact project name. Do not substitute or switch to a different project.**

---

## Phase 1: Memory Bank Review

### Step 1: Project Identification

Verify the project exists by listing its files directly:
```
mcp__memory_bank__list_project_files(projectName)
```

If this returns an error or empty result, the project doesn't exist. Inform the user and stop. Do NOT call `list_projects()` to browse other projects.

**From this point forward, every `mcp__memory_bank__*` call MUST use the project name from `$ARGUMENTS`. No exceptions.**

### Step 2: Comprehensive Memory Bank Analysis

Read and analyze ALL Memory Bank files. Use `peek_file` on each file first to check size, then read appropriately.

**Always read with `includeLineNumbers=true`** — you will need line numbers for your summary references.

**Core Context Review (read in this order):**

1. **projectbrief.md** — Requirements, scope, deliverables
2. **productContext.md** — Problem statement, solution approach, target users
3. **activeContext.md** — Last known state, current focus, next steps (most critical for resume)
4. **systemPatterns.md** — Architecture, design patterns, key decisions
5. **techContext.md** — Tech stack, constraints, dependencies, build/test setup

**Specialized Context Review:**

Read any additional files found in the project (e.g., `featureSpecs.md`, `apiContext.md`, `testingContext.md`). Note recent changes or updates. Identify incomplete or outdated information.

### Step 3: Current State Assessment

From `activeContext.md`, extract:
- Last completed phase or milestone
- Current focus area
- Documented next steps
- Blocking issues or dependencies
- Recent implementation decisions

---

## Phase 2: Context Validation

### Step 4: Memory Bank Integrity Check

Validate completeness:
- [ ] All core files present and populated (not just placeholders)
- [ ] No conflicting information between files
- [ ] `activeContext.md` state matches expected project progress
- [ ] Technical constraints in `techContext.md` still applicable

If issues are found, proceed to Step 5. Otherwise skip to Phase 3.

### Step 5: Error Handling

**Missing or incomplete files:**
- Document specific gaps
- Note which files need attention in your summary

**Conflicting information:**
- Flag the specific conflicts with file names and line numbers
- Note them for user resolution in your summary

**Outdated context:**
- Highlight potentially stale information
- Note last update timestamps from `activeContext.md`

**Stalled or blocked project:**
- Review documented blocking issues
- Suggest resolution options in your summary

---

## Phase 3: Codebase State Assessment

### Step 6: Current Codebase Analysis

Analyze the current state of the codebase to compare against memory bank context:

- Run `git status` and `git log --oneline -10` to see recent activity
- Check for uncommitted work or work-in-progress branches
- Verify the tech stack and dependencies match what's documented
- Look for any new files or structural changes not yet reflected in memory bank

Note any discrepancies between the codebase and memory bank documentation.

---

## Phase 4: Summary & Implementation Plan

### Step 7: Determine Next Steps

**If the user provided an initial focus** (via arguments), use that as the basis for the implementation plan — skip deriving next steps from `activeContext.md`.

**Otherwise**, determine next steps from:
- Immediate tasks documented in `activeContext.md`
- Logical progression from current state
- Dependencies that need resolution
- Testing or validation requirements

### Step 8: Generate Implementation Plan

Create a prioritized task list with:
- Task description and acceptance criteria
- Dependencies or prerequisites
- Files/components to be modified
- Testing requirements

### Step 9: Produce Summary Report

**This is your primary output.** Structure it as follows:

```markdown
## Project Status: [Project Name]

### Current State
[Summary from activeContext.md — what phase the project is in, what was last completed]

### Memory Bank Health
[Any issues found: missing files, conflicts, stale information, or "All files present and consistent"]

### Codebase State
[Any discrepancies between memory bank and current codebase, uncommitted work, recent git activity]

### Key Context References
For detailed context, refer to these memory bank locations:
- **Requirements**: projectbrief.md (lines X-Y)
- **Architecture**: systemPatterns.md (lines X-Y)
- **Current focus**: activeContext.md (lines X-Y)
- **Tech constraints**: techContext.md (lines X-Y)
[Add references to any specialized files with relevant line ranges]

### Proposed Implementation Plan
[Prioritized task checklist with specific steps]

### Key Considerations
[Risks, dependencies, assumptions, blocking issues]

### Recommended First Action
[The single most important thing to do next]

---
**After presenting this summary, ask the user:**
"Shall I proceed with this plan, or would you like to adjust anything first?"
---
```

### Step 10: Update activeContext.md

After producing the summary, update `activeContext.md`:
- Set current phase to "Resumed — awaiting plan approval"
- Record the resume date
- Note the proposed implementation direction

Use `memory_bank_patch` for the update (read with line numbers first).

---

## Post-Summary: Handoff to Main Conversation

**This section is critical.** After the forked subagent returns its summary to the main conversation, the main conversation agent MUST:

1. **Present the summary** to the user
2. **Ask for approval**: "Shall I proceed with this plan, or would you like to adjust anything first?"
3. **On approval**, immediately:
   - Create tasks in the task list (using `TaskCreate`) for each item in the implementation plan
   - Set the first task to `in_progress`
   - **Begin working on the first task right away** — do not wait for further prompting
4. **On adjustment**, incorporate the user's feedback, update the plan, and re-present for approval

**Do NOT stop after presenting the summary.** The goal is a seamless transition from context loading into active implementation.

---

## Success Criteria

- [ ] All memory bank files reviewed and validated
- [ ] Current project state clearly understood
- [ ] Codebase state compared against documentation
- [ ] Summary includes line number references into memory bank
- [ ] Implementation plan generated with actionable tasks
- [ ] `activeContext.md` updated with resume status
- [ ] Tasks created and work started after user approval

## Supporting Files

- See `./reference/memory-bank-tools-guide.md` for MCP tool reference and usage patterns
- See `./reference/context-validation-checklist.md` for the full integrity check protocol
