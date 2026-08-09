# ADR-027 — OpenHands is the harness; our middleware is its residue

**Status:** Ratified
**Lock-in phase:** Phase 1 (cross-cutting; binds every later allocation)
**Supersedes:** — (amends ADR-026 tier 5 terminology)

## Context

ADR-026 named its lowest-preference tier **"Harness (`services/middleware/`)"**. Three donor
specs of record independently contradict that noun.

1. `docs/donor-specs/forge-oh/10-modular-plug-and-play-stack.md:62` — "OpenHands itself is best
   understood as a harness: its Skills, Plugins, Hooks, and MCP configuration are the harness's
   own plug-and-play seams, letting you compose capability without forking core logic."
2. `docs/donor-specs/forge-oh/01-integrated-design-and-development-spec.md:35` — "OpenHands
   remains the unmodified agent core. All customization happens through its own extension
   surfaces — Skills, Plugins, Hooks, and MCP server declarations — which function as a
   hexagonal-architecture boundary."
3. `docs/donor-specs/forge-oh/08-ideal-aca-v8.md:54` — a production harness has five layers:
   execution runtime, context system, capability surface, governance, and surface/protocol
   adapters.

Measured against that five-layer definition, OpenHands 1.41.0 supplies four of the five outright:
execution runtime (`sdk/conversation/`, event store, checkpointing), context system
(`sdk/context/` — condenser pipeline, prompt sections, views), capability surface (`tools/`,
`skills/`, `subagent/`, MCP), and governance (`hooks/`, `sdk/security/`, `sdk/critic/`).

The naming error is not cosmetic. Calling our middleware "the harness" licenses building a second
harness inside the first, which is precisely the failure that ended Forge-OH: inventing contracts
alongside the ones OpenHands already provides. A tier named for a thing we do not own is an
invitation to reimplement it.

## Decision

1. **OpenHands is the agent harness.** OH-GUI does not build, wrap, or replace a harness. ADR-026
   tier 5 is renamed **"Middleware (harness residue)"**. The allocation rule is unchanged — lowest
   tier that can carry the capability, middleware last.
2. **OH-GUI's own contribution is the surface/protocol adapter layer**, the fifth of the five, plus
   whatever narrow residue of the governance and context layers OpenHands demonstrably leaves
   unfilled.
3. **Native-first is now a burden of proof, not a preference.** Any capability allocated to
   middleware must first record a cited finding that no native OpenHands surface carries it. The
   citation is a `review/_sdk_src/<version>/...:<line>` path, already enforced to resolve at the
   cited line by `cited_evidence_paths_resolve` (ADR-026 D5.4).
4. **Second harnesses are refused.** Any component whose own purpose is to run a plan-act-observe
   loop, own tool dispatch, or orchestrate agent turns is rejected on sight, whatever its merits in
   isolation. This covers LangGraph, CrewAI, and AutoGen, and it is the same conclusion the
   Council-Synthesis reached from the opposite direction: "Do NOT build … a custom plan-and-execute
   harness (Axis 3.1)" (`05-improvements-model-council-synthesis.md:122`).

## Rationale

**Alternative A — leave the name alone, rely on the allocation rule.** ADR-026 D3 already prefers
the lowest tier, so the behaviour is arguably already correct. Rejected: the rule is consulted when
someone remembers to consult it, whereas the tier name is read every time the document is opened.
The Forge-OH post-mortem is specifically that plausible-sounding local reasoning drifted away from
upstream contracts over many iterations. A name that misdescribes ownership is a standing invitation
to that drift.

**Alternative B — rename, and stop there.** Rejected as a half-measure for the same reason clause 3
exists: ADR-015's history is that prose classifications decay unless something executable holds
them. A renamed tier with no evidentiary burden is a renamed tier that still accumulates
middleware.

**Alternative C — declare OH-GUI a harness in its own right and treat OpenHands as one component.**
Rejected against the operator's standing constraint: "we do not want to modify OpenHands, we want to
build on top of it." Owning the harness role means owning the loop, which means either forking or
reimplementing. Both are out of scope by ADR-026 D1.

## Consequences

- `adrs/ADR-026-*.md` tier-5 rows and the §Tier 5 heading are retitled; allocations are untouched.
- `PORTING_LEDGER.md` gains three REJECTED entries — LangGraph, CrewAI, AutoGen — citing clause 4.
- `docs/specs/16-stack-layers.md` records a status for every candidate component and cites this ADR
  for the rejections.
- Clause 3's burden of proof is discharged per-capability in the spec that allocates it. It is not
  separately gated by a new static check: a check that only greps for the presence of a citation
  would be satisfied by a wrong citation, and `cited_evidence_paths_resolve` already prevents a
  citation that points nowhere. The remaining risk — a citation that resolves but does not support
  the claim — is a review burden, and recording that honestly is better than a gate that implies
  more assurance than it delivers.

## Lock-in phase

Phase 1. Binding on every allocation from this point; prior allocations stand unless an ADR revisits
them.

## References

- `adrs/ADR-026-extension-only-posture-and-capability-allocation.md` (tiers, D1, D3, D5.4)
- `adrs/ADR-015-native-fidelity-boundary.md` (verification burden, PRESENT-BUT-UNCONSUMED)
- `docs/donor-specs/forge-oh/{01,05,08,10}-*.md` as cited above
- `docs/specs/16-stack-layers.md`
