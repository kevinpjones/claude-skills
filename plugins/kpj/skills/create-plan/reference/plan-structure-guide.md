# Execution Plan Structure Guide

Complete specification for the execution plan directory layout and file contents.

## Directory Structure

Each plan lives in a date-prefixed subdirectory under `docs/plans/`:

```
docs/plans/YYYY-MM-DD-<plan-name>/
├── PLAN.md                  # Required: plan index + decision log
├── PROGRESS.md              # Required: progress + active context
├── phases/                  # Optional: deep-dive phase docs
│   ├── 01-phase-name.md
│   ├── 02-phase-name.md
│   └── 03-phase-name.md
└── references/              # Optional: tactical decisions & patterns
    ├── research-finding.md
    └── comparison-notes.md
```

The `YYYY-MM-DD` prefix uses the date the plan was created, enabling chronological sorting when listing plans (e.g., `2026-03-30-stripe-migration`).

## PLAN.md — The Plan Index

The entry point for the plan. An agent looking to understand or resume work on this initiative starts here. It should be concise and serve as a router into deeper material.

### Required Sections

**Goal** — What we're trying to accomplish and why. Should be 2-5 sentences that any team member can read and understand the motivation.

**Phases** — A high-level summary of each phase with one-line descriptions.
- Simple phases (describable in 1-2 sentences) stay inline
- Complex phases link to detailed docs in `phases/`
- Each phase should list its key dependencies on other phases

**Decision Log** — A chronological record of adjustments and revisions to the plan. Each entry includes:
- Date
- What changed
- Why it changed

This is distinct from ADRs — the decision log captures plan-level decisions like "we moved Phase 3 before Phase 2 because of a dependency we discovered" or "we descoped the backfill from this plan."

**Open Questions** — Unresolved items that need input before work can proceed or that were identified during planning but deferred.

## PROGRESS.md — Progress & Active Context

Tracks progress toward plan completion and captures the active context required to continue work.

### Progress Tracking Sections

**Current Status** — Overall plan status (e.g., "Phase 2 in progress, Phase 1 complete").

**Phase-by-phase progress** — For each phase: status, completion date (if done), blockers, and next steps.

### Active Context Sections

**Recent Changes** — Code changes and PRs created as part of the current phase. Links to PRs, brief descriptions, and merge status.

**Next Steps** — Specific, concrete actions to take next. Not the high-level phase description, but granular tasks like "merge PR #1234, then update the webhook handler."

**Working Decisions** — Tactical decisions or assumptions made during implementation that haven't been formalized into the decision log.

**Environment or Setup Notes** — Temporary setup, feature flags, test accounts, or branch conventions relevant to current work.

The active context section is intentionally ephemeral — it should be overwritten as work progresses. Think of it as a "save state" for work in progress.

## Phase Documents

Phase docs live in `phases/` and are named with numeric prefixes for ordering: `01-phase-name.md`.

### Required Sections in a Phase Doc

**Objective** — What this phase accomplishes.

**Approach** — Step-by-step breakdown of how the work will be done.

**Acceptance Criteria** — How we know this phase is complete.

**Risks and Mitigations** — Phase-specific concerns.

### When a Phase Needs Its Own Doc

- Multiple sub-steps requiring detailed breakdown
- Non-obvious technical decisions to document
- Specific acceptance criteria worth enumerating
- Would take more than 2-3 sentences in PLAN.md

Simple phases ("update the CI config to run the new test suite") stay as line items in PLAN.md.

## References

The `references/` subdirectory houses reference material specific to this plan — tactical decisions, patterns, research findings, or comparison notes.

### What Goes in References

- Comparison of approaches and which one was chosen
- Spike investigation findings that informed the phase structure
- API behavior notes from testing
- Error mapping documents
- Performance benchmark results

### When References Graduate

If a reference has broader applicability beyond this plan:
- Architectural decisions → graduate to an ADR in `docs/adr/`
- System design → graduate to a design doc in `docs/design/`

## When to Decompose

A single-file plan (just PLAN.md and PROGRESS.md) works fine for small initiatives. Use the full subdirectory structure when:
- The plan has 3+ phases with meaningful complexity
- There is substantial reference material
- Different people may own different phases
- The plan will span multiple weeks of work