# ADR Format Guide

Detailed guidance for writing each section of an Architecture Decision Record.

## Purpose of ADRs

ADRs capture **significant architectural decisions** with full context and tradeoff analysis. They are permanent records — once merged, they are not deleted, only superseded.

**Merging an ADR is the act of adopting it.** There is no separate "proposed" to "accepted" workflow. An ADR on the main branch is the team's accepted decision. Debate happens in PR review, not in the ADR itself.

## Immutability: What Can and Can't Change After Merge

Unlike design docs, ADRs are not living documents. Once merged, the content sections — Context, Decision, Tradeoffs, Consequences — are never rewritten, not even to "clean up" phrasing. The record needs to reflect what was actually decided and why, at the time it was decided; rewriting it after the fact erases the thing future readers most need.

Two narrow exceptions exist, both handled without touching the content sections:

- **Corrections** — a purely factual fix (a typo, a broken link, a misstated number) that doesn't change the decision. Append a row to the Corrections table (see below). Never edit Context/Decision/Tradeoffs/Consequences to make the fix.
- **Supersession** — when a later decision replaces this one. The old ADR is never deleted or rewritten; its header table's `Superseded by` field gets updated to point to the new ADR. That's the only header-table field that changes post-merge, and it's a pointer update, not a rewrite of reasoning.

If you're asked to "fix" or "update" an existing merged ADR, first decide which case it is. If the requested change would alter the decision itself — not just correct a fact about it — it isn't a correction. Decline to edit the old ADR's content and propose a new ADR that supersedes it instead.

## The Header Table

Every ADR opens with a table right after the title:

```markdown
| | |
|---|---|
| **Supersedes** | [None, or links to prior ADRs this replaces] |
| **Superseded by** | [None, or a link to the ADR that replaced this one] |
| **Related** | [Links to related ADRs or design docs, or None] |
```

- **Supersedes** — set at authoring time if this ADR replaces one or more prior decisions. Link to them with relative paths.
- **Superseded by** — left `None` at authoring time. Filled in later, on the *old* ADR, at the moment a new ADR supersedes it — the one legitimate post-merge edit to an ADR file.
- **Related** — links to ADRs or design docs that inform or connect to this one, but don't supersede it. Unlike the other two fields, this can be extended after merge without being a "correction" — adding a cross-reference doesn't touch the decision.

## The Corrections Table

Directly below the header table:

```markdown
## Corrections

| Correction |
|---|
```

Leave it with just the header row when there's nothing to record — it's a placeholder, not something to delete. When a genuine factual correction is needed post-merge, append a row describing the fix in one line (e.g., "Fixed broken link to the payments ADR — was pointing at the wrong filename"). Don't add a date or author column: git blame on the file already carries that, and duplicating it invites drift.

If you can't describe the fix in one line without touching what was actually decided, it's not a correction — see Immutability above.

## Writing Each Section

### Title

The title should be a short, descriptive phrase that completes the sentence "We decided to..."

**Good titles:**
- Use Orb for Billing
- Adopt Repository Pattern for Database Access
- Use Stripe Payment Intents Over Charges API
- Implement Event Sourcing for Invoice State

**Bad titles:**
- Billing Decision
- Database Stuff
- ADR About Payments

### Context

The context section answers: **Why did we need to make this decision?**

Write in past or present tense. Include:
- The situation or problem that prompted the decision
- Relevant constraints (technical, organizational, timeline)
- Any prior decisions or existing patterns that frame this choice

**Good context:**
> Our billing system currently calls the Stripe Charges API directly from
> multiple services. The Charges API is deprecated, and Stripe has announced
> it will be removed in Q4 2026. Additionally, Payment Intents support 3D
> Secure authentication, which is required for our European expansion.

**Bad context:**
> We need to change billing.

**Name the actual trigger precisely.** If a specific event, threshold, or state change is what makes this decision necessary, name that exact thing rather than a loose paraphrase of it. "Ready to be transacting on the new system" and "ready to migrate onto the new system" sound similar but point at different decision points — get the real one right, since it's often what the Decision and Consequences sections hinge on.

**Don't narrate the paper trail.** Skip mentions of the ticket, issue, or story that prompted this work ("The Jira story for this effort..."). That belongs in the commit message or PR description, which already link the ticket — the ADR should state the problem and constraint directly, not how it was reported to you.

**Sometimes the decision is making an implicit convention explicit, not choosing between live options.** If the team has already been behaving a certain way in practice — just without a written rule or enforcement — say that. Frame the Context around "this was already true but unstated/unenforced" and the Decision as "we will make this explicit and enforced," rather than dressing it up as a choice between alternatives that were never really in contention. The Tradeoffs section still applies: what's gained by enforcing it (catches future drift, removes ambiguity) versus what's given up (less flexibility for legitimate exceptions).

### Decision

The decision section states **what was decided**, clearly and directly.

Use "We will..." phrasing. Be specific about the concrete choice, not just the direction.

**Good decision:**
> We will migrate all payment processing from the Stripe Charges API to the
> Payment Intents API. New payment flows will use Payment Intents immediately.
> Existing Charges API calls will be migrated service-by-service over three
> phases.

**Bad decision:**
> We're going to update Stripe stuff.

### Tradeoffs

**This is the most important section.** It exists so that future engineers and agents understand the decision landscape, not just the outcome.

For each alternative considered:
1. Name the alternative clearly
2. State its advantages
3. State its disadvantages
4. Explain why it was or wasn't chosen

Structure as a comparison when there are multiple alternatives:

```markdown
### Alternative 1: Migrate to Payment Intents (chosen)

**Gains:**
- Native 3D Secure support for EU compliance
- Access to Stripe's latest features and improvements
- Consistent with Stripe's recommended integration path

**Gives up:**
- Requires migration of all existing payment flows
- Payment Intents API is more complex (two-step confirm flow)
- Temporary dual-API support during migration

### Alternative 2: Wrap Charges API with 3DS middleware

**Gains:**
- No migration of existing flows needed
- Faster to implement initially

**Gives up:**
- Building on a deprecated API with a known removal date
- Custom 3DS implementation would need ongoing maintenance
- No access to Payment Intents-only features (e.g., payment methods API)

**Why rejected:** Building on a deprecated API creates a hard deadline
we'd need to meet anyway, with the added complexity of maintaining
custom 3DS middleware in the interim.
```

**Common tradeoff pitfalls to avoid:**
- Listing only the gains of the chosen option
- Dismissing alternatives without genuine analysis
- Treating tradeoffs as a formality ("there were no real alternatives")
- Being vague: "it's better" — better *how*, at what cost?
- **Inventing a strawman alternative just to have a second one.** An option nobody genuinely considered — a leaky abstraction, an approach that was never actually on the table — doesn't belong here even if it would satisfy a minimum-count rule. One real alternative, documented honestly, beats two where one is padding. If there's truly only one, say so in the Decision and let the interview's error-handling path (see the skill's `Insufficient Tradeoff Analysis` guidance) note that explicitly rather than manufacturing a second.

### Consequences

The consequences section answers: **What changes as a result of this decision?**

Cover both positive and negative consequences. Include:
- What becomes easier or possible
- What becomes harder or more constrained
- What follow-on decisions or work this creates
- What teams or systems are affected

**Good consequences:**
> - All payment services must be updated to use the PaymentIntents flow
> - The checkout service gains native 3DS support without additional middleware
> - We will need a migration plan for existing stored Charges references
> - Webhook handlers must be updated to process PaymentIntent events
>   alongside legacy Charge events during the transition period

### Supersession

Handled via the header table, not a body section — see "The Header Table" above. When superseding an ADR:
- The new ADR's `Supersedes` field links to the old ADR
- The old ADR's `Superseded by` field is updated to link to the new ADR — the one permitted post-merge edit
- The new ADR's Context section should reference the old ADR and explain why the decision is being revisited
- The old ADR is never deleted or rewritten — it provides historical context

## Tone and Style

- **Be direct.** State facts and reasoning, not feelings.
- **Be honest about costs.** Every decision has downsides. Name them.
- **Write for the future reader.** Someone will read this in a year wondering "why did we do it this way?" Make sure they can find the answer.
- **Avoid jargon without context.** If a term is domain-specific, briefly define it or link to a reference.
- **Keep it focused.** One decision per ADR. If a decision spawns sub-decisions, those get their own ADRs.