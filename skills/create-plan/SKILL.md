---
name: create-plan
description: Use this skill when creating a new execution plan for a project initiative, feature, migration, or multi-phase effort. This includes scaffolding a plan directory structure with PLAN.md, PROGRESS.md, phase documents, and reference materials. Trigger keywords include "create plan", "execution plan", "new plan", "plan initiative", "write plan", "scaffold plan", "plan migration", "plan feature", "project plan", "implementation plan".
---

# Creating Execution Plans

Create a structured execution plan through iterative user interviews and codebase analysis. The process follows three phases: Initial Setup, Discovery Interview, and Plan Generation.

Execution plans live in `docs/plans/YYYY-MM-DD-<plan-name>/` within the repository and follow a progressive disclosure structure. The date prefix uses the current date at plan creation time, enabling chronological sorting. See `./reference/plan-structure-guide.md` for the full specification of the plan directory layout.

---

## Phase 1: Initial Setup

### Step 1: Determine the Plan Name

If `$ARGUMENTS` is provided, use it as the plan name. Otherwise, ask the user.

Normalize the name:
- Convert to lowercase
- Replace spaces with hyphens
- Remove special characters
- Collapse consecutive hyphens

Prefix with today's date: `YYYY-MM-DD-<plan-name>` (e.g., `2026-03-30-stripe-migration`).

The plan will be created at `docs/plans/YYYY-MM-DD-<plan-name>/`.

### Step 2: Check for Existing Plans

Verify the target directory does not already exist:
```bash
ls docs/plans/YYYY-MM-DD-<plan-name>/ 2>/dev/null
```

If it exists, inform the user and ask how to proceed (overwrite, choose a different name, or abort).

### Step 3: Gather Initial Context

Use `AskUserQuestion` to prompt the user:

> Please provide an initial overview of this initiative:
> - What are you trying to accomplish and why?
> - What systems or areas of the codebase are involved?
> - Are there known constraints, deadlines, or dependencies?

Wait for the user's response before proceeding.

### Step 4: Create Initial Plan Scaffold

Create the plan directory and seed files from templates:

1. `PLAN.md` - Populated with the user's initial overview (see `./templates/plan-template.md`)
2. `PROGRESS.md` - Initialized with planning phase status (see `./templates/progress-template.md`)

---

## Phase 2: Discovery Interview

### Step 5: Codebase Analysis

If the initiative involves existing code, analyze the relevant areas:

**5.1 Identify Affected Systems:**
- Directory structure and key files in the affected areas
- Existing patterns and conventions
- Dependencies and integration points
- Existing tests and test patterns

**5.2 Check for Related Documentation:**
- Existing design docs in `docs/design/`
- Relevant ADRs in `docs/adr/`
- Related CLAUDE.md files in affected directories
- Any existing plans that overlap

**5.3 Draft Initial Observations:**
Note patterns, risks, and questions surfaced by the codebase analysis. These inform the interview questions.

### Step 6: Iterative Interview Process

See `./reference/interview-methodology.md` for the full interview protocol and question bank.

**Overview of the interview loop:**

> Create a task list to track interview progress.
> Keep count of iterations and remaining question categories.
> Use `AskUserQuestion` to present questions to the user.

#### 6a. Question Categories (in priority order)

1. **Goal & Motivation** - What outcome are we driving toward? What problem does this solve?
2. **Scope & Boundaries** - What's in scope vs. out of scope? What are the constraints?
3. **Technical Approach** - Architecture decisions, patterns, migration strategies
4. **Phasing & Sequencing** - How should the work be broken into phases? What depends on what?
5. **Risks & Mitigations** - What could go wrong? What are the rollback strategies?
6. **Success Criteria** - How do we know the plan is complete and successful?

#### 6b. Interview Loop

FOR each question category:
1. Plan 1-3 critical questions for this round
2. Present questions using `AskUserQuestion` and wait for response
3. Update the draft plan files with new context
4. Generate follow-up questions based on answers
5. Continue until the category is sufficiently covered

#### 6c. After Each User Response

1. **Analyze** the response for goals, constraints, technical decisions, risks, and phasing information
2. **Update** the relevant plan sections:
   - `PLAN.md` Goal section - Refine the objective and motivation
   - `PLAN.md` Phases section - Add or restructure phases
   - `PLAN.md` Open Questions - Track unresolved items
   - `PROGRESS.md` - Note gathered context in active context section
3. **Detect ADR candidates** - See `./reference/adr-detection-guide.md` for full criteria. Flag a decision as an ADR candidate when it meets any of these triggers:
   - Introduces a new architectural pattern or changes how subsystems interact
   - Has real alternatives with meaningful tradeoffs that reasonable engineers would debate
   - Has cross-cutting impact across multiple services, teams, or bounded contexts
   - Introduces a new external dependency (vendor, database, message queue)
   - Is difficult or expensive to reverse once deployed
   - The "why" behind the choice is non-obvious and would need more than a sentence to explain
   When a candidate is detected, add it to the `PLAN.md` ADR Candidates section with a one-line summary and the rationale for why it warrants an ADR. Do NOT write the ADR itself — that is the responsibility of a future `write-adr` skill.
4. **Identify follow-ups** - Note any new questions triggered by the response

The user may request to exit the interview at any point - if so, proceed directly to Step 7.

### Step 7: Context Sufficiency Assessment

Continuously evaluate if you have sufficient context:
- [ ] Clear understanding of the goal and motivation
- [ ] Scope boundaries defined (in-scope and out-of-scope)
- [ ] Technical approach identified with key decisions documented
- [ ] Work broken into logical phases with sequencing
- [ ] Key risks identified with mitigations
- [ ] Success criteria defined
- [ ] Open questions documented for items still unresolved

When all criteria are met (or the user requests to proceed), move to Phase 3.

---

## Phase 3: Plan Generation

### Step 8: Final Context Check

Ask the user:

> Based on our discussion, I have enough context to finalize the execution plan.
> Before I generate the final documents, is there anything else you'd like to add
> or any important details I should capture?

Wait for the response and incorporate any additions.

### Step 9: Generate Plan Documents

Generate the final plan documents in `docs/plans/YYYY-MM-DD-<plan-name>/`:

#### 9a. PLAN.md (Required)

Write the final `PLAN.md` containing:
- **Goal** - What we're accomplishing and why
- **Phase Diagram** (optional) - A Mermaid `graph LR` diagram showing phase dependencies and parallel paths. Include when phases have complex dependencies or can run in parallel; omit for purely sequential plans
- **Phases** - High-level summary of each phase with one-line descriptions. Link to `phases/` docs for complex phases; keep simple phases inline
- **Decision Log** - Initialize as empty with a note: "No decisions recorded yet - update as the plan evolves"
- **ADR Candidates** - Architectural decisions identified during planning that warrant their own Architecture Decision Record. Each entry includes a one-line summary and the trigger criteria it matched. Omit this section if no ADR candidates were identified. See Step 9e for PR workflow
- **Open Questions** - Any unresolved items from the interview

See `./templates/plan-template.md` for the structure.

#### 9b. PROGRESS.md (Required)

Write the final `PROGRESS.md` containing:
- **Current Status** - "Planning complete, ready for Phase 1"
- **Phase-by-phase progress** - All phases marked as "Not started"
- **Active Context** section with recent changes, next steps, and working decisions
- **Next Steps** - The concrete first actions to begin Phase 1

See `./templates/progress-template.md` for the structure.

#### 9c. Phase Documents (Optional)

Create `phases/` subdirectory and phase docs ONLY for phases that are complex enough to warrant their own file. A phase needs its own doc when:
- It has multiple sub-steps that need detailed breakdown
- It involves non-obvious technical decisions
- It has specific acceptance criteria worth documenting
- It would take more than 2-3 sentences to describe in PLAN.md

Use `./templates/phase-template.md` for the structure. Name phase files with numeric prefixes: `01-phase-name.md`, `02-phase-name.md`, etc.

#### 9d. References (Optional)

Create `references/` subdirectory ONLY if the interview surfaced tactical decisions, research findings, or patterns that support the plan but don't belong in PLAN.md or a phase doc.

#### 9e. ADR PR Stack (When ADR Candidates Exist)

If the plan identified ADR candidates during the interview, ADRs must be authored and submitted for review **before** the execution plan. This draws out architectural discussion early and reaches team acceptance ahead of implementation.

**Workflow:**
1. For each ADR candidate identified during the interview, invoke the `draft-adr` skill to create the ADR file in `docs/adr/`. Loop until all candidates are drafted.
2. Invoke the `manage-stacked-pr` skill to create a PR stack:
   - **Base PR(s):** One PR per ADR (or a single PR if the ADRs are tightly coupled)
   - **Top PR:** Execution plan documents, stacked on top of the ADR PR(s)
3. The execution plan PR references the ADRs it depends on, and reviewers can see the full decision chain.

**Why this ordering:** ADRs are permanent, individually-addressable records that outlive the plan. Merging an ADR is the act of adopting the decision — that acceptance should happen through its own review cycle, not buried inside a larger plan PR. Advancing ADRs ahead of the plan prevents implementation from starting before architectural alignment is reached.

### Step 10: Present Summary & Get Approval

1. **Present a summary** of the generated plan to the user:
   - Plan directory location
   - Number of phases and brief description of each
   - Key decisions captured
   - Open questions remaining
   - Suggested first action

2. **Ask for approval** before considering the skill complete

3. If the user requests changes, update the relevant files and re-present

---

## Error Handling

### Insufficient Context After Interview
- Document specific gaps in PLAN.md Open Questions section
- Proceed with available context if the user approves
- Mark uncertain phases with "[Needs refinement]" annotations

### Conflicting Requirements
- Flag conflicts explicitly in the Decision Log with a "CONFLICT" prefix
- Seek clarification from the user
- Document the resolution

### No `docs/plans/` Directory
- Create the directory structure: `mkdir -p docs/plans/YYYY-MM-DD-<plan-name>`
- If no `docs/` directory exists at all, create it and inform the user about the broader documentation structure from the proposal

---

## Success Criteria

- [ ] Plan directory created at `docs/plans/YYYY-MM-DD-<plan-name>/`
- [ ] PLAN.md contains Goal, Phases, Decision Log, and Open Questions
- [ ] PROGRESS.md contains Status, Phase Progress, and Active Context
- [ ] Phases are logically sequenced with clear dependencies
- [ ] Complex phases have dedicated phase docs in `phases/`
- [ ] User has reviewed and approved the plan

## Supporting Files

- See `./reference/interview-methodology.md` for the full interview protocol and question bank
- See `./reference/plan-structure-guide.md` for the execution plan directory specification
- See `./reference/adr-detection-guide.md` for ADR candidate identification criteria
- See `./templates/` for document templates
