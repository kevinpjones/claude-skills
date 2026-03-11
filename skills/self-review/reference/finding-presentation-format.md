# Finding Presentation Format

## Line Width

**Wrap all finding text at 120 characters.** This applies to all text presented to the user in the terminal —
descriptions, analysis, recommendations, and code explanations. Code blocks and file paths are exempt — don't break
those mid-line.

## Coordinator Analysis

When presenting each finding to the user, the coordinator MUST provide its own analysis and advice alongside the raw
finding. This transforms the review from a simple list of issues into a guided conversation.

### Analysis Structure

For each finding, present:

1. **The finding itself** — file, line(s), severity, description, and the agent's suggestion
2. **Coordinator analysis** — your independent assessment covering:
   - **Agreement level**: Do you agree with the finding? Is it a real issue or a false positive?
   - **Impact assessment**: What's the practical impact of this issue? Could it cause bugs, confusion, or maintenance burden?
   - **Fix complexity**: Is this a one-line fix, a small refactor, or a larger structural change?
   - **Grouping advice**: Could this fix be logically combined with another finding? (e.g., "This is related to finding #3 — I'd recommend fixing them together")
3. **Recommended action** — Approve (fix it), Skip (not worth addressing), or Defer (valid but not for this branch)

### Presentation Template

```
### Finding N of M — [severity] — Source: [agent-name]
**File**: `path/to/file.ts` lines 38-42
**Category**: [category]

**Issue**: [agent's description]

**Suggested fix**: [agent's suggestion]

**Code**:
[relevant code snippet if available]

---

**Analysis**: [Your independent assessment — 2-4 sentences covering agreement,
impact, and fix complexity. Be direct and honest. If you disagree with the
finding, say so and explain why.]

**Grouping**: [If related to other findings, note which ones and recommend
fixing together. Otherwise: "Standalone fix"]

**Recommendation**: Approve / Skip / Defer
```

## Severity Presentation

- **High**: Present with `🚨` prefix — "This should be fixed before merging"
- **Medium**: Present normally — "Worth addressing in this branch"
- **Low**: Present with note — "Minor improvement, skip if time is tight"

## General Findings

General (non-file-specific) findings are presented in a separate summary section after all file-specific findings. These don't get individual approve/skip treatment — instead they inform the overall review summary and may influence how fixes are approached.
