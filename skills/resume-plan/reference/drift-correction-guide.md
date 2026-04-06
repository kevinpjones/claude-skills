# Drift Correction Guide

How to propose and apply corrections when plan documentation disagrees with reality.

## Principles

1. **Reality wins.** Git history, PR state, and code are the source of truth. Plan docs are a representation of that truth — when they diverge, the docs are wrong.
2. **Correct before continuing.** Working from stale docs leads to duplicated effort, missed dependencies, or skipped steps. Fix the map before navigating by it.
3. **User decides.** Present proposed corrections clearly and let the user approve, modify, or reject them. Never silently edit plan docs.

## Detection Workflow

After completing the validation steps (git history, PR status, code state), compile all discrepancies into a single list grouped by severity.

### Critical Discrepancies (must fix before proceeding)

These indicate the plan docs would actively mislead someone continuing the work:

- **Phase marked complete but key deliverable is missing** — The PR was reverted, the feature was removed, or acceptance criteria are clearly not met.
  - *Correction:* Revert the phase status to "In Progress" and note what remains.

- **Phase marked complete but dependent PR is still open** — Work described as done is still under review or has requested changes.
  - *Correction:* Revert to "In Progress" and note the PR status.

- **Phase order changed without decision log entry** — Work was done out of documented sequence.
  - *Correction:* Add a decision log entry explaining the reordering and update phase dependencies.

- **Scope was cut or expanded without documentation** — Code evidence shows features that weren't in the plan, or planned features that were dropped.
  - *Correction:* Update PLAN.md phases to reflect actual scope, add decision log entry.

### Warning Discrepancies (should fix, not blocking)

These indicate the docs are behind reality but not dangerously wrong:

- **PR merged but PROGRESS.md not updated** — Work is done, docs just haven't caught up.
  - *Correction:* Update phase status and add PR reference to recent changes.

- **New work done within a phase but active context is stale** — Next steps list actions that are already completed.
  - *Correction:* Update active context to reflect current state.

- **Decision made during implementation but not in decision log** — Code shows a choice was made (e.g., different library, different approach) that the log doesn't mention.
  - *Correction:* Add decision log entry with the date inferred from the commit.

### Info Discrepancies (note but don't block on)

- Missing PR links for completed work
- Incomplete dates in decision log
- Minor wording inconsistencies between PLAN.md and phase docs

## Presenting Corrections

Format corrections as a single, scannable block:

```markdown
### Plan Documentation Drift

I found the following discrepancies between the plan docs and the current state:

#### Critical
- **Phase 2 marked complete but PR #45 was closed without merging**
  PROGRESS.md (line 12) says "Complete" but `gh pr view 45` shows state: CLOSED.
  - Proposed fix: Set Phase 2 status to "In Progress", update recent changes

#### Warnings
- **Phase 1 PR #38 merged but not recorded**
  PR #38 "Add webhook handler" was merged on 2026-03-28 but PROGRESS.md
  doesn't reference it.
  - Proposed fix: Add PR #38 to recent changes, confirm Phase 1 completion date

#### Info
- Phase 3 description in PLAN.md says "migrate users table" but the phase doc
  title says "migrate accounts table" — likely a rename that wasn't propagated.
```

Always include:
- The specific file and line number where the incorrect information lives
- The evidence that contradicts it (git commit, PR state, code grep)
- The proposed correction in concrete terms

## Applying Corrections

On user approval, apply corrections in this order:

### 1. PROGRESS.md Phase Progress Table
Update phase statuses, completion dates, and blocker notes to match reality.

### 2. PROGRESS.md Active Context
- **Recent Changes**: Add any PRs or commits discovered during validation
- **Next Steps**: Replace stale next steps with current ones
- **Working Decisions**: Capture any tactical decisions found in code but not documented

### 3. PLAN.md Decision Log
Add a single entry summarizing the corrections:

```
| YYYY-MM-DD | Progress reconciled during plan resume | [list key corrections: e.g., "Phase 2 reverted to in-progress, Phase 1 completion confirmed"] |
```

### 4. Phase Documents
If a phase's status changed, update its doc if one exists — especially if acceptance criteria need to be re-evaluated.

### 5. PLAN.md Phases Section
Only if scope changes were detected (phases added, removed, or reordered).

## When the User Declines Corrections

If the user declines some or all corrections:
- Do **not** silently apply them
- Include the unresolved discrepancies in the status report with a note: "The following discrepancies were identified but not corrected"
- Proceed with the execution plan, but call out any risks stemming from the uncorrected drift
