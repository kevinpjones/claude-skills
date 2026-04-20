# Design Doc Validation Rules

Focused validation rule set for design documents. The `draft-design-doc` skill runs these rules against a design directory after drafting, and the `validate-docs` skill defers to these rules when validating design documents.

Each rule has an ID, severity, description, and detection method.

## Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| Error | Structural requirement violated | Must fix before the design doc is considered well-formed |
| Warning | Best practice not followed | Should fix to maintain quality; may indicate a deeper issue |
| Info | Optional improvement | Nice to have; no action required |

---

## Directory & Naming

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| D-001 | Error | Design directory matches `YYYY-MM-DD-<name>` pattern | Regex: `^\d{4}-\d{2}-\d{2}-.+$` on directory name |
| D-002 | Error | Date prefix is a valid calendar date | Parse YYYY-MM-DD; reject Feb 30, etc. |
| D-003 | Error | Directory lives under `docs/design/` | Path check |

## DESIGN.md

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| D-010 | Error | DESIGN.md exists in design directory | File existence check |
| D-011 | Error | Contains a top-level `# ` heading (title) | Grep for `^# ` |
| D-012 | Error | Contains `## Context` section | Grep for `^## Context` |
| D-013 | Error | Contains `## Design Overview` section | Grep for `^## Design Overview` |
| D-014 | Error | Contains `## Alternatives Considered` section | Grep for `^## Alternatives Considered` |
| D-015 | Error | Contains `## Dependencies` or `## Dependencies & Risks` or `## Risks` section | Grep for `^## Dependencies` or `^## Risks` |
| D-016 | Error | Contains `## Acceptance Criteria` section | Grep for `^## Acceptance Criteria` |
| D-017 | Warning | File length under 500 lines | `wc -l` — suggests decomposition into subdesigns |
| D-018 | Info | Design Overview contains at least one diagram (Mermaid or image) | Grep for ```` ```mermaid```` or image markdown in Design Overview section |

## Alternatives Quality

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| D-020 | Error | Alternatives Considered contains at least 2 `### ` subheadings | Count `### ` headings between `## Alternatives Considered` and the next `## ` heading |
| D-021 | Error | At least one alternative is marked `(chosen)` | Grep for `(chosen)` in Alternatives Considered section |
| D-022 | Warning | Non-chosen alternatives have `**Why rejected:**` line | For each `### ` without `(chosen)`, grep for `**Why rejected:**` within the subsection |
| D-023 | Warning | Each alternative enumerates both gains and tradeoffs | Check each `### ` subsection contains both `**Gains:**` and one of `**Gives up:**` / `**Tradeoffs:**` / `**Why rejected:**` |

## Subdesigns

Applies only if `subdesigns/` directory exists.

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| D-030 | Error | Every file in `subdesigns/` is linked from DESIGN.md | Extract filenames; grep DESIGN.md for each |
| D-031 | Error | Every subdesign linked from DESIGN.md exists on disk | Extract link targets; check file existence |
| D-032 | Error | Each subdesign contains `## Context` section | Grep within each subdesign file |
| D-033 | Error | Each subdesign contains `## Design Overview` section | Grep within each subdesign file |
| D-034 | Warning | Each subdesign contains `## Alternatives Considered` section | Grep — subdesigns may skip this if all alternatives are captured in parent |
| D-035 | Warning | Each subdesign contains `## Dependencies` or `## Risks` section | Grep within each subdesign file |
| D-036 | Warning | Each subdesign contains `## Acceptance Criteria` section | Grep within each subdesign file |
| D-037 | Warning | Subdesign filenames use kebab-case `.md` (no numeric prefix required) | Regex: `^[a-z0-9-]+\.md$` |

## References

Applies only if `references/` directory exists.

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| D-040 | Info | No orphaned files in `references/` — each is linked from DESIGN.md or a subdesign | Check each file in `references/` is referenced |

## ADR Candidates

Applies only if the `## ADR Candidates` section exists in DESIGN.md.

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| D-050 | Warning | Each ADR candidate entry includes a one-line summary and a trigger | List item parsing — each entry has both a summary clause and a trigger clause |
| D-051 | Info | ADR Candidates referenced by name can be found in `docs/adr/` | Grep `docs/adr/` for ADR names — candidates may be pending and missing |

## Cross-References

| ID | Severity | Rule | Detection |
|----|----------|------|-----------|
| D-060 | Error | Links from DESIGN.md to local files (subdesigns, references) resolve | Extract relative links, check file existence |
| D-061 | Warning | Cross-repo subdesign links are HTTPS URLs (not local paths) | Extract external links; verify scheme |

---

## Section Detection Method

Sections are detected by matching markdown heading patterns at the start of a line:

```
^# Title          → Level 1 heading (DESIGN title)
^## Section       → Level 2 heading (required/optional sections)
^### Subsection   → Level 3 heading (alternatives, subsystem breakdowns)
```

**Section boundaries:** A section extends from its heading to the next heading of equal or higher level, or end of file. When checking content within a section (e.g., alternative subheadings), only search within the section boundaries.

**Case sensitivity:** Section headings should be matched case-insensitively to avoid false positives from minor capitalization differences. The canonical form is what the templates use, but accept reasonable variations.

### Common Heading Variations to Accept

| Canonical | Also accept |
|-----------|-------------|
| `## Design Overview` | `## Design`, `## Proposed Design`, `## Architecture` |
| `## Alternatives Considered` | `## Alternatives`, `## Other Approaches` |
| `## Dependencies & Risks` | `## Dependencies`, `## Risks`, `## Dependencies and Risks` |
| `## Acceptance Criteria` | `## Acceptance criteria`, `## Success Criteria` |
| `## ADR Candidates` | `## ADR candidates`, `## Candidate ADRs` |

---

## How `validate-docs` Integrates

The `validate-docs` skill should defer to this rule set when its scope includes a design doc. In practice:

- When `validate-docs` discovers a directory under `docs/design/`, it loads these rules and applies them.
- When `validate-docs` runs against the full `docs/` tree, design doc rules are applied alongside plan and ADR rules.
- Severity levels and reporting format match the existing `validate-docs` conventions so results can be presented uniformly.
