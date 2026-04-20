# Interview Methodology

Detailed protocol for the iterative user interview process during execution plan creation.

## Interview Principles

- Ask 1-3 questions per round to avoid overwhelming the user
- Prioritize questions that fill the largest knowledge gaps
- Use information from codebase analysis to ask informed, specific questions
- Adapt questions based on previous answers — don't ask about things already covered
- Track progress with a task list so you don't lose track across rounds

## Question Bank by Category

### 1. Goal & Motivation Questions

Start here — these establish the foundation for all other questions.

**Core questions:**
- "What specific outcome are you trying to achieve?"
- "What problem does this solve, or what opportunity does it unlock?"
- "Who benefits from this work and how?"
- "What happens if we don't do this?"

**Follow-up triggers:**
- If user mentions multiple goals → "Which goal is the primary driver?"
- If user mentions a deadline → "What's driving the timeline?"
- If motivation is unclear → "What prompted this initiative now?"

### 2. Scope & Boundaries Questions

Ask these after the goal is clear — they prevent scope creep during execution.

**Core questions:**
- "What is explicitly in scope for this plan?"
- "What is explicitly out of scope or deferred?"
- "Are there adjacent systems that will be affected but not changed?"
- "Are there dependencies on other teams, services, or initiatives?"

**Follow-up triggers:**
- If scope seems large → "Can we identify a minimal first phase that delivers value?"
- If user mentions other teams → "What coordination is needed? Who are the contacts?"
- If boundaries are fuzzy → "If we had to cut scope, what would be the first thing to drop?"

### 3. Technical Approach Questions

Ask these when scope is defined — they shape the phases.

**Core questions:**
- "Do you have a preferred technical approach, or should we explore options?"
- "Are there existing patterns in the codebase we should follow or break from?"
- "What are the key technical decisions that need to be made?"
- "Are there migration or backwards-compatibility concerns?"

**Follow-up triggers:**
- If user mentions migration → "What's the rollback strategy if something goes wrong?"
- If user mentions new patterns → "Should this be documented as a design doc or ADR?"
- If user is uncertain → "What would a spike or proof-of-concept look like?"

### 4. Phasing & Sequencing Questions

Ask these to structure the work into executable chunks.

**Core questions:**
- "How would you naturally break this work into phases?"
- "What must be done first before anything else can proceed?"
- "Are there phases that could run in parallel?"
- "What's the smallest increment that delivers visible progress?"

**Follow-up triggers:**
- If user suggests many phases → "Which phases have hard dependencies on each other?"
- If phasing is unclear → "What would you want to see working after the first week of effort?"
- If phases are large → "Can this phase be broken into smaller milestones?"

### 5. Risks & Mitigations Questions

Ask these to surface concerns early.

**Core questions:**
- "What are the biggest risks to this initiative succeeding?"
- "Are there areas of the codebase or system that are fragile or poorly understood?"
- "What's the rollback plan if a phase goes wrong?"
- "Are there performance, security, or compliance considerations?"

**Follow-up triggers:**
- If user mentions fragile systems → "Should we add a hardening or audit phase first?"
- If user mentions compliance → "Are there specific compliance requirements to document?"
- If risks seem high → "Should we plan a spike or proof-of-concept phase before committing?"

### 6. Success Criteria Questions

Ask these to define the finish line.

**Core questions:**
- "How will you know this initiative is complete and successful?"
- "Are there measurable metrics or KPIs we should track?"
- "What does 'done' look like for each phase?"
- "Who needs to sign off on completion?"

**Follow-up triggers:**
- If criteria are vague → "Can we define a specific acceptance test or checklist?"
- If user mentions metrics → "Where are these metrics tracked? What are the baselines?"
- If sign-off is needed → "Should approval gates be built into the phase structure?"

## Interview Loop Protocol

```
FOR each question category (in priority order):

  1. PLAN: Select 1-3 most critical questions from the category
     - Skip questions already answered by codebase analysis
     - Skip questions answered in previous rounds
     - Prioritize questions that unlock follow-up insights

  2. ASK: Present questions using AskUserQuestion tool
     - Frame questions clearly and specifically
     - Reference what you already know to show context
     - Allow the user to provide free-form responses

  3. PROCESS: After receiving the response:
     a. Extract goals, constraints, technical decisions, risks, and phasing info
     b. Identify which plan sections need updating
     c. Note any follow-up questions triggered by the response

  4. UPDATE: Write updates to the plan files
     - PLAN.md — Goal, Phases, Open Questions sections
     - PROGRESS.md — Active Context section

  5. ASSESS: Check if the category is sufficiently covered
     - If gaps remain, loop back to step 1 with follow-up questions
     - If covered, move to the next category

  6. EXIT: The user may request to end the interview at any time
     - Proceed to Context Sufficiency Assessment
     - Document any remaining gaps as Open Questions
```

## Adapting to Initiative Type

### For Greenfield Initiatives (new system or feature)
- Spend more time on Goal & Motivation and Technical Approach
- Phasing questions focus on incremental delivery
- Risks focus on unknowns and proof-of-concept needs

### For Migrations
- Spend more time on Scope & Boundaries and Risks
- Technical Approach focuses on backwards compatibility and rollback
- Phasing questions focus on zero-downtime sequencing

### For Refactoring / Tech Debt
- Spend more time on Technical Approach and Success Criteria
- Scope questions focus on what NOT to touch
- Risks focus on regression and test coverage

### For Cross-Team Initiatives
- Spend more time on Scope & Boundaries (team responsibilities)
- Phasing questions focus on coordination points and handoffs
- Risks focus on dependencies and communication

## When to Stop Interviewing

Stop when you can confidently answer:
1. What are we doing and why?
2. What's in scope and what's not?
3. How should the work be phased and sequenced?
4. What are the key risks and how do we mitigate them?
5. How do we know when we're done?

If you can answer all five, you have sufficient context to generate the plan.
