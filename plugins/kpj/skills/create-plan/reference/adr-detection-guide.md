# ADR Detection Guide

How to identify Architecture Decision Record candidates during execution plan interviews, and how to distinguish them from plan-level decisions.

## ADR Trigger Criteria

Flag a decision as an ADR candidate when it matches **any** of the following:

### 1. New Architectural Pattern
The decision introduces a new pattern or changes how existing subsystems interact. Examples:
- Adopting event sourcing for a domain that previously used CRUD
- Switching from synchronous API calls to an async message queue
- Introducing a new layer (e.g., repository pattern, saga orchestrator)

### 2. Meaningful Alternatives with Real Tradeoffs
Reasonable engineers would disagree about the approach. There are at least two viable options with non-trivial tradeoffs. Examples:
- Choosing between Stripe and Orb for billing
- REST vs. gRPC for a new internal service boundary
- Monorepo vs. multi-repo for a new platform component

### 3. Cross-Cutting Impact
The decision affects multiple services, teams, or bounded contexts. Examples:
- A shared authentication scheme across services
- A new logging/observability standard
- A change to the deployment pipeline that all services must adopt

### 4. New External Dependency
A new vendor, database, message queue, or other external system is being introduced. Examples:
- Adding Redis for caching where none existed
- Adopting a new third-party API (payment provider, email service)
- Introducing a new database engine alongside the existing one

### 5. Difficult or Expensive to Reverse
The decision, once deployed, would be costly to undo. Examples:
- Database schema changes that require data migration
- Public API contracts consumed by external clients
- Data format or serialization choices in persistent storage

### 6. Non-Obvious Rationale
The "why" behind the choice requires more than a sentence to explain. If someone would look at the code and ask "why did we do it this way?" — that's an ADR. Examples:
- Choosing a less performant approach for operational simplicity
- Deliberately not using a framework feature due to a known issue
- Accepting technical debt in one area to preserve velocity in another

## What is NOT an ADR

Keep these in the plan's **Decision Log** instead:

- **Plan-level sequencing decisions** — "We moved Phase 3 before Phase 2 because of a dependency." These are about execution order, not architecture.
- **Scope adjustments** — "We descoped the backfill and will handle it in a follow-up plan." These are project management decisions.
- **Tactical implementation choices** — "We'll use a feature flag to control rollout." Unless the feature flag system itself is new, this is a tactical choice.
- **Obvious technical choices** — Using the existing ORM for a new table, following the established test pattern for a new service. If the codebase already has a clear precedent, no ADR is needed.

## The Key Test

Ask: **"Does this decision need to survive independently of this plan?"**

- If the plan is completed, archived, or rewritten — would someone still need to know *why this specific architectural choice was made*?
- If yes → ADR candidate.
- If no → Decision Log entry.

ADRs are the extracted, individually-addressable atoms of architectural reasoning. They should survive even if the plan that produced them is rewritten or superseded.

## During the Interview

When you detect an ADR candidate:

1. Note it in the `PLAN.md` ADR Candidates table with:
   - A short name (e.g., `use-orb-for-billing`)
   - A one-line summary of the decision
   - Which trigger criterion it matched
2. If the user has provided enough context about the decision (alternatives considered, tradeoffs, rationale), capture those notes — they will feed into the `draft-adr` skill later.
3. If context is insufficient, add a follow-up question to explore the decision space: "You mentioned choosing X over Y — can you tell me more about what drove that choice and what tradeoffs you considered?"