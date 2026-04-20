# Plan Validation Checklist

Detailed protocol for validating execution plan documentation against the actual state of the codebase, PRs, and git history.

## Document Integrity Checks

### PLAN.md
- [ ] File exists and is not empty
- [ ] Goal section is present and clearly stated
- [ ] Phases section lists all phases with descriptions
- [ ] Decision log exists (even if empty)
- [ ] Open questions section exists
- [ ] Phase references (links to `phases/` docs) resolve to existing files

### PROGRESS.md
- [ ] File exists and is not empty
- [ ] Current status reflects an actual phase state
- [ ] Phase progress table includes all phases from PLAN.md
- [ ] Active context section has next steps
- [ ] No completed phases listed as "in progress" or vice versa

### Phase Documents (if referenced)
- [ ] All referenced phase docs exist in `phases/`
- [ ] Each phase doc has Objective, Approach, and Acceptance Criteria
- [ ] Acceptance criteria are specific and verifiable

## Git History Validation

### Commit Evidence
For each phase marked as "complete" or "in progress" in PROGRESS.md:

1. Search for related commits:
   ```bash
   git log --oneline --all --grep="<phase-keyword>"
   git log --oneline -- <files-mentioned-in-phase>
   ```

2. Verify timing — do commits exist in the expected timeframe?

3. Check for reverts:
   ```bash
   git log --oneline --all --grep="revert" | grep -i "<phase-keyword>"
   ```

### Branch State
- [ ] No orphaned feature branches for completed phases
- [ ] Current branch is appropriate for the active phase
- [ ] No uncommitted work related to the plan

## PR Status Validation

### For Each Referenced PR
```bash
gh pr view <number> --json state,mergedAt,title,url,reviewDecision
```

Verify:
- [ ] Documented state matches actual state (open/merged/closed)
- [ ] If merged, the merge date is plausible given the plan timeline
- [ ] If still open, check for review comments or requested changes

### Undocumented PRs
Search for PRs the plan should reference but doesn't:
```bash
gh pr list --state all --search "<plan-name-or-keywords>" --json number,title,state --limit 15
```

Flag any matches not already in PROGRESS.md.

## Code State Validation

### Files and Directories
For changes described in completed phases:
- [ ] Created files actually exist
- [ ] Deleted files are actually gone
- [ ] Modified files contain the described changes

### Feature Completeness
For features described as complete:
- [ ] The feature code exists and appears functional
- [ ] No TODO/FIXME/HACK comments indicating incomplete work
- [ ] Tests exist if the phase acceptance criteria mention testing

### Acceptance Criteria Spot-Check
For completed phases with specific acceptance criteria:
- Pick 2-3 criteria and verify they are actually met
- Run relevant tests if the criteria mention test coverage
- Check for the described behavior in the code

## Cross-Reference Consistency

### PLAN.md ↔ PROGRESS.md
- [ ] All phases in PLAN.md appear in PROGRESS.md progress table
- [ ] Phase names match between files
- [ ] No phases in PROGRESS.md that aren't in PLAN.md

### PROGRESS.md ↔ Phase Docs
- [ ] Phase status in PROGRESS.md aligns with acceptance criteria in phase docs
- [ ] "Complete" phases have all acceptance criteria met (or documented exceptions)

### Decision Log ↔ Reality
- [ ] Decisions in the log are reflected in the implementation
- [ ] No undocumented pivots visible in the code

## Discrepancy Classification

| Severity | Criteria | Examples |
|----------|----------|----------|
| **Critical** | Progress is materially wrong; continuing based on docs would lead to wasted effort | Phase marked complete but key PR was reverted; acceptance criteria clearly not met |
| **Warning** | Progress is stale or incomplete; docs are behind reality but not misleading | PR merged but not recorded; phase partially done but status not updated |
| **Info** | Minor documentation gap; not blocking | Missing PR link, incomplete date in decision log |
