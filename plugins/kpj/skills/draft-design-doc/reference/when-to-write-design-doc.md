# When to Write a Design Doc

Not every piece of work needs a design doc. Many initiatives are well-served by an execution plan alone. This guide helps you decide whether to invest the effort of writing a design doc — or whether a plan (or neither) is the right artifact.

A thin or unnecessary design doc has negative value: it dilutes the signal of design docs that *do* matter, and it creates maintenance burden without corresponding insight.

## When an Execution Plan Is Sufficient

Use an execution plan (via `create-plan`) and skip the design doc when:

- **The work follows existing patterns and conventions.** If you're adding a new endpoint that looks like the ten endpoints before it, there's no architectural novelty to document.
- **Scope is contained to a single service or module** with no cross-cutting concerns.
- **There are no meaningful alternatives to evaluate.** If the implementation approach is obvious and uncontested, the Alternatives Considered section would be empty or contrived.
- **Changes are reversible without significant cost.** If you can roll back with a revert commit, the stakes don't justify a design doc.

## When a Design Doc Is Warranted

Write a design doc when any of the following hold:

- **Introduces a new architectural pattern** or changes how existing subsystems interact. If the way data flows through the system is changing, that's a design.
- **Real alternatives exist with meaningful tradeoffs.** If reasonable engineers would disagree about the approach, the decision landscape should be documented.
- **Cross-cutting impact** — the change affects multiple services, teams, or bounded contexts.
- **New external dependencies** (a new vendor, a new database, a new message queue) where integration design matters.
- **Difficult or expensive to reverse** once deployed. High-stakes changes deserve upfront design thinking.
- **Non-obvious architectural choice.** If someone asks "why did we build it this way?" and the answer would take more than a sentence, it's worth a design doc.

## The Key Distinction

- **Execution plans** document *what* you're going to do and *how*.
- **Design docs** document *why the system should be shaped this way*.

If the "why" is obvious or unchanged, skip the design doc and let the execution plan carry the work.

## Warrant Check Questions

When the skill runs standalone, ask these in the warrant check:

1. Does this introduce a new architectural pattern or change how existing subsystems interact?
2. Are there real alternatives with meaningful tradeoffs that reasonable engineers would debate?
3. Does this change affect multiple services, teams, or bounded contexts?
4. Does this introduce a new external dependency (vendor, database, message queue)?
5. Would this be difficult or expensive to reverse once deployed?
6. Would explaining "why we built it this way" take more than a sentence?

**If none → suggest `create-plan` and exit.**

**If one or more → proceed with the design doc.**

## When In Doubt

Start with an execution plan. If you find yourself writing extensive justifications for architectural choices in the plan's decision log or reference material, that's the signal to extract a design doc. Design docs should emerge from genuine need, not from a ceremony.

## Relationship to ADRs

Design docs and ADRs are complementary, not competing.

- A **design doc** describes a system's shape — holistic: how pieces fit together, how data flows, what the API contracts look like, why the architecture is structured this way. It answers "how does this subsystem work and why is it shaped this way?"
- An **ADR** captures a single decision — atomic: we faced choice X, we picked option A over B and C, and here's why. It answers "why did we choose this specific thing over the alternatives?"

In practice, a design doc often **spawns multiple ADRs** as individual architectural choices are made during the design process. This skill flags ADR candidates in the `ADR Candidates` section of DESIGN.md — the user can invoke `draft-adr` for each candidate separately.

**The practical test:**
- Interesting part is *the choice between alternatives* and someone might reasonably revisit it later → ADR
- Interesting part is *how a system is structured* and someone needs to understand the architecture to work in it → design doc
- Often you need both.

**Durability is different.** ADRs are permanent records — never deleted, only superseded. Design docs can evolve as the system changes. A design doc from two years ago might be substantially rewritten; the ADRs it spawned still stand unless explicitly superseded. Think of ADRs as the *extracted, individually-addressable atoms* of architectural reasoning that survive even if the design doc gets rewritten.