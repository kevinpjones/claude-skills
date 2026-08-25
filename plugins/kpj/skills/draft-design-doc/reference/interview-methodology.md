# Design Doc Interview Methodology

Protocol for gathering design context when the `draft-design-doc` skill is invoked standalone (not from `create-plan` or another caller that pre-gathers context).

## Interview Principles

- **Focus on the "why"** — design docs exist to capture architectural reasoning. Push past "what we're building" into "why this shape."
- **Surface alternatives aggressively** — without meaningful alternatives, the doc has limited value.
- **Detect ADR candidates continuously** — flag individual decisions as you go; don't wait until the end.
- **Adapt based on answers** — skip rounds where context is already clear; probe deeper where it's thin.
- **Allow early exit** — the user may end the interview and ask you to draft with what you have.
- **Don't invent the causal mechanism.** If it's unconfirmed *why* something actually happens, or *what* a rejected alternative would or wouldn't fix, don't paper over the gap with a plausible-sounding guess. Ask, or check the code — a misdiagnosed root cause, or an alternative rejected for a reason that turns out to be false (e.g., citing a problem the system already handles via existing idempotency, retries, etc.), invalidates the analysis for anyone who knows the system.

## Round 1: Context & Constraints

**Goal:** Understand what prompted the design work and what box the solution must fit into.

**Questions:**
- "What problem is this design solving?"
- "What prompted the design work now — a deprecation, scale pressure, compliance, a new requirement?"
- "What constraints shape the solution? Timeline, team capacity, existing systems you can't change, vendor contracts?"

**Follow-up triggers:**
- If the problem is vague → "Can you describe a specific scenario where this became a problem? What breaks today?"
- If no constraints mentioned → "Is there a deadline, a budget limit, or a dependency you can't change? Even 'must not break existing API consumers' is a constraint worth naming."
- If there's prior work → "What have you tried already, and why did those attempts fall short?"

**After this round you should know:** What's being designed and why, plus the shape of the solution space.

## Round 2: Design Shape

**Goal:** Understand the proposed architecture at a high level.

**Questions:**
- "What's the proposed design at a high level? Walk me through the major components."
- "How does data or control flow through the system?"
- "Are there schema changes, API contracts, or event shapes involved?"
- "Does the design touch multiple services, teams, or bounded contexts?"

**Follow-up triggers:**
- If the design is a single component → probe whether subdesigns are really needed (often not).
- If the design spans many subsystems → "Which of these is substantial enough to warrant its own subdesign doc?"
- If no diagrams mentioned → "A sequence diagram or component diagram would help here — can you describe the happy path from request to response?"
- If integration points are unclear → "Where does this design plug into existing systems? What contracts does it inherit?"

**After this round you should know:** The overall shape of the design, whether decomposition into subdesigns is warranted, and the key integration points.

## Round 3: Alternatives Considered

**Goal:** Surface alternatives and the tradeoff analysis. This is the most important round.

**Questions:**
- "What other approaches did you consider?"
- "For each alternative, what were the key advantages and disadvantages?"
- "What was the deciding factor?"

**Follow-up triggers:**
- If only one alternative mentioned → "Was there a 'do nothing' or 'keep the current approach' baseline? What made that untenable?"
- If only one alternative mentioned → "Was there a simpler approach you considered and rejected?"
- If tradeoffs are thin → "What does the chosen approach make harder? What are you giving up?"
- If a rejected alternative seems strong → "What specifically ruled out [alternative]? Be concrete."
- If the user says "there were no alternatives" → "Was there a build-vs-buy choice? A phased vs. big-bang approach? A different technology that solves the same problem?"

**Push back if needed.** A design doc without meaningful alternatives is usually a signal that the work would be better served by an execution plan. If the user insists there are no alternatives, ask whether the warrant check (Step 1 of the skill) should be revisited.

**Don't push the user into manufacturing an alternative that was never real.** If probing genuinely turns up nothing else, accept that and document it honestly rather than settling for a strawman — an option nobody actually proposed, or a design nobody would defend — just to fill out the section.

**After this round you should know:** At least two alternatives with substantive tradeoffs, including why each rejected alternative was ruled out.

## Round 4: Dependencies & Risks

**Goal:** Understand what could go wrong and how we recover.

**Questions:**
- "What external systems does this depend on? New vendors, databases, message queues, internal services?"
- "What migration concerns exist — data, traffic, state?"
- "What's the rollback strategy if this doesn't work in production?"
- "What are the biggest risks? What keeps you up at night about this design?"

**Follow-up triggers:**
- If no risks mentioned → "Every design has risks. What's the worst realistic failure mode? Data loss? Silent incorrectness? Operational toil?"
- If rollback is "just revert" → "Can you actually revert if data has been written in the new shape? What's the rollback for stateful changes?"
- If migration is hand-waved → "How do existing records or existing traffic move to the new design? Is it big-bang, phased, or dual-write?"
- If a risk is identified → "How would we detect this in production before it becomes a customer-visible incident?"

**After this round you should know:** The specific dependencies, migration approach, rollback plan, and top 2-3 risks with mitigations.

## Round 5: Acceptance Criteria

**Goal:** Document how we verify the design is correctly implemented.

**Questions:**
- "How will we know the design is correctly implemented? What's observable or measurable?"
- "What metrics, dashboards, or tests confirm success?"
- "What would indicate the design is *not* working, even if all the code ships?"

**Follow-up triggers:**
- If criteria are vague → "Can you make that observable? 'Works well' → 'p99 latency under X ms.' 'Scales' → 'handles Y RPS sustained.'"
- If only positive criteria → "What's a failure signal — something we'd watch to know the design is degrading?"

**After this round you should know:** Specific, observable criteria that tell a future reader whether the design succeeded.

## ADR Candidate Detection

Flag a decision as an ADR candidate during the interview when it meets **any** of these triggers:

1. **Introduces a new architectural pattern** or changes how subsystems interact.
2. **Real alternatives with meaningful tradeoffs** that reasonable engineers would debate.
3. **Cross-cutting impact** across multiple services, teams, or bounded contexts.
4. **New external dependency** (vendor, database, message queue).
5. **Difficult or expensive to reverse** once deployed.
6. **The "why" behind the choice is non-obvious** — would need more than a sentence to explain.

For each candidate, capture:
- A one-line summary of the decision ("Use Kafka over SQS for the primary event stream")
- The trigger criteria it matched ("new external dependency; hard to reverse")

These flow into the DESIGN.md's ADR Candidates section. **Do not write the ADRs themselves** — the user can invoke `draft-adr` per candidate once the design is approved.

If a decision already has a real ADR (drafted in a prior pass, or referenced by the user), it isn't a candidate — record it under Related ADRs instead, linking to the actual file.

## When to Stop

Stop when you can answer:
1. What problem is this design solving, and under what constraints?
2. What is the proposed design at a high level?
3. What alternatives were considered, and why were they rejected?
4. What dependencies, risks, and rollback strategy apply?
5. How will we verify the design succeeded?

If you can answer all five, you have sufficient context to write the design doc.

## Minimum Viable Design Doc

If the user wants to move quickly, the absolute minimum for a useful design doc is:
- A clear statement of the problem and the proposed design
- At least one alternative considered (even "do nothing")
- At least one tradeoff articulated per alternative
- A stated rollback or recovery strategy
- At least one observable acceptance criterion

Below this threshold, the design doc isn't providing enough value to justify its existence — and it's often a signal that the warrant check should have sent the user to `create-plan` instead. Push the user to meet at least this bar, or exit the skill.
