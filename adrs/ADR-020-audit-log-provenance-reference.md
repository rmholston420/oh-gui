# ADR-020 — The audit log records a resolvable provenance reference in Phase 1; the Context Inspector resolves it in Phase 5

**Status:** Ratified
**Lock-in phase:** Phase 1 (record); Phase 5 (resolution)
**Supersedes:** —

## Context

`04-authorization.md` §4.2.1 requires the authorization audit log to "cross-link to the Context
Inspector's per-item provenance data". The audit log is a Phase 1 deliverable. The Context Inspector
is specified in `10-mission-control.md` and assigned to **Phase 5** by `11-dev-plan.md`.

Taken literally, a Phase 1 exit criterion depends on a Phase 5 surface — the same defect ADR-017
found three times in the same exit-criteria set.

The naive resolutions are both wrong.

**Shipping a dead link** violates the ADR-018 inert-control rule and Principle 8: a cross-link that
resolves to nothing is a display artefact asserting a guarantee it does not provide.

**Deferring the whole clause to Phase 5** loses the part that is genuinely irrecoverable later. The
audit log's value is that it is written **at decision time**, and provenance is a property of the
moment the decision was made. A Phase 5 Context Inspector cannot reconstruct which context items
justified an action that was rejected in Phase 1 and therefore never executed. If the reference is
not captured when the card is answered, it does not exist to be resolved.

## Decision

**Split at the layer boundary.**

1. **Phase 1 captures the reference.** Every audit-log record — approval, rejection-with-reason, and
   relax-for-this-class — carries a `provenance` array. Each element records the context item's
   stable identifier, its trust class (`first-party` / `workspace-derived` /
   `third-party-untrusted`, per 04a §4.9), and its source. The identifier must be the one the Context
   Inspector will later key on, so no migration is required in Phase 5.

2. **The reference is captured at decision time**, from the state in force when the card was raised —
   consistent with §4.1's pending-action policy lock. It is not recomputed at read time.

3. **A missing signal renders `null`, never a manufactured default** (ADR-015). An action with no
   traceable context items records `provenance: null`. An empty array means "traced, and there were
   none". These must never be conflated, and a contract test asserts they are distinguishable.

4. **Phase 1 ships no cross-link UI.** The audit log displays the trust class and source inline —
   which is native, present, and useful on its own — and does not render a link to a surface that
   does not exist.

5. **Phase 5 owns resolution.** The Context Inspector resolves the recorded identifiers into
   navigable cross-links. This is added to Phase 5's scope in `11-dev-plan.md`, so it is inherited
   rather than rediscovered.

6. **Provenance is zero-trust.** Consistent with the memory-write discipline used across this
   operator's projects, a provenance element without both a source and a trust class is rejected at
   the schema layer rather than stored with a blank field.

## Rationale

The Phase 1 half is not deferrable because the data is destructible: rejected actions leave no
execution trace, so their justifying context is only ever observable at decision time. The Phase 5
half is not advanceable because the resolving surface is a Phase 5 deliverable with its own exit
criteria.

**Alternative considered: pull the Context Inspector forward into Phase 1.** Rejected. It is a large
Phase 5 surface (prompt, system instructions, repo instructions, active skills, selected files,
retrieved code, MCP outputs, history, condensed summaries, persistent memory — each with token cost
and egress status), and none of it is required for the authorization slice to be safe.

**Alternative considered: record a free-text provenance string in Phase 1 and structure it later.**
Rejected. It guarantees a Phase 5 migration over records that cannot be re-derived, and it defeats
the zero-trust schema check.

## Consequences

- `docs/specs/04-authorization.md` §4.2.1 gains an amendment recording the split.
- `docs/specs/11-dev-plan.md` Phase 5 gains the resolution half explicitly.
- Phase 1's audit-log work item gains the `provenance` schema and its three contract tests
  (null vs empty, capture-at-decision-time, zero-trust rejection).
- ADR-018 registry: the §4.2.1 cross-link gate becomes `PHASE(5)`; a new record-side gate becomes
  `PHASE(1)`.
- The `04a` quarantine audit requirement (every quarantine invocation logged with source and trust
  class) writes into this same `provenance` shape rather than a parallel one.

## Lock-in phase

Phase 1 for the record and its schema; Phase 5 for the Context Inspector resolution.

## References

- `docs/specs/04-authorization.md` §4.2.1
- `docs/specs/04a-prompt-injection.md` §4.9, §4.9.1
- `docs/specs/10-mission-control.md`
- `adrs/ADR-015-native-fidelity-boundary.md` (null over manufactured default)
- `adrs/ADR-017-phase-1-exit-criteria-resolution.md` (the layer-split precedent)
- `KNOWN_ISSUES.md` 2026-08-08 item 9
