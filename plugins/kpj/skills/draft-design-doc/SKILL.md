---
name: draft-design-doc
description: Use this skill when drafting a design document to capture higher-order system design for significant architectural work. This includes documenting new subsystems, cross-cutting architectural changes, systems with meaningful tradeoffs between alternatives, or designs that introduce new external dependencies. Produces DESIGN.md with optional subdesigns/ and references/ subdirectories, and flags candidate ADRs. Trigger keywords include "draft design doc", "write design doc", "design document", "system design", "architecture design", "DESIGN.md", "new design", "document design".
---

# Drafting Design Documents

Create a well-formed design document in `docs/design/YYYY-MM-DD-<design-name>/`. Design docs describe *how a system is shaped and why* — they are more durable than execution plans and capture the target architectural state.

This skill operates in two modes:

- **Standalone**: Conducts a warrant check and iterative interview to gather context, the design, alternatives, and risks.
- **From caller**: Receives pre-gathered context (e.g., from `create-plan`) and formats the design doc directly, skipping the interview.

The skill produces the design doc files only. Branching, committing, and PR creation are the caller's responsibility.

---

## Step 1: Warrant Check

Before drafting, confirm a design doc is the right artifact. Not every initiative needs one — many are better served by an execution plan alone.

See `./reference/when-to-write-design-doc.md` for the full criteria.

**Design doc is warranted when any of these hold:**
- Introduces a new architectural pattern or changes how subsystems interact
- Real alternatives exist with meaningful tradeoffs reasonable engineers would debate
- Cross-cutting impact across multiple services, teams, or bounded contexts
- Introduces a new external dependency (vendor, database, message queue)
- Difficult or expensive to reverse once deployed
- The "why" behind the system shape is non-obvious

**If none of these hold**, suggest the user invoke `create-plan` instead and exit the skill. Do not draft a design doc just because the user asked — a thin design doc has negative value.

**If warranted**, proceed to Step 2.

## Step 2: Determine the Design Name

If `$ARGUMENTS` is provided, use it as the design short name. Otherwise, ask the user for a brief name (e.g., `event-processing-v2`, `notification-delivery-pipeline`, `search-indexing-flow`).

Normalize the name:
- Convert to lowercase
- Replace spaces with hyphens
- Remove special characters
- Collapse consecutive hyphens

## Step 3: Generate the Design Directory Name

Design directories use a date-based naming convention: `YYYY-MM-DD-<short-name>`

1. Use today's date as the prefix
2. Check `docs/design/` for existing directories with the same date + short name:
   ```bash
   ls -d docs/design/YYYY-MM-DD-<short-name> 2>/dev/null
   ```
3. If the directory exists, inform the user and ask how to proceed (overwrite, choose a different name, or abort).

## Step 4: Ensure `docs/design/` Exists

```bash
mkdir -p docs/design/YYYY-MM-DD-<short-name>
```

If this is the first design, note that a `docs/design/README.md` index could be created eventually (outside this skill's scope).

## Step 5: Gather Design Context

### Mode Detection

Check whether sufficient context has already been provided (e.g., from a `create-plan` interview). Sufficient context means all of the following are known:
- The problem being solved and constraints
- The proposed design shape
- At least one alternative considered with tradeoffs
- Key dependencies and risks
- Acceptance criteria

**If sufficient context exists:** Proceed directly to Step 6.

**If context is insufficient (standalone invocation):** Conduct the interview below.

### Standalone Interview

Use `AskUserQuestion` to gather context across five rounds. See `./reference/interview-methodology.md` for the full protocol and follow-up triggers.

**Round 1 — Context & Constraints:**
> What is the problem this design solves?
> - What prompted the design work (deprecation, scale, new requirement)?
> - What are the technical, organizational, or timeline constraints?

**Round 2 — Design Shape:**
> What is the proposed design at a high level?
> - What are the major components and how do they interact?
> - Are there schema changes, API contracts, or data flow changes?
> - Does the design span multiple subsystems or bounded contexts?

**Round 3 — Alternatives Considered:**
> What other approaches did you consider?
> - For each alternative, what were the key tradeoffs?
> - What specifically made each rejected alternative unsuitable?

**Round 4 — Dependencies & Risks:**
> What external systems does this depend on?
> - What migration concerns exist?
> - What is the rollback strategy if this goes wrong?

**Round 5 — Acceptance Criteria:**
> How will we know the design is correctly implemented?
> - What observable behaviors or outcomes confirm success?

Adapt questions based on previous answers. Skip rounds where context is already clear. The user may end the interview early — proceed with available context.

### Detect ADR Candidates During Interview

As the user answers, flag decisions that warrant their own ADR (per the proposal, a design doc often spawns multiple ADRs). A decision is an ADR candidate when it meets any of the triggers in `./reference/interview-methodology.md#adr-candidate-detection`. Track candidates for inclusion in the DESIGN.md's ADR Candidates section.

## Step 6: Decomposition Check

Decide whether the design warrants a `subdesigns/` subdirectory:

**Create `subdesigns/` when:**
- The design spans multiple bounded contexts or subsystems, each substantial enough for its own doc
- Different engineers or teams own different parts of the design
- DESIGN.md alone would exceed ~500 lines to cover the full detail

**Keep everything in DESIGN.md when:**
- The design covers a single, focused change
- All detail fits comfortably in one file

If subdesigns are warranted, identify the subsystems during the interview and plan one subdesign file per subsystem. The parent DESIGN.md summarizes each subsystem in 2-3 sentences and links to the subdesign.

## Step 7: Write DESIGN.md

Write the design doc file to `docs/design/YYYY-MM-DD-<short-name>/DESIGN.md` using the format in `./templates/design-template.md`.

See `./reference/design-doc-format-guide.md` for detailed guidance on writing each section.

**Required sections:**

- **Context** — The problem and constraints. What prompted this design work. Enough background that a reader unfamiliar with the initiative can understand why the design was needed.
- **Design Overview** — The high-level architecture: system diagrams (Mermaid encouraged), data flow, API contracts, schema changes. For complex designs with subdesigns, summarize the overall shape here and link to each subdesign doc rather than inlining detail.
- **Alternatives Considered** — Other approaches and why they were rejected. This section exists so future engineers understand the decision landscape, not just the outcome. Use `### ` subheadings per alternative with `(chosen)` on the selected approach and `**Why rejected:**` on the others.
- **Dependencies & Risks** — External systems, migration concerns, rollback strategy.
- **Acceptance Criteria** — How we know the design is correctly implemented.

**Optional section:**

- **ADR Candidates** — Architectural decisions identified during design that warrant their own Architecture Decision Record. Each entry includes a one-line summary and the trigger criteria it matched. Omit if no candidates were identified. These are flagged only — do not write the ADRs themselves. The user can invoke `draft-adr` separately for each candidate.

## Step 8: Write Subdesigns (If Warranted)

If Step 6 identified subsystems, write one file per subsystem under `subdesigns/` using `./templates/subdesign-template.md`. Each subdesign follows the same section structure as DESIGN.md but scoped to its subsystem.

**Key rule:** DESIGN.md must link to every subdesign from its Design Overview section. A subdesign that isn't referenced from the index is invisible.

## Step 9: Validate the Design Doc

Run the focused validation rules defined in `./reference/validation-rules.md` against the design directory.

The rules cover:
- Directory naming (`YYYY-MM-DD-<name>` pattern)
- Required DESIGN.md sections (Context, Design Overview, Alternatives Considered, Dependencies & Risks, Acceptance Criteria)
- Alternatives quality (at least two alternatives, `(chosen)` marker, `**Why rejected:**` on non-chosen)
- Subdesign integrity (all subdesigns referenced from DESIGN.md; each subdesign has required sections)
- Cross-reference integrity (linked files exist on disk)

If validation returns errors, fix them before proceeding. Warnings should be reviewed and addressed where appropriate.

## Step 10: Present the Design Doc

Present to the user:
- Design directory location
- Summary of sections and any subdesigns
- ADR candidates flagged (with suggested next step: invoke `draft-adr` per candidate)
- Validation results

If the user requests changes, update the relevant files, re-validate, and re-present.

---

## Error Handling

### Insufficient Alternatives Analysis
If the user provides a design without meaningful alternatives, push back:
> The Alternatives Considered section is where a design doc earns its keep. Can you describe at least one alternative approach you considered and why you chose this one instead? Even a "do nothing" baseline counts.

If the user genuinely identified no alternatives, document this honestly: "No viable alternatives identified" with an explanation of why. This often signals the work is better served by an execution plan than a design doc.

### Design Doc Not Warranted
If Step 1 reveals the work doesn't meet any design-doc criteria, exit gracefully:
> Based on the warrant check, this work looks like a better fit for an execution plan. Consider invoking `create-plan` instead — you can always extract a design doc later if architectural justifications pile up in the plan's decision log.

### Decomposition Discovered Mid-Interview
If subdesigns become necessary after the interview has started, pause and ask the user to scope each subsystem's context separately, then proceed with one DESIGN.md + multiple subdesigns.

---

## Success Criteria

- [ ] Design directory created at `docs/design/YYYY-MM-DD-<short-name>/`
- [ ] DESIGN.md contains all required sections: Context, Design Overview, Alternatives Considered, Dependencies & Risks, Acceptance Criteria
- [ ] Alternatives Considered has at least two alternatives with `(chosen)` marker and `**Why rejected:**` on non-chosen
- [ ] Subdesigns (if any) are linked from DESIGN.md and contain required sections
- [ ] ADR candidates (if any) are flagged in DESIGN.md with triggers
- [ ] Validation passes without errors
- [ ] User has reviewed the design doc

## Supporting Files

- See `./reference/when-to-write-design-doc.md` for the warrant check criteria
- See `./reference/design-doc-format-guide.md` for detailed section writing guidance
- See `./reference/interview-methodology.md` for the standalone interview protocol
- See `./reference/validation-rules.md` for the focused validation rule set
- See `./templates/design-template.md` for the DESIGN.md template
- See `./templates/subdesign-template.md` for the subdesign template