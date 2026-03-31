# Validation Rules Reference

Complete rule set for structured documentation validation. Each rule has an ID, severity, description, and detection method.

## Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| Error | Structural requirement violated | Must fix before the document is considered well-formed |
| Warning | Best practice not followed | Should fix to maintain quality; may indicate a deeper issue |
| Info | Optional improvement | Nice to have; no action required |

---

## Plan Rules

### Directory & Naming

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| P-001 | Error | Plan directory matches `YYYY-MM-DD-<name>` pattern | Regex: `^\d{4}-\d{2}-\d{2}-.+$` on directory name |
| P-002 | Error | Date prefix is a valid calendar date | Parse YYYY-MM-DD; reject Feb 30, etc. |

### PLAN.md

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| P-010 | Error | PLAN.md exists in plan directory | File existence check |
| P-011 | Error | Contains `## Goal` section | Grep for `^## Goal` |
| P-012 | Error | Contains `## Phases` section | Grep for `^## Phases` |
| P-013 | Error | Contains `## Decision Log` section | Grep for `^## Decision Log` |
| P-014 | Warning | Contains `## Open Questions` section | Grep for `^## Open Questions` |
| P-015 | Warning | File length under 300 lines | `wc -l` |
| P-016 | Warning | Each phase has `**Dependencies:**` annotation | Grep within each phase subsection |
| P-017 | Warning | ADR Candidates entries have summary and trigger columns | Table row validation |
| P-018 | Info | Phase diagram uses valid Mermaid syntax | Check for `graph` or `flowchart` keyword in fenced mermaid block |

### PROGRESS.md

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| P-020 | Error | PROGRESS.md exists in plan directory | File existence check |
| P-021 | Error | Contains `## Current Status` section | Grep for `^## Current Status` |
| P-022 | Error | Contains `## Phase Progress` section | Grep for `^## Phase Progress` |
| P-023 | Warning | Contains `## Active Context` section | Grep for `^## Active Context` |
| P-024 | Warning | Active Context contains `### Next Steps` | Grep for `^### Next Steps` |

### Phase Documents

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| P-030 | Warning | Filename matches `NN-<name>.md` pattern | Regex: `^\d{2}-.+\.md$` |
| P-031 | Error | Contains `## Objective` section | Grep for `^## Objective` |
| P-032 | Error | Contains `## Approach` section | Grep for `^## Approach` |
| P-033 | Error | Contains `## Acceptance Criteria` section | Grep for `^## Acceptance Criteria` |
| P-034 | Warning | Contains `## Risks & Mitigations` section | Grep for `^## Risks` |
| P-035 | Warning | Phase file is referenced from PLAN.md | Grep PLAN.md for the phase filename |

### Cross-References

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| P-040 | Error | Phase docs linked in PLAN.md exist on disk | Extract links, check file existence |
| P-041 | Error | Reference docs linked in PLAN.md or phases exist on disk | Extract links, check file existence |

---

## ADR Rules

### Filename

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| A-001 | Error | Filename matches `YYYY-MM-DD-<name>.md` pattern | Regex: `^\d{4}-\d{2}-\d{2}(-\d{2})?-.+\.md$` |
| A-002 | Error | Date portion is a valid calendar date | Parse YYYY-MM-DD |
| A-003 | Warning | Sequence suffix (if present) is two digits | Regex check on optional `-NN-` segment |

### Required Sections

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| A-010 | Error | Contains a top-level `# ` heading (title) | Grep for `^# ` |
| A-011 | Error | Contains `## Context` section | Grep for `^## Context` |
| A-012 | Error | Contains `## Decision` section | Grep for `^## Decision` |
| A-013 | Error | Contains `## Tradeoffs` section | Grep for `^## Tradeoffs` |
| A-014 | Error | Contains `## Consequences` section | Grep for `^## Consequences` |

### Tradeoff Quality

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| A-020 | Warning | Tradeoffs section contains at least 2 `### ` subheadings | Count `### ` headings between `## Tradeoffs` and the next `## ` heading |
| A-021 | Warning | At least one alternative marked `(chosen)` | Grep for `(chosen)` in Tradeoffs section |
| A-022 | Warning | Non-chosen alternatives have `**Why rejected:**` | For each `### ` without `(chosen)`, grep for `**Why rejected:**` |

### Supersession Integrity

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| A-030 | Error | "Superseded by:" references an existing file | Extract filename, check `docs/adr/` |
| A-031 | Error | Supersession is bidirectional — no orphaned supersession links | If A references B, check B references A |
| A-032 | Error | "Supersedes:" in Context references an existing file | Extract filename, check `docs/adr/` |

---

## Cross-Document Rules

These rules apply when validating the entire `docs/` tree.

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| X-001 | Warning | Plan ADR Candidates reference existing ADR files | Extract ADR names from plan, check `docs/adr/` |
| X-002 | Info | No orphaned files in plan `references/` directory | Check each file in `references/` is linked from PLAN.md or a phase doc |

---

## Section Detection Method

Sections are detected by matching markdown heading patterns at the start of a line:

```
^# Title      → Level 1 heading (ADR title)
^## Section   → Level 2 heading (required/optional sections)
^### Subsection → Level 3 heading (phase names, alternatives in tradeoffs)
```

**Section boundaries:** A section extends from its heading to the next heading of equal or higher level, or end of file. When checking content within a section (e.g., tradeoff subheadings), only search within the section boundaries.

**Case sensitivity:** Section headings should be matched case-insensitively to avoid false positives from minor capitalization differences (e.g., `## Trade-offs` vs `## Tradeoffs`). The canonical form is what the templates use, but accept reasonable variations.

### Common Heading Variations to Accept

| Canonical | Also accept |
|-----------|-------------|
| `## Tradeoffs` | `## Trade-offs`, `## Trade-Offs` |
| `## Risks & Mitigations` | `## Risks and Mitigations`, `## Risks` |
| `## Acceptance Criteria` | `## Acceptance criteria` |
| `## Active Context` | `## Active context` |