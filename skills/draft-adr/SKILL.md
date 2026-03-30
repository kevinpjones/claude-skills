---
name: draft-adr
description: Use this skill when drafting an Architecture Decision Record (ADR) to document a significant architectural decision. This includes writing new ADRs, documenting technology choices, recording architectural tradeoffs, or capturing decisions about patterns, vendors, dependencies, or system boundaries. Trigger keywords include "draft ADR", "write ADR", "architecture decision", "decision record", "document decision", "ADR", "architectural decision", "record tradeoffs".
---

# Drafting Architecture Decision Records

Create a well-formed Architecture Decision Record in `docs/adr/`. This skill operates in two modes:

- **Standalone**: Conducts an iterative interview to gather decision context, alternatives, and tradeoffs.
- **From create-plan**: Receives pre-gathered context and formats the ADR directly, skipping the interview.

The skill produces the ADR file only. Branching, committing, and PR creation are the caller's responsibility.

---

## Step 1: Determine the ADR Name

If `$ARGUMENTS` is provided, use it as the ADR short name. Otherwise, ask the user for a brief name describing the decision (e.g., "use-orb-for-billing").

Normalize the name:
- Convert to lowercase
- Replace spaces with hyphens
- Remove special characters
- Collapse consecutive hyphens

## Step 2: Generate the ADR Filename

ADR files use a date-based naming convention: `YYYY-MM-DD-<short-name>.md`

To determine the filename:
1. Use today's date as the prefix
2. Check `docs/adr/` for existing ADRs with the same date prefix:
   ```bash
   ls docs/adr/YYYY-MM-DD-*.md 2>/dev/null
   ```
3. If no ADRs exist for today, the filename is: `YYYY-MM-DD-<short-name>.md`
4. If one or more ADRs already exist for today, append a sequence suffix: `YYYY-MM-DD-02-<short-name>.md`, `YYYY-MM-DD-03-<short-name>.md`, etc. Count existing files and use the next number.

## Step 3: Ensure `docs/adr/` Exists

```bash
mkdir -p docs/adr
```

If this is the first ADR, note that a `docs/adr/README.md` index should be created eventually (outside this skill's scope).

## Step 4: Gather Decision Context

### Mode Detection

Check whether sufficient context has already been provided (e.g., from a `create-plan` interview). Sufficient context means all of the following are known:
- What decision was made
- What alternatives were considered
- What tradeoffs were evaluated
- What consequences follow

**If sufficient context exists:** Proceed directly to Step 5.

**If context is insufficient (standalone invocation):** Conduct the interview below.

### Standalone Interview

Use `AskUserQuestion` to gather context across three rounds. See `./reference/interview-methodology.md` for the full protocol.

**Round 1 — Context & Decision:**
> What architectural decision are you documenting?
> - What situation or problem prompted this decision?
> - What did you decide?

**Round 2 — Alternatives & Tradeoffs:**
> What alternatives did you consider?
> - For each alternative, what were the key tradeoffs?
> - What was the deciding factor?

**Round 3 — Consequences:**
> What changes as a result of this decision?
> - What becomes easier?
> - What becomes harder or more constrained?
> - Are there follow-on decisions this creates?

Adapt questions based on previous answers. Skip rounds where context is already clear. The user may end the interview early — proceed with available context.

## Step 5: Write the ADR

Write the ADR file to `docs/adr/<filename>` using the format in `./templates/adr-template.md`.

See `./reference/adr-format-guide.md` for detailed guidance on writing each section.

**Section requirements:**

- **Title** — Short description of the decision. Use the ADR short name, capitalized naturally.
- **Context** — The situation, problem, or constraint that prompted the decision. Write in past or present tense. Include enough background that a reader unfamiliar with the initiative can understand why this decision was needed.
- **Decision** — What was decided. Be direct and specific: "We will use X" not "We considered using X."
- **Tradeoffs** — The most important section. Explicitly enumerate what we gain and what we give up. Cover each alternative considered and why it was rejected. This section prevents future engineers and agents from re-litigating settled decisions.
- **Consequences** — What changes as a result. What becomes easier, what becomes harder, what follow-on work is created.

**Optional section:**

- **Superseded by** — Only include if this ADR replaces a prior decision. Reference the superseding ADR's filename. When adding this field, also update the superseded ADR to include a "Superseded by" reference back.

## Step 6: Present the ADR

Display the generated ADR content to the user for review. If changes are requested, update the file and re-present.

---

## Error Handling

### Insufficient Tradeoff Analysis
If the user provides a decision without meaningful alternatives or tradeoffs, push back:
> An ADR's primary value is in the tradeoff analysis. Can you describe at least one alternative you considered and why you chose this approach instead?

If the user cannot provide alternatives, document this honestly: "No viable alternatives were identified" with an explanation of why.

### Supersession
When an ADR supersedes a prior decision:
1. Add "Superseded by: YYYY-MM-DD-new-decision.md" to the old ADR
2. Add "Supersedes: YYYY-MM-DD-old-decision.md" context to the new ADR
3. Verify both references are well-formed (files exist)

---

## Success Criteria

- [ ] ADR file created at `docs/adr/YYYY-MM-DD-<short-name>.md`
- [ ] All required sections present: Title, Context, Decision, Tradeoffs, Consequences
- [ ] Tradeoffs section contains substantive analysis, not just "we chose X"
- [ ] Filename follows date-based convention with correct sequencing
- [ ] User has reviewed the ADR content

## Supporting Files

- See `./reference/adr-format-guide.md` for detailed section writing guidance
- See `./reference/interview-methodology.md` for standalone interview protocol
- See `./templates/adr-template.md` for the ADR file template