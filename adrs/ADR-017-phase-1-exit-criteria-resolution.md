# ADR-017 — Three ambiguities in the Phase 1 exit criteria, resolved before any of them can be built to

**Status:** Ratified
**Lock-in phase:** Phase 1 (Authorization slice)
**Supersedes:** —

## Context

The Phase 1 exit criteria are cumulative across three files (`11-dev-plan.md` Phase 1). Reading
all three together before writing middleware code surfaced three items that cannot be built to as
written. Each is recorded here rather than resolved silently in code, because each changes what
"Phase 1 is done" means.

**(a) `deterministic_replay` is scoped to a Phase 3 surface.** `08-telemetry.md` §8.6 makes
"`deterministic_replay` field is present and correctly read by the rewind/fork UI" a Phase 1 exit
criterion. The rewind/fork UI is specified in `05-plan-model.md`, which `11-dev-plan.md` assigns to
**Phase 3** and which is **not** in Phase 1's file list. Taken literally, Phase 1 cannot exit
without a Phase 3 deliverable.

**(b) §6.4.2 ships in Phase 1 but its only assertion is a Phase 2 exit criterion.**
`06-change-review.md` §6.5 says "sections 6.4.1 and 6.4.2 ship in Phase 1", and §6.4.2 is the
seven-pattern vibe-coding security checklist. The only executable assertion over it — "security
checklist correctly flags each of the seven patterns in a synthetic fixture" — appears under
**Phase 2 exit criteria**. So the control ships one phase before anything proves it works.

**(c) The Vibe/Pro lens split does not exist.** Every Phase 1 criterion is gated on "demonstrable
in both Vibe and Pro lenses (Principle 11)". A scan of the frontend at `52fa9e6`
(`grep -rn "Vibe\|Pro lens\|lens" apps/gui/src apps/gui/e2e`) returns **zero matches**. The lens
system is specified in `03-layout.md`, a Phase 0 file, but was not built — Phase 0 shipped the
first-run wizard only. The qualifier that gates all eleven criteria has no substrate.

## Decision

**(a) Phase 1 owns the field and the read path; Phase 3 owns the UI.** Phase 1 exits when
`deterministic_replay` is present in the middleware's model-profile representation, read through
the anti-corruption layer from a verified-native SDK field (ADR-015), and covered by a contract
test asserting the read. The clause "correctly read by the rewind/fork UI" is **deferred to Phase
3** and struck from the Phase 1 list.

**(b) The seven-pattern fixture gates Phase 1, not Phase 2.** §6.4.2 ships in Phase 1, therefore
its fixture ships in Phase 1. The Phase 2 exit criteria retain the clause for regression purposes;
it is satisfied early rather than moved.

**(c) The lens primitive is in Phase 1 scope.** Phase 1 builds the minimum Vibe/Pro lens mechanism
required to demonstrate its own criteria in both lenses: a persisted lens selector, a lens-aware
render path, and Playwright coverage that drives each Phase 1 surface **once per lens** headed.
This is the mechanism only — `03-layout.md`'s full two-lens information architecture stays where
it is.

## Rationale

**(a)** The alternative readings are worse. Pulling `05-plan-model.md` into Phase 1 imports the
durable Plan object, hybrid trace projection, drift indicator and fork taxonomy — the whole of
Phase 3 — into the authorization slice, which is exactly the theme-first failure `11-dev-plan.md`
exists to prevent. Deferring the field itself instead is also wrong: the field is a *telemetry*
concern (§8.6, a Phase 1 file), the rewind UI is merely its first consumer, and a field added later
is a schema change to a shipped surface. Split at the layer boundary and each phase owns what its
own file describes.

**(b)** ADR-006 and Principle 8 already settled this shape: a control that displays correctly and
enforces nothing is worse than an absent one, because the operator relies on it. A security
checklist that ships in Phase 1 with no fixture is that control. It would sit in the review screen
looking authoritative for an entire phase with nothing establishing that any of its seven patterns
fire. The fixture is cheap — seven synthetic positives and their negatives — and the cost of the
alternative was demonstrated twice in Phase 0 (the inert out-of-worktree stop, ADR-006; the
button-mashing walkthrough test that covered nothing, BUILD_LOG 2026-08-08).

**(c)** Alternatives rejected. *Weaken the qualifier to one lens*: it appears verbatim in the exit
criteria and in `11-dev-plan.md`, and Principle 11 is the reason both lenses exist; dropping it
silently removes an exit criterion. *Back-fill the whole of `03-layout.md`'s lens IA into Phase 1*:
that is a Phase 4-sized design-system task grafted onto the safety slice. Building only the
mechanism satisfies the criterion as written at the lowest scope that can honestly be said to
satisfy it.

## Consequences

- `docs/specs/08-telemetry.md` §8.6 — Phase 1 exit clause amended, referencing this ADR; the UI
  half moves to Phase 3.
- `docs/specs/06-change-review.md` — the seven-pattern fixture is annotated as a Phase 1 gate.
- `docs/specs/11-dev-plan.md` — Phase 1 gains the lens primitive; Phase 3 gains the
  `deterministic_replay` UI-read clause.
- Phase 1's Playwright surface roughly doubles: every criterion is driven **twice**, once per lens,
  headed, per the operator's standing requirement to watch it run.
- No port is added or removed; `PORTING_LEDGER.md` is unaffected by this ADR.
- Does not touch ADR-014's verification gate, which remains the precondition for any enforcement
  code.

## Lock-in phase

Phase 1. Ratified before the first middleware code so the exit target is fixed rather than
negotiated at the end of the slice.

## References

- `docs/specs/04-authorization.md` §4.12 (the cumulative Phase 1 exit criteria)
- `docs/specs/08-telemetry.md` §8.6; `docs/specs/06-change-review.md` §§6.4.1–6.4.2, §6.5
- `docs/specs/11-dev-plan.md` Phase 1, Phase 3; `docs/specs/01-principles.md` Principle 8, 11
- ADR-006 (an inert authorization control is worse than none), ADR-014, ADR-015
