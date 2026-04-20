---
name: initialize-memory-bank-project
description: Use this skill when creating a new Memory Bank project, initializing a project in the memory bank, or onboarding a codebase into the memory bank system. This includes setting up project documentation structure, conducting codebase analysis, gathering requirements through interviews, and populating core memory bank files. Trigger keywords include "new memory bank project", "initialize project", "onboard project", "set up memory bank", "create project in memory bank", "new project", "start project", "memory bank setup", "project initialization".
---

# Initializing Memory Bank Projects

Set up a new Memory Bank project through structured codebase analysis, user interviews, and documentation initialization. The process follows three phases: Initial Setup, Codebase Analysis & Interview, and Context Validation & Finalization.

## Memory Bank MCP Tool Tips

**Always use `peek_file` before reading large files** to check line count first:
```
mcp__memory_bank__peek_file(projectName, fileName, previewLines=10)
```
If a file is large (50+ lines), read specific sections instead of the whole file:
```
mcp__memory_bank__memory_bank_read(projectName, fileName, startLine=1, maxLines=30)
```

**Use `memory_bank_patch` for targeted updates** instead of rewriting entire files:
```
mcp__memory_bank__memory_bank_patch(projectName, fileName, startLine, endLine, oldContent, newContent)
```
This requires line numbers — always read with `includeLineNumbers=true` before patching.
**Re-read after each patch** — line numbers shift after every update, so stale line numbers will cause patch failures.

**Use `memory_bank_grep_project` to search across all project files** before creating duplicate content:
```
mcp__memory_bank__memory_bank_grep_project(projectName, "search term")
```

See `./reference/memory-bank-tools-guide.md` for the complete MCP tool reference.

---

## Phase 1: Initial Setup

### Step 1: Normalize the Project Name

Take the user-provided project name and normalize it:
- Convert to lowercase
- Replace spaces with hyphens
- Replace prohibited characters (`/\*%#!()`) with hyphens
- Collapse consecutive hyphens into one

If `$ARGUMENTS` is provided, use it as the project name. Otherwise, ask the user.

### Step 2: Gather Initial Project Overview

Use `AskUserQuestion` to prompt the user:

> Please provide an initial overview of the project including:
> - High-level goals and objectives
> - Expected deliverables
> - Any known constraints or requirements

Wait for the user's response before proceeding.

### Step 3: Initialize Memory Bank Structure

Create the core files using `mcp__memory_bank__memory_bank_write`:

1. **projectbrief.md** — Populate from the user's initial overview (see `./templates/projectbrief-template.md`)
2. **productContext.md** — Initialize with placeholder structure (see `./templates/productContext-template.md`)
3. **systemPatterns.md** — Initialize with placeholder structure (see `./templates/systemPatterns-template.md`)
4. **techContext.md** — Initialize with placeholder structure (see `./templates/techContext-template.md`)
5. **activeContext.md** — Record current initialization phase (see `./templates/activeContext-template.md`)

Confirm the project was created:
```
mcp__memory_bank__list_project_files(projectName)
```

---

## Phase 2: Codebase Analysis & Interview

### Step 4: Codebase Inspection

Analyze the project's codebase using standard tools (Glob, Grep, Read, Bash):

**4.1 Project Structure:**
- Directory layout and organization
- File types and programming languages
- Configuration files (package.json, tsconfig, etc.)
- Dependencies and package managers
- Build systems and scripts
- Testing frameworks

**4.2 Key Patterns:**
- Architecture style (MVC, microservices, monorepo, etc.)
- Code organization conventions
- Naming conventions
- Existing documentation

**4.3 Update Memory Bank** with findings:
- Patch `techContext.md` with technical details
- Patch `systemPatterns.md` with architectural patterns

### Step 5: Iterative Interview Process

See `./reference/interview-methodology.md` for the full interview protocol, question bank, and update process.

**Overview of the interview loop:**

> Create a task list to track your interview progress.
> Keep count of iterations and remaining questions so you don't lose track.
> Use `AskUserQuestion` to present questions to the user.

#### 5a. Question Categories (in priority order)

1. **Project Scope** — Features, components, success criteria
2. **Technical Context** — Coding standards, testing, performance
3. **Integration** — APIs, deployment, external services
4. **User Experience** — Target users, UI/UX, error handling

#### 5b. Interview Loop

FOR each question category:
1. Plan 1-3 critical questions for this round
2. Present questions using `AskUserQuestion` and wait for response
3. Update Memory Bank files with new context (use `memory_bank_patch` for targeted updates)
4. Generate follow-up questions based on answers
5. Continue until the category is sufficiently covered

#### 5c. After Each User Response

1. **Analyze** the response for new requirements, constraints, technical specs, and preferences
2. **Patch** the relevant memory bank files:
   - `projectbrief.md` — Add/refine requirements
   - `productContext.md` — Update problem/solution context
   - `techContext.md` — Add technical constraints
   - `systemPatterns.md` — Note architectural decisions
   - `activeContext.md` — Record current understanding
3. **Create specialized files** as needed:
   - `featureSpecs.md` for detailed feature requirements
   - `apiContext.md` for API integration details
   - `testingContext.md` for testing requirements

The user may request to exit the interview at any point — if so, proceed directly to Step 6.

### Step 6: Context Sufficiency Assessment

Continuously evaluate if you have sufficient context:
- [ ] Clear understanding of project goals
- [ ] Technical implementation approach identified
- [ ] Integration points mapped
- [ ] Success criteria defined
- [ ] Key constraints and dependencies understood
- [ ] User experience requirements clarified

When all criteria are met, proceed to Phase 3.

---

## Phase 3: Context Validation & Finalization

### Step 7: Final Requirements Check

Ask the user:

> Based on our discussion, I believe I have sufficient context to begin planning.
> Before I proceed, is there anything additional you'd like to add to the project
> requirements or any important details I should know?

Wait for the response and update the Memory Bank accordingly.

### Step 8: Context Summary & Confirmation

1. **Generate a comprehensive summary** from the Memory Bank:
   - Project overview and goals
   - Technical approach and constraints
   - Key implementation decisions
   - Success criteria and deliverables

2. **Present the summary** to the user for confirmation

3. **Update `activeContext.md`** with:
   - "Context gathering phase completed"
   - Summary of gathered requirements
   - Readiness for planning phase

### Step 9: Planning Phase Preparation

1. **Validate the Memory Bank:**
   - Ensure all core files are populated (use `list_project_files` to verify)
   - Read each file with `peek_file` to confirm content exists
   - Check for consistency across files using `memory_bank_grep_project`

2. **Update `activeContext.md`** status:
   - "Ready for planning phase"
   - "Context gathering completed on [current date]"
   - "Next step: Develop implementation plan"

### Step 10: Plan Creation

1. Clear your task list of all project initialization tasks
2. Generate a detailed set of implementation tasks
   - For large projects, plan an initial phase and defer later phases
3. Present the implementation plan to the user for review and approval

---

## Error Handling

### Insufficient Context After Interview
- Document specific gaps in `activeContext.md`
- Request targeted additional information
- Proceed with available context if user approves

### Conflicting Requirements
- Flag conflicts in `activeContext.md`
- Seek clarification from the user
- Update Memory Bank with resolution

---

## Success Criteria

- [ ] Complete Memory Bank structure established
- [ ] All core files populated with relevant context
- [ ] Codebase patterns and constraints documented
- [ ] User requirements clearly captured
- [ ] Technical implementation approach identified
- [ ] Ready to begin planning phase

## Supporting Files

- See `./reference/interview-methodology.md` for the full interview protocol and question bank
- See `./reference/memory-bank-tools-guide.md` for MCP tool reference and usage patterns
- See `./templates/` for initial file content templates
