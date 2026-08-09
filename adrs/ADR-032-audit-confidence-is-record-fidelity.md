# ADR-032 — Audit confidence is record fidelity, and an uncomputed tracker is not a clean one

**Status:** Ratified · conforms to ADR-020
**Lock-in phase:** Phase 1 · GUI authorization surface
**Supersedes:** —

## Context

ADR-008 requires every `MemoryPort` write to carry `provenance` and `confidence`. The
authorization audit log is the first surface in the GUI that writes decision records, so it is the
first place that contract has to mean something concrete rather than being satisfied by whatever
value typechecks.

Two things had no defined answer:

1. **What is `confidence` a confidence *in*?** The GUI has no model that scores authorization
   decisions, and inventing one would produce a number that looks like evidence and is not.
2. **What does the untrusted-content tracker's `null` become?** `GuiLocalUntrustedContentProvenance.thirdPartyUntrustedContextIds`
   is `null` when ancestry was not computed and `[]` when it was computed and found nothing. The
   audit write takes a provenance array, which has no third state.

Options considered for `confidence`:

- **A heuristic score** derived from security risk or action class. Rejected: it would be a made-up
  number occupying a field readers will interpret as measured.
- **Omit the field.** Rejected: ADR-008 requires it, and an absent field is indistinguishable from
  an unwritten one downstream.
- **A constant, with a documented meaning.** Chosen.

Options considered for the uncomputed tracker:

- **Write `[]`.** Rejected. `[]` already means "computed, found nothing". Reusing it for "did not
  look" makes the two indistinguishable at read time.
- **Refuse the write.** Rejected: it would drop real operator decisions from the record because a
  secondary tracker was unavailable.
- **Preserve the distinction in a field that has a third state.** Chosen.

## Decision

1. `confidence` in an authorization audit write is always `1`, and it denotes **the fidelity of the
   record, not a belief about the action**. An operator clicking Approve or Reject is directly
   observed, so the record is certain. This field is never a model score and must not be repurposed
   as one.
2. `provenance` always carries exactly one `first-party` reference for the operator decision itself,
   plus one `third-party-untrusted` reference per untrusted context id the tracker actually
   returned. A write is therefore never provenance-free.
3. When the tracker did not compute ancestry, **no untrusted references are added and the state is
   preserved in `guiLocal.actionClass`** as `gui-local-uncomputed`, distinct from
   `gui-local-clear`. Absence of untrusted references means "none recorded", never "none exist".

## Rationale

The failure this prevents is specific: flattening an uncomputed tracker into an empty array
promotes ignorance into a clean bill of health. A reviewer reading the log later would see an
action recorded as free of untrusted influence when in fact nothing checked. That is worse than
having no audit log, because it manufactures false assurance — and it is exactly the failure mode
zero-trust provenance exists to prevent.

Making `confidence` a documented constant is preferable to a plausible-looking heuristic for the
same reason. A constant with a stated meaning cannot be mistaken for evidence; a computed score
with no validation behind it can.

## Unresolved conflict with ADR-020 (read this before ratifying)

ADR-020 clause 3 is already ratified and says: an action with no traceable context items records
`provenance: null`, and `[]` means "traced, and there were none" — and that the two "must never be
conflated, and a contract test asserts they are distinguishable."

That is the same principle this ADR reaches independently, but ADR-020 puts the distinction in a
**nullable provenance field**, whereas the implementation as built makes `provenance` non-nullable
and carries the distinction in `actionClass`. The implementation therefore diverges from a ratified
ADR. This was not noticed when the audit-log module was written, and I did not notice it when
mounting the module — I drafted this ADR citing ADR-008 and ADR-015 from memory without opening
`adrs/`, and both citations were wrong. The rule that would have caught it is the project's own:
inspect before deciding.

Two ways out, for operator decision:

- **Conform to ADR-020 (preferred).** Make the audit write's `provenance` nullable, map an
  uncomputed tracker to `null`, a computed-empty tracker to `[]`, and found ids to items. Drops the
  always-present first-party operator item, since ADR-020's semantics already cover the three
  states. Requires changing `audit-log.ts`, `useAuthorizationAudit.ts`, and the module's existing
  contract tests.
- **Amend ADR-020.** Keep provenance non-nullable, arguing the operator decision is itself always a
  first-party provenance item so `null` is unreachable, and relocate the traced/untraced
  distinction to `actionClass` permanently. This is defensible but it rewrites a ratified decision
  to match code that was written without reading it, which is the wrong direction of travel.

Until this is resolved, clauses 2 and 3 of the Decision above are **provisional**. Clause 1
(`confidence` is record fidelity) does not conflict with ADR-020 and stands on its own.

## Consequences

- `useAuthorizationAudit` implements the convention; `untrustedProvenanceReferences` in
  `audit-log.ts` implements the provenance mapping.
- Gated by `audit-wiring.test.tsx`, including a test asserting the uncomputed and clear cases
  produce different `actionClass` values. Mutation-tested: flattening uncomputed to clean and
  dropping the first-party item both fail the suite.
- If a future surface needs a genuine confidence *score*, it must not overload this field. It needs
  a separate, named field and an ADR describing how the score is produced and validated.
- The Context Inspector (ADR-020) will supply richer provenance items; this mapping is the
  interim shape and is expected to extend, not be replaced.

## Lock-in phase

Phase 1, at the point the authorization audit log was mounted into the run surface
(2026-08-09 05:28 EDT).

## References

- `adrs/ADR-008-DozerDB-memory-port.md` (provenance + confidence write contract)
- `adrs/ADR-015-native-fidelity.md` (GUI-local values kept separate from SDK-native ones)
- `adrs/ADR-020` (Context Inspector, future provenance source)
- `apps/gui/src/features/audit-log/useAuthorizationAudit.ts`


---

## Resolution of the ADR-020 conflict (2026-08-09 05:52 EDT)

The draft put the traced/untraced distinction in `actionClass` against a non-nullable
`provenance`. **ADR-020 clause 3 had already ratified the opposite**: `null` = no traceable
context items, `[]` = traced and none, never conflated, with a contract test asserting they are
distinguishable. A ratified decision is not amended to match code written without reading it, so
the implementation was conformed to ADR-020:

- `AuthorizationAuditEntry.provenance` and `AuthorizationAuditWrite.provenance` are now
  `readonly AuditProvenanceReference[] | null`.
- `copyProvenance` preserves an explicit `null`; `undefined` and non-arrays still throw, so the
  caller must state which of the three states applies.
- `untrustedProvenanceReferences` returns `null` when the tracker never ran, instead of
  `[operatorDecision]` which asserted a completed trace.
- `AuditLogPanel` renders the untraced case distinctly from the traced-empty case.
- `actionClass` (`gui-local-uncomputed` / `gui-local-clear`) is retained as a display mirror, not
  as the authoritative distinction.

Clause 1 of this ADR — confidence is record fidelity, always `1`, never a model score — does not
conflict with ADR-020 and stands as ratified.

Mutation-tested: coercing `null` to `[]` in `copyProvenance`, and returning `[operatorDecision]`
for the uncomputed tracker, each turn the contract tests red.

### Citation errors in the original draft
This ADR was first drafted citing ADR-008 and ADR-015 from memory without opening `adrs/`. Both
were wrong: ADR-008 is *Phase 0 Baseline Metrics*, and the provenance decision is **ADR-020**. A
cheap gate asserting every `ADR-###` cross-reference resolves to a real file whose title matches
is filed in KNOWN_ISSUES.
