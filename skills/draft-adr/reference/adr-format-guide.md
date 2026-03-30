# ADR Format Guide

Detailed guidance for writing each section of an Architecture Decision Record.

## Purpose of ADRs

ADRs capture **significant architectural decisions** with full context and tradeoff analysis. They are permanent records — once merged, they are not deleted, only superseded.

**Merging an ADR is the act of adopting it.** There is no separate "proposed" to "accepted" workflow. An ADR on the main branch is the team's accepted decision. Debate happens in PR review, not in the ADR itself.

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

### Superseded By (Optional)

Only include when this decision has been replaced by a newer ADR.

Format: `Superseded by: YYYY-MM-DD-new-decision-name.md`

When superseding an ADR:
- The old ADR gets a "Superseded by" field pointing to the new ADR
- The new ADR's Context section should reference the old ADR and explain why the decision is being revisited
- The old ADR is never deleted — it provides historical context

## Tone and Style

- **Be direct.** State facts and reasoning, not feelings.
- **Be honest about costs.** Every decision has downsides. Name them.
- **Write for the future reader.** Someone will read this in a year wondering "why did we do it this way?" Make sure they can find the answer.
- **Avoid jargon without context.** If a term is domain-specific, briefly define it or link to a reference.
- **Keep it focused.** One decision per ADR. If a decision spawns sub-decisions, those get their own ADRs.