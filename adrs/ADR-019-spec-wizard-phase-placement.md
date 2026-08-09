# ADR-019 — The Spec Wizard ships at the Phase 1→2 boundary, and its quarantine primitive ships in Phase 1

**Status:** Ratified
**Lock-in phase:** Phase 1 exit / Phase 2 entry
**Supersedes:** —

## Context

`docs/specs/14-spec-wizard.md` is assigned to the "Phase 0/1 boundary" by both its own title and
`11-dev-plan.md`. §14.7 gives the reason: it must ship "early enough to be usable for this project's
own subsequent-phase specification."

Phase 0 closed at `52fa9e6` without it. It appears in no Phase 1 tracking list, in
`SESSION_HANDOFF.md`, or in the §4.12 exit criteria. It is currently owed by a boundary that has
already passed and owned by nobody.

Three facts bear on where it actually belongs.

**Its dogfooding value is forward-looking.** The wizard exists to convert natural language into
reviewable specs for *subsequent* phases. Phase 1's specification already exists and has been amended
three times (ADR-017). The wizard cannot pay back its cost on a phase whose spec is already written.

**Its dependencies are orthogonal to the authorization slice.** §14.1 requires live web search and
§14.9 requires `switch_llm` thinking-tier routing. Neither touches the trust dial, authorization
cards, audit log, or quarantine. Folding it into Phase 1 enlarges the highest-priority safety slice
with network-dependent work that shares no substrate with it.

**But one piece of it is already Phase 1 work.** §14.10 defines the restricted-capability execution
shape — no bash, no file-edit, no arbitrary MCP — and `04a-prompt-injection.md` §4.9.1 states
explicitly that its structural quarantine is that shape "generalized". 04a is Phase 1. So the
primitive is owed in Phase 1 regardless of when the wizard ships.

## Decision

**Split at the primitive boundary, as ADR-017 split `deterministic_replay`.**

1. **Phase 1 owns the restricted-capability primitive.** The quarantined, tool-less, short-lived
   conversation shape required by 04a §4.9.1 is built in Phase 1, in the middleware, as a reusable
   component — not as wizard-specific code. It is covered by a contract test asserting that a
   conversation created through it cannot reach bash, file-edit, or non-search MCP, and that the
   attempt is denied rather than silently unavailable.

2. **The Spec Wizard itself ships at the Phase 1→2 boundary**, and its trigger is explicit rather
   than temporal: **no Phase 2 specification work begins until the wizard is usable.** This preserves
   §14.7's stated intent — the wizard exists to spec later phases — while keeping it out of the
   authorization slice.

3. **Phase 1 exit does not gate on the wizard.** §4.12's eleven criteria are unchanged. The wizard is
   a Phase 2 entry gate, not a Phase 1 exit gate.

4. §14.10's other half — a wizard-produced spec is an input artefact only and never an
   execution-privilege shortcut — is recorded now as a `PHASE` gate under ADR-018 owned by the
   Phase 1→2 boundary, so it cannot be lost between the two phases.

## Rationale

**Alternative A: pull the whole wizard into Phase 1.** Rejected. It adds a web-search dependency and
a second model tier to the slice the spec calls "highest priority", for a benefit that cannot be
realised on a spec that is already written. It also directly conflicts with air-gapped operation
(§14.8, §10), which the deployment profile makes the common case.

**Alternative B: defer it indefinitely to Phase 5 or later.** Rejected. §14.7 is a stated
requirement, not a preference, and deferring past Phase 2 destroys the only justification the spec
gives for building it at all. If the wizard never specs a phase, it should be cut outright — and
cutting it is not what the spec says.

The chosen split is the only option that satisfies 04a's Phase 1 dependency, honours §14.7's
dogfooding rationale, and keeps the authorization slice narrow. The trigger is a work-item dependency
("before Phase 2 spec work") rather than a date, which is enforceable.

## Consequences

- `docs/specs/14-spec-wizard.md` gains a placement amendment.
- `docs/specs/11-dev-plan.md`'s "Phase 0/Phase 1 boundary — Spec Wizard" section is re-anchored to
  the Phase 1→2 boundary and made a Phase 2 **entry** gate.
- `docs/specs/04a-prompt-injection.md` gains a note that the restricted-capability primitive is
  Phase 1 and shared, not wizard-private.
- Phase 1's remaining-work list gains the primitive; it does not gain the wizard.
- Two ADR-018 registry entries: the quarantine gates move to `PHASE(1)`, the wizard-bypass gate to
  `PHASE(1→2 boundary)`.

## Lock-in phase

Phase 1 for the primitive; Phase 1→2 boundary for the wizard.

## References

- `docs/specs/14-spec-wizard.md` §§14.1, 14.7, 14.8, 14.9, 14.10
- `docs/specs/04a-prompt-injection.md` §4.9.1
- `docs/specs/11-dev-plan.md`
- `adrs/ADR-017-phase-1-exit-criteria-resolution.md` (the layer-split precedent)
- `KNOWN_ISSUES.md` 2026-08-08 item 2
