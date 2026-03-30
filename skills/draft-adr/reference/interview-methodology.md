# ADR Interview Methodology

Protocol for gathering decision context when the `draft-adr` skill is invoked standalone (not from `create-plan`).

## Interview Principles

- Keep it focused: ADRs are about a single decision, so the interview is shorter than a plan interview
- Push for alternatives and tradeoffs — this is the core value of an ADR
- Adapt based on answers; skip rounds where context is already clear
- The user may end the interview early — proceed with what you have

## Round 1: Context & Decision

**Goal:** Understand what was decided and why.

**Questions:**
- "What architectural decision are you documenting?"
- "What situation or problem prompted this decision?"
- "What did you decide?"

**Follow-up triggers:**
- If the problem is vague → "Can you describe a specific scenario where this became a problem?"
- If the decision is unclear → "Can you state the decision as 'We will...'?"
- If there's existing code → "How does this differ from the current approach?"

**After this round you should know:** What was decided, and the basic motivation.

## Round 2: Alternatives & Tradeoffs

**Goal:** Surface the alternatives that were considered and the tradeoff analysis.

**Questions:**
- "What alternatives did you consider?"
- "For each alternative, what were the key advantages and disadvantages?"
- "What was the deciding factor that made you choose this approach?"

**Follow-up triggers:**
- If only one alternative mentioned → "Was there a simpler approach you considered and rejected? Even a 'do nothing' option?"
- If tradeoffs are thin → "What does this decision make harder? What are you giving up?"
- If a rejected alternative seems strong → "What specifically made you rule out [alternative]?"

**After this round you should know:** At least two alternatives with substantive tradeoffs.

**Push back if needed:** An ADR without meaningful tradeoff analysis has limited value. If the user says "there were no alternatives," probe: "Was there a build-vs-buy choice? A phased vs. big-bang approach? A different technology that could solve the same problem?"

## Round 3: Consequences

**Goal:** Document what changes as a result of this decision.

**Questions:**
- "What changes as a result of this decision?"
- "What becomes easier or newly possible?"
- "What becomes harder or more constrained?"
- "Are there follow-on decisions this creates?"

**Follow-up triggers:**
- If consequences are vague → "Which specific teams, services, or systems are affected?"
- If only positive consequences → "What's the cost? What technical debt does this introduce?"
- If follow-on work mentioned → "Should any of those follow-on decisions be their own ADRs?"

**After this round you should know:** Both positive and negative consequences, and any downstream effects.

## When to Stop

Stop when you can answer:
1. Why was this decision needed?
2. What was decided?
3. What alternatives were considered and why were they rejected?
4. What do we gain and what do we give up?
5. What changes as a result?

If you can answer all five, you have sufficient context to write the ADR.

## Minimum Viable ADR

If the user wants to move quickly, the absolute minimum for a useful ADR is:
- A clear statement of the decision
- At least one alternative considered (even "do nothing")
- At least one tradeoff articulated
- At least one consequence documented

Below this threshold, the ADR isn't providing enough value to justify its existence. Push the user to meet at least this bar.