# Context Validation Checklist

Detailed protocol for validating Memory Bank integrity when resuming a project.

## Core File Checks

### projectbrief.md
- [ ] File exists and is not empty
- [ ] Has defined requirements (not just placeholders)
- [ ] Success criteria are specified
- [ ] Scope boundaries are clear

### productContext.md
- [ ] Problem statement is articulated
- [ ] Solution approach is described
- [ ] Target users are identified

### activeContext.md
- [ ] Current phase/status is documented
- [ ] Next steps are listed
- [ ] Last update date is present
- [ ] No references to completed work as "in progress"

### systemPatterns.md
- [ ] Architecture style is documented
- [ ] Key design patterns are noted
- [ ] Component relationships are described

### techContext.md
- [ ] Tech stack is listed
- [ ] Development setup instructions exist
- [ ] Key dependencies are documented
- [ ] Build/test commands are recorded

## Cross-File Consistency Checks

### Requirements Alignment
- Requirements in `projectbrief.md` should align with features described in `productContext.md`
- Technical constraints in `techContext.md` should be compatible with architecture in `systemPatterns.md`

### State Consistency
- `activeContext.md` status should match the level of detail in other files
  - Early phase → some files may be placeholders (expected)
  - Late phase → all files should be well-populated
- Completed items in `activeContext.md` should be reflected in the relevant detail files

### Technical Consistency
- Dependencies in `techContext.md` should match what's in the actual codebase (package.json, etc.)
- Architecture described in `systemPatterns.md` should match actual code organization
- Build/test commands should still work

## Specialized File Checks

For any additional files (featureSpecs.md, apiContext.md, testingContext.md, etc.):
- [ ] Content is relevant and not duplicated from core files
- [ ] References to core files are still accurate
- [ ] No orphaned or outdated specifications

## Staleness Indicators

Watch for these signs that context may be outdated:
- `activeContext.md` last updated more than a few sessions ago
- References to files or functions that no longer exist in the codebase
- Dependency versions that have changed significantly
- Completed TODOs still listed as pending
- Architecture descriptions that don't match current code structure

## Issue Classification

When issues are found, classify them for the summary:

| Severity | Description | Action |
|---|---|---|
| **Critical** | Missing core file, major conflict | Flag for immediate user attention |
| **Warning** | Stale information, minor inconsistency | Note in summary, suggest update |
| **Info** | Placeholder content, missing specialized file | Mention as gap, not blocking |

## Recovery Actions

### For missing core files
- Note which file is missing
- Suggest creating it as part of the implementation plan
- Provide what context you can infer from other files

### For conflicting information
- Cite both sources with file names and line numbers
- Present the conflict clearly in the summary
- Let the user decide which version is correct

### For stale context
- Compare memory bank state with current codebase
- Highlight specific discrepancies
- Recommend targeted updates before proceeding

### For incomplete context
- Identify what's missing vs. what's just brief
- Distinguish "not yet documented" from "lost information"
- Suggest focused interview questions to fill gaps
