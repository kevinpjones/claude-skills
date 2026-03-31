---
name: validate-docs
description: Use this skill when validating execution plans, ADRs, or other structured documentation in docs/. This includes checking that plans and ADRs contain required sections, enforcing size limits for progressive disclosure, verifying naming conventions, and auditing cross-references like ADR supersession links. Trigger keywords include "validate docs", "check plan", "check ADR", "lint docs", "validate plan", "validate ADR", "audit docs", "docs validation", "check documentation".
---

# Validating Structured Documentation

Audit execution plans, ADRs, and other structured documentation in `docs/` for completeness, consistency, and adherence to progressive disclosure principles.

This skill can validate:
- A specific file or directory (e.g., `docs/plans/2026-03-30-stripe-migration/`)
- A specific document type across the repo (e.g., all ADRs)
- The entire `docs/` tree

See `./reference/validation-rules.md` for the complete rule set with severity levels.

---

## Step 1: Determine Validation Scope

If `$ARGUMENTS` is provided, use it to determine scope:
- A path to a specific file → validate that file
- A path to a plan directory → validate the full plan
- A path to `docs/adr/` → validate all ADRs
- `all` or no argument → validate the entire `docs/` tree

If no argument is given, ask the user what they'd like to validate.

## Step 2: Discover Documents

Based on scope, discover the files to validate:

**For plans:**
```bash
ls docs/plans/*/PLAN.md 2>/dev/null
ls docs/plans/*/PROGRESS.md 2>/dev/null
ls docs/plans/*/phases/*.md 2>/dev/null
```

**For ADRs:**
```bash
ls docs/adr/*.md 2>/dev/null
```

If no documents are found in the requested scope, inform the user and exit.

## Step 3: Run Validations

For each discovered document, run the applicable rules from `./reference/validation-rules.md`. Track results as:

- **Error** — Must be fixed. A structural requirement is violated.
- **Warning** — Should be fixed. A best practice is not followed.
- **Info** — Optional improvement suggestion.

### 3a. Plan Validation

For each plan directory under `docs/plans/`:

**Directory naming:**
- Directory name matches `YYYY-MM-DD-<name>` pattern (Error)

**PLAN.md:**
- File exists (Error)
- Contains `## Goal` section (Error)
- Contains `## Phases` section (Error)
- Contains `## Decision Log` section (Error)
- Contains `## Open Questions` section (Warning)
- File length is under 300 lines (Warning — suggests phases should be extracted to `phases/`)
- Each phase listed has a `**Dependencies:**` annotation (Warning)
- If ADR Candidates section exists, each entry has a summary and trigger (Warning)
- If phase diagram exists, verify it uses valid Mermaid syntax (Info)

**PROGRESS.md:**
- File exists (Error)
- Contains `## Current Status` section (Error)
- Contains `## Phase Progress` section (Error)
- Contains `## Active Context` section (Warning)
- Active Context contains `### Next Steps` subsection (Warning)

**Phase documents (in `phases/`):**
- Filename matches `NN-<name>.md` pattern with numeric prefix (Warning)
- Contains `## Objective` section (Error)
- Contains `## Approach` section (Error)
- Contains `## Acceptance Criteria` section (Error)
- Contains `## Risks & Mitigations` section (Warning)
- Each phase file is referenced from PLAN.md (Warning — orphan detection)

**Cross-references:**
- Phase docs linked in PLAN.md exist on disk (Error)
- Reference docs linked in PLAN.md or phase docs exist on disk (Error)

### 3b. ADR Validation

For each ADR file under `docs/adr/`:

**Filename:**
- Matches `YYYY-MM-DD-<name>.md` pattern (Error)
- Date portion is a valid date (Error)
- Sequence suffix (if present) matches `-NN-` pattern (Warning)

**Required sections:**
- Contains a top-level `# Title` heading (Error)
- Contains `## Context` section (Error)
- Contains `## Decision` section (Error)
- Contains `## Tradeoffs` section (Error)
- Contains `## Consequences` section (Error)

**Tradeoff quality:**
- Tradeoffs section contains at least two `### ` subheadings (alternatives) (Warning — suggests insufficient analysis)
- At least one alternative is marked with `(chosen)` (Warning)
- Non-chosen alternatives have a `**Why rejected:**` line (Warning)

**Supersession integrity:**
- If "Superseded by:" is present, the referenced file exists (Error)
- Supersession is bidirectional — if A says "Superseded by B", B's Context should reference A. One-directional supersession links are flagged (Error)
- If "Supersedes:" is referenced in Context, the referenced file exists (Error)

### 3c. Cross-Document Validation (when scope is `all`)

- Plan ADR Candidates reference ADR files that exist in `docs/adr/` (Warning — may be pending)
- No orphaned files in `docs/plans/*/references/` that aren't linked from PLAN.md or a phase doc (Info)

## Step 4: Present Results

Present results grouped by document, with errors first, then warnings, then info:

```
## Validation Results

### docs/plans/2026-03-30-stripe-migration/PLAN.md
- [Error] Missing required section: ## Goal
- [Warning] File is 342 lines — consider extracting complex phases to phases/

### docs/adr/2026-03-30-use-orb-for-billing.md
- [Warning] Tradeoffs section has only one alternative — consider documenting at least two
- [Warning] Alternative "Build custom billing" missing "Why rejected:" line

### Summary
- 1 error, 3 warnings, 0 info
- 2 documents validated
```

## Step 5: Offer Fixes

After presenting results, ask the user if they'd like to fix any of the errors or warnings. If yes:
- For missing sections: add the section with a placeholder from the relevant template
- For naming issues: suggest the corrected name but do not rename (renaming may affect git history)
- For cross-reference issues: identify the broken link and suggest the correction
- For size warnings: identify which phases are candidates for extraction

Only fix issues the user approves. Do not auto-fix without confirmation.

---

## Error Handling

### Missing `docs/` Directory
- Inform the user that no structured documentation was found
- Suggest using `create-plan` or `draft-adr` to get started

### Partial Structures
- Validate what exists; don't fail on optional directories (`phases/`, `references/`)
- Flag missing optional files as Info, not Error

---

## Success Criteria

- [ ] All documents in scope were discovered and validated
- [ ] Results clearly distinguish Error vs. Warning vs. Info
- [ ] Cross-references were checked (supersession, phase links)
- [ ] User was offered the option to fix issues
- [ ] No false positives on optional sections

## Supporting Files

- See `./reference/validation-rules.md` for the complete rule set with severity levels and examples
