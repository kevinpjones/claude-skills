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

**Drafting several ADRs in one sitting** (e.g., a batch of decisions spawned by a single design doc): checking `docs/adr/` once before writing the first file undercounts every ADR after it, since none of the later ones exist on disk yet at check-time. Write each file (or at minimum, record its filename) as soon as its number is settled, and recompute the next ADR's suffix against that running list — including the ones you drafted earlier in this same batch, not just what was already on disk when you started.

## Step 3: Ensure `docs/adr/` Exists

```bash
mkdir -p docs/adr
```

If this is the first ADR, note that a `docs/adr/README.md` index should be created eventually (outside this skill's scope).

## Step 4: Check for Existing ADR Convention

Before assuming the generic template in `./templates/adr-template.md` applies as-is, look at what's already in `docs/adr/` (including any domain subdirectories):

```bash
ls docs/adr/**/*.md 2>/dev/null | head -20
```

If prior ADRs exist, read a couple and follow their actual structure — section set, naming, location — over this skill's generic defaults where they conflict. A repo that's already established "flat files, no separate Consequences section" has made its choice; don't reintroduce a directory structure or section the team isn't using. The header table and Corrections table (see Step 5) are new conventions this skill introduces — if older ADRs predate them, add them going forward without rewriting the old files (see "Maintaining Existing ADRs" below for what post-merge edits are and aren't allowed).

If `docs/adr/` is empty or doesn't exist yet, the generic template is the right default — proceed normally.

## Step 5: Gather Decision Context

### Mode Detection

Check whether sufficient context has already been provided (e.g., from a `create-plan` interview). Sufficient context means all of the following are known:
- What decision was made
- What alternatives were considered
- What tradeoffs were evaluated
- What consequences follow

**If sufficient context exists:** Proceed directly to Step 6.

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

## Step 6: Write the ADR

Write the ADR file to `docs/adr/<filename>` using the format in `./templates/adr-template.md`.

See `./reference/adr-format-guide.md` for detailed guidance on writing each section.

**Header table** — every ADR opens with a `Supersedes` / `Superseded by` / `Related` table (see the format guide). At authoring time, `Supersedes` is filled in if this ADR replaces a prior one, `Related` links any relevant ADRs or design docs, and `Superseded by` is left `None` — it's only ever set later, on this ADR, once something else replaces it.

**Corrections table** — immediately below the header table. Leave it as an empty table (header row only) at authoring time; it exists to be appended to post-merge. See "Maintaining Existing ADRs" below.

**Section requirements:**

- **Title** — Short description of the decision. Use the ADR short name, capitalized naturally.
- **Context** — The situation, problem, or constraint that prompted the decision. Write in past or present tense. Include enough background that a reader unfamiliar with the initiative can understand why this decision was needed. Name the actual triggering event or state precisely — don't paraphrase loosely. Don't narrate the ticket or issue that prompted the work; that belongs in the PR/commit, not here.
- **Decision** — What was decided. Be direct and specific: "We will use X" not "We considered using X." If this is really about making an existing, previously-implicit convention explicit and enforced rather than choosing between live options, say so plainly rather than dressing it up as a choice.
- **Tradeoffs** — The most important section. Explicitly enumerate what we gain and what we give up. Cover each alternative considered and why it was rejected. This section prevents future engineers and agents from re-litigating settled decisions. Only include alternatives that were genuinely considered — don't pad with a strawman to hit a minimum count.
- **Consequences** — What changes as a result. What becomes easier, what becomes harder, what follow-on work is created.

## Step 7: Validate the ADR

Invoke the `validate-docs` skill against the ADR file to verify structural correctness:
- All required sections are present (Title, Context, Decision, Tradeoffs, Consequences)
- Tradeoffs section has sufficient depth (at least two alternatives, chosen/rejected annotations)
- Supersession references (if any) are well-formed and bidirectional
- Filename follows the date-based naming convention

`validate-docs`'s generic ADR rules may not yet know about the header table or Corrections table introduced by this skill — additionally verify yourself that both are present. If the repo's actual ADR precedent (discovered in Step 4) conflicts with a generic rule — e.g., no separate Consequences section — trust the repo's real convention over the generic rule and note the discrepancy to the user rather than forcing the generic shape.

If validation returns errors, fix them before proceeding. Warnings should be reviewed and addressed where appropriate.

## Step 8: Present the ADR

Display the generated ADR content and validation results to the user for review. If changes are requested, update the file, re-validate, and re-present.

---

## Maintaining Existing ADRs

ADRs are append-only once merged — see "Immutability" in `./reference/adr-format-guide.md`. If the user asks you to change a merged ADR, figure out which of these two operations they actually mean before touching the file:

### Appending a Correction

Use this only for a fix that doesn't change the decision — a typo, a broken link, a wrong number that was simply mistyped. Append one line to the Corrections table describing the fix. Do not touch Context, Decision, Tradeoffs, or Consequences, and do not add a date or author to the row — git history already has both.

If the requested change would alter what was actually decided, this isn't a correction. Stop and propose the Supersession path instead.

### Marking Supersession

Use this when a new ADR replaces an old one's decision:
1. Draft the new ADR normally (Steps 1–8), with its `Supersedes` field linking to the old ADR and its Context explaining why the decision is being revisited.
2. On the **old** ADR only, update its `Superseded by` field to link to the new ADR. This is the one post-merge edit to a header-table field that's expected — it's a pointer update, not a rewrite of the old ADR's reasoning.
3. Verify both links resolve to real files.

The old ADR's content sections are never touched during supersession — it stays exactly as it was decided, for historical context.

---

## Error Handling

### Insufficient Tradeoff Analysis
If the user provides a decision without meaningful alternatives or tradeoffs, push back:
> An ADR's primary value is in the tradeoff analysis. Can you describe at least one alternative you considered and why you chose this approach instead?

If the user cannot provide alternatives, document this honestly: "No viable alternatives were identified" with an explanation of why. Don't manufacture a weak alternative just to satisfy this bar — a single genuine alternative, or none, documented honestly is worth more than a padded list.

---

## Success Criteria

- [ ] ADR file created at `docs/adr/YYYY-MM-DD-<short-name>.md`
- [ ] Header table present with `Supersedes` / `Superseded by` / `Related` fields
- [ ] Corrections table present (empty is fine for a new ADR)
- [ ] All required sections present: Title, Context, Decision, Tradeoffs, Consequences
- [ ] Tradeoffs section contains substantive analysis, not just "we chose X," and no strawman alternatives
- [ ] Filename follows date-based convention with correct sequencing
- [ ] User has reviewed the ADR content

## Supporting Files

- See `./reference/adr-format-guide.md` for detailed section writing guidance
- See `./reference/interview-methodology.md` for standalone interview protocol
- See `./templates/adr-template.md` for the ADR file template