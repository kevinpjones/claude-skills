---
name: resume-plan
description: Use this skill when resuming work on an existing execution plan, reloading plan context after time away, or checking plan status before continuing implementation. This includes reviewing plan documents (PLAN.md, PROGRESS.md, phase docs), validating documented progress against reality (PRs, commits, code changes), detecting drift, proposing corrections, and presenting an execution plan for the next steps. Trigger keywords include "resume plan", "continue plan", "pick up plan", "plan status", "where did I leave off", "continue implementation", "resume execution plan", "reload plan", "get back to plan".
argument-hint: "[plan-name-or-path]"
---

# Resuming Execution Plans

Review an existing execution plan, validate its documented progress against reality, and present current status with a detailed execution plan for the next steps.

---

## Phase 1: Plan Discovery

### Step 1: Locate the Plan

If `$ARGUMENTS` is provided, use it to find the plan:

1. **Exact path** — If the argument looks like a path (contains `/`), check if it exists directly
2. **Name match** — Search `docs/plans/` for a directory whose name contains the argument (case-insensitive)
3. **Fuzzy match** — If no exact match, list all plans and pick the closest match

```bash
ls docs/plans/ | grep -i "<argument>"
```

If no argument is provided or no match is found, list available plans and ask the user to choose:

```bash
ls -1 docs/plans/
```

### Step 2: Read Plan Documents

Read the plan files in this order, noting line numbers for later reference:

1. **PLAN.md** (required) — Goal, phases, decision log, open questions
2. **PROGRESS.md** (required) — Current status, phase progress, active context
3. **Phase documents** in `phases/` (if they exist) — Detailed phase breakdowns
4. **References** in `references/` (if they exist) — Supporting material

If PLAN.md or PROGRESS.md is missing, inform the user that this is not a valid execution plan directory and stop.

### Step 3: Extract Current State

From the plan documents, extract:
- **Overall status** from PROGRESS.md Current Status
- **Phase-by-phase progress** from PROGRESS.md Phase Progress table
- **Active context** — recent changes, next steps, working decisions
- **The current phase** — the first phase that is not marked complete
- **Open questions** from PLAN.md
- **Decision log** entries from PLAN.md

---

## Phase 2: Reality Validation

Validate the documented progress against actual evidence in the codebase and GitHub. This is the critical differentiator — plan docs can drift from reality.

See `./reference/plan-validation-checklist.md` for the full validation protocol.

### Step 4: Git History Analysis

Check recent git activity relevant to the plan:

```bash
git log --oneline -20
git log --oneline --since="2 weeks ago"
```

Look for:
- Commits that relate to plan phases (by keyword, file path, or PR reference)
- Work that was done but not reflected in PROGRESS.md
- Work documented as complete in PROGRESS.md but with no corresponding commits

### Step 5: PR Status Verification

If PROGRESS.md references PRs (by number or URL), verify their current status:

```bash
gh pr view <number> --json state,mergedAt,title,url
```

Check for:
- PRs documented as "open" that have since been merged or closed
- PRs documented as "merged" that are actually still open
- New PRs related to the plan that aren't documented

Also search for PRs that might relate to the plan but aren't mentioned:

```bash
gh pr list --state all --search "<plan-relevant-keywords>" --json number,title,state --limit 10
```

### Step 6: Code State Verification

Verify that code changes documented in the plan actually exist:

- Check for files or directories the plan says were created
- Verify that features or changes described as "complete" are present in the codebase
- Look for TODO comments or incomplete implementations in areas the plan covers
- Check if acceptance criteria from completed phases are actually met

### Step 7: Branch and Environment Check

```bash
git branch -a | head -20
git status
```

Look for:
- Feature branches related to the plan that are still active
- Uncommitted work in progress
- Stale branches that should have been cleaned up

### Step 8: Classify Findings

For each discrepancy found, classify it:

| Severity | Description | Example |
|----------|-------------|---------|
| **Critical** | Progress is materially wrong | Phase marked complete but PR was reverted |
| **Warning** | Progress is stale or incomplete | PR merged but PROGRESS.md not updated |
| **Info** | Minor gap, not blocking | Missing PR link for completed work |

---

## Phase 3: Drift Correction

If any Critical or Warning discrepancies were found, corrections must be proposed **before** presenting the execution plan.

See `./reference/drift-correction-guide.md` for the full correction protocol.

### Step 9: Propose Corrections

Present all discrepancies to the user in a clear format:

```markdown
### Plan Documentation Drift

I found the following discrepancies between the plan docs and the current state:

#### Critical
- **[Description]**: PROGRESS.md says [X] but [evidence shows Y]
  - Proposed fix: [specific edit to PROGRESS.md]

#### Warnings
- **[Description]**: [what's stale or incomplete]
  - Proposed fix: [specific edit]

#### Info
- **[Description]**: [minor gap]

Shall I apply these corrections before we continue?
```

### Step 10: Apply Corrections

On user approval:
1. Update PROGRESS.md phase progress table with corrected statuses
2. Update PROGRESS.md active context (recent changes, next steps)
3. Add a decision log entry in PLAN.md noting the corrections:
   ```
   | YYYY-MM-DD | Progress reconciled during plan resume | [brief summary of what changed] |
   ```
4. Update any phase documents if their status descriptions are affected

If the user declines corrections, note the discrepancies in the execution plan output so they remain visible.

---

## Phase 4: Execution Plan

### Step 11: Determine Current Phase

From the validated (and possibly corrected) state:
1. Identify the **current phase** — the first incomplete phase
2. Read its phase document (if one exists in `phases/`)
3. Identify any **blocked phases** — phases whose dependencies aren't met
4. Identify any **parallel phases** — phases that can proceed alongside the current one

### Step 12: Build Detailed Next Steps

For the current phase, create a granular execution plan:

1. Review the phase's approach and acceptance criteria
2. Identify what has already been done within this phase (from git/PR evidence)
3. Break remaining work into concrete, actionable tasks with:
   - Task description
   - Files or components to modify
   - Dependencies or prerequisites
   - How to verify completion (tied to acceptance criteria)

### Step 13: Present Status and Plan

Present the full resume report to the user:

```markdown
## Plan Status: [Plan Name]

### Overall Status
[From validated PROGRESS.md — what phase the plan is in, overall health]

### Phase Progress
| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: [Name] | Complete | [completion date or PR refs] |
| Phase 2: [Name] | **In Progress** | [what's done, what remains] |
| Phase 3: [Name] | Not started | Depends on Phase 2 |

### Drift Corrections Applied
[Summary of any corrections made, or "No drift detected — plan docs match reality"]

### Current Phase Detail: Phase [N] — [Name]
**Objective:** [from phase doc or PLAN.md]
**Progress within phase:** [what's already done based on evidence]
**Remaining work:**
- [ ] [Task 1 — specific action]
- [ ] [Task 2 — specific action]
- [ ] [Task 3 — specific action]

### Open Questions
[Any unresolved items from PLAN.md that affect the current phase]

### Key Risks
[Phase-specific risks and any new risks identified during validation]

### Recommended First Action
[The single most important thing to do next, with enough context to start immediately]
```

### Step 14: Get Approval

Ask the user:

> Shall I proceed with this plan, or would you like to adjust anything first?

**On approval:**
1. Update PROGRESS.md active context:
   - Set next steps to match the approved execution plan
   - Record the resume date in a working decision
2. Create tasks (using `TaskCreate`) for each item in the execution plan
3. Set the first task to `in_progress`
4. **Begin working on the first task immediately** — do not wait for further prompting

**On adjustment:**
- Incorporate the user's feedback
- Update the execution plan
- Re-present for approval

---

## Error Handling

### Plan Directory Not Found
- List all available plans in `docs/plans/`
- Ask the user to specify which plan to resume
- If no plans exist, suggest using `create-plan` instead

### Missing Phase Documents
- If PLAN.md references phase docs that don't exist, note it as a Warning
- Reconstruct what you can from the phase summary in PLAN.md
- Suggest creating the missing phase doc as part of the execution plan

### Stalled Plan
If evidence suggests no work has been done for an extended period:
- Note the staleness in the status report
- Check if the plan's assumptions are still valid (dependencies, tech stack, etc.)
- Ask the user if the plan scope needs revision before resuming

### Ambiguous Plan Match
If multiple plans match the user's argument:
- List the matches with their dates and goal summaries
- Ask the user to pick one

---

## Success Criteria

- [ ] Plan documents located and fully reviewed
- [ ] Progress validated against git history, PR statuses, and code state
- [ ] All discrepancies classified and presented to user
- [ ] Corrections applied to plan docs (if approved)
- [ ] Current phase identified with detailed execution plan
- [ ] User approved the plan
- [ ] PROGRESS.md updated with resume context
- [ ] Tasks created and work started after approval

## Supporting Files

- See `./reference/plan-validation-checklist.md` for the full reality validation protocol
- See `./reference/drift-correction-guide.md` for the drift correction workflow
