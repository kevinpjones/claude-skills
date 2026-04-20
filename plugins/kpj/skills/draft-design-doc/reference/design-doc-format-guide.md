# Design Doc Format Guide

Detailed guidance for writing each section of a DESIGN.md. For the file template, see `../templates/design-template.md`.

## Purpose of Design Docs

Design docs capture **higher-order system design** — the "what" and "why" of a system's architecture before or during implementation. They describe the target state: how the system is shaped, how data flows, what the contracts look like, and *why the architecture is structured this way*.

Design docs are more durable than execution plans (which focus on *how work is carried out*) but less atomic than ADRs (which capture individual decisions). See `./when-to-write-design-doc.md` for how to decide which artifact fits.

## Progressive Disclosure

Each design is a **subdirectory**, not a single file, so it can grow naturally without restructuring. A simple design might only need `DESIGN.md`. A complex one accumulates `subdesigns/` and `references/` as it grows.

**No design doc should become a monolith.** When `DESIGN.md` approaches ~500 lines, decompose into subdesigns. The test: can a reader find what they need within the first screenful of content, or a clearly labeled link to it?

## Writing Each Section

### Context

**Answers:** Why did we need to design this?

Include:
- The problem being solved (deprecation, scale pressure, new requirement, compliance)
- Relevant constraints — technical, organizational, timeline
- Prior decisions or existing patterns that frame this design

Write in past or present tense. Give enough background that a reader unfamiliar with the initiative can understand why the design work was needed.

**Good context:**
> Our event processing service currently handles incoming webhook payloads synchronously in the API request path. As upstream volume has grown, p99 latency for the ingestion endpoint has exceeded our 2s SLO by a factor of 4. A scheduled deprecation of the current queue library in Q4 2026 forces a broader rework, creating an opportunity to move event processing to an async pipeline.

**Bad context:**
> Ingestion is slow. We need to fix it.

### Design Overview

**Answers:** What is the proposed architecture, and how does it work?

This is the meat of the design doc. It should cover:
- **High-level architecture** — a diagram or prose description of the major components
- **Data flow** — how requests, events, or data move through the system
- **API contracts** — signatures, request/response shapes, event schemas
- **Schema changes** — new tables, columns, indexes, or migrations
- **Integration points** — where this design connects to existing systems

**Use diagrams liberally.** Mermaid `sequenceDiagram` and `graph` blocks are native to markdown and render in most tooling. One diagram saves many paragraphs.

**For designs with subdesigns:** Summarize the overall shape here in 2-3 paragraphs and link to each subdesign for deep detail. Do not duplicate subdesign content in the overview.

**Example structure for a complex design:**

```markdown
## Design Overview

The event processing pipeline v2 splits ingestion into three subsystems that
communicate via an internal event stream:

- **Intake & Validation** — Accepts inbound payloads, validates schema, and
  emits normalized events. See [subdesigns/intake-and-validation.md](subdesigns/intake-and-validation.md).
- **Transformation** — Consumes normalized events, applies enrichment, and
  produces output records. See [subdesigns/transformation.md](subdesigns/transformation.md).
- **Delivery** — Routes output records to downstream consumers and handles
  retries. See [subdesigns/delivery.md](subdesigns/delivery.md).

[high-level Mermaid diagram here]
```

### Alternatives Considered

**Answers:** What other approaches did we consider, and why did we reject them?

This section is where a design doc earns its keep. It exists so future engineers and agents understand the **decision landscape**, not just the outcome.

Use `### ` subheadings per alternative. The chosen alternative is marked `(chosen)`. Rejected alternatives have a `**Why rejected:**` line.

**Structure:**

```markdown
### Async event pipeline with Kafka (chosen)

**Gains:**
- Decouples event processing from API request path, removing latency
- Enables retry semantics natively via consumer groups
- Aligns with existing event infrastructure used by other services

**Gives up:**
- Operational complexity of running Kafka (new for the team owning this service)
- Eventually-consistent — downstream consumers see events slightly after they're ingested

### Async pipeline with SQS

**Gains:**
- Simpler operational model (managed AWS service)
- Team already uses SQS in other services

**Gives up:**
- No native ordering guarantees at scale (FIFO queues have throughput limits)
- Replay semantics are harder than Kafka

**Why rejected:** Throughput projections for peak traffic windows exceed SQS FIFO limits by ~2x. Standard SQS would meet throughput but break per-tenant ordering invariants.

### Keep synchronous with caching layer

**Gains:**
- No architecture change
- Simplest to implement

**Gives up:**
- Doesn't address the root cause (processing is CPU-bound, not IO-bound)
- Adds cache invalidation complexity without meaningful latency improvement

**Why rejected:** Profiling shows 80% of latency comes from schema validation and payload serialization — neither benefits from caching at the event level.
```

**Common pitfalls:**
- Listing only the gains of the chosen option
- Dismissing alternatives without genuine analysis
- Treating alternatives as a formality ("there were no real alternatives")
- Being vague: "it's better" — better *how*, at what cost?

**Push back if the user gives a thin alternatives section.** A design doc without meaningful alternatives is usually a signal that an execution plan would have been sufficient.

### Dependencies & Risks

**Answers:** What external factors could break this, and how do we recover?

Cover:
- **External systems** — vendors, services, or infrastructure this design depends on
- **Migration concerns** — how existing data, traffic, or state is moved to the new design
- **Rollback strategy** — what we do if the design doesn't work in production
- **Known risks** — specific scenarios that could go wrong, ranked by likelihood and blast radius

**Good risks section:**
> - **Risk:** Kafka consumer lag during scheduled traffic spikes. **Mitigation:** Pre-scale consumer group before known peak windows; alert on lag exceeding a 5 min threshold.
> - **Risk:** Per-tenant ordering violated during broker failover. **Mitigation:** Use keyed partitioning by tenant ID so a single partition carries all of a tenant's events.
> - **Rollback:** Feature-flag routes event processing between the new async path and the legacy sync path. Rollback is a flag flip; already-processed events remain in their terminal state.

### Acceptance Criteria

**Answers:** How do we know the design is correctly implemented?

List observable, verifiable criteria. Avoid vague language like "the system works well." Be specific.

**Good criteria:**
> - p99 latency for the ingestion endpoint drops below 500ms
> - Per-tenant event ordering is preserved across all processing operations
> - All existing integration tests pass against the new pipeline
> - Dashboards show zero dropped events over a 7-day soak test
> - Runbook for peak-window scaling is written and validated by on-call

### ADR Candidates (Optional)

If the skill identified architectural decisions during the interview that warrant their own ADR, list them here. Each entry includes:
- A one-line summary of the decision
- The trigger criteria it matched

**Example:**

```markdown
## ADR Candidates

Architectural decisions identified during design that warrant their own Architecture Decision Record. Each will be drafted separately via the `draft-adr` skill.

- **Use Kafka over SQS for the primary event stream.** Trigger: new external dependency with meaningful tradeoffs; hard to reverse.
- **Keyed partitioning by tenant ID.** Trigger: non-obvious choice with cross-cutting impact on consumer design.
- **Event schema versioning via schema registry vs. embedded version field.** Trigger: real alternatives with meaningful tradeoffs.
```

Omit this section entirely if no candidates were identified.

## Tone and Style

- **Be direct.** State facts and reasoning, not feelings.
- **Be honest about costs.** Every design has downsides. Name them in Alternatives Considered and Dependencies & Risks.
- **Write for the future reader.** Someone will read this in a year wondering "why is this shaped this way?" Make sure they can find the answer.
- **Use diagrams.** Mermaid blocks render in GitHub, most IDEs, and Claude Code itself. Prefer them to ASCII art or prose-only descriptions.
- **Avoid jargon without context.** If a term is domain-specific, briefly define it or link to a reference.
- **Keep Design Overview focused.** If it grows past ~500 lines, decompose into subdesigns.

## Tense and Voice

- **Context:** Past or present tense (describing the situation).
- **Design Overview:** Present tense, as if describing the target state.
- **Alternatives Considered:** Past tense for the evaluation, present tense for the tradeoffs.
- **Dependencies & Risks:** Present/future tense.
- **Acceptance Criteria:** Observable future tense ("p99 latency drops below...").

Use **we** for decisions ("We chose Kafka because...") to make ownership clear.