# ADR-034 — The approval gate is pointer-aware: mis-tap is a pointer property, unreadable evidence is a width property

**Status:** Ratified v25
**Lock-in phase:** Phase 1 · authorization surface
**Supersedes:** the width-only rule in REQ-03-015 (ADR-003 clause on the delegated-review exception is untouched)

## Context

REQ-03-015 makes the authorization card read-only below 900px: Approve, Reject and "relax for this
class" are unavailable, with no exception path. ADR-022 records that this is a UI affordance gate,
not a security boundary, and states the threat it addresses as *"the operator's own hand on a
surface too cramped to read the command, the diff and the blast radius at once."*

That single sentence contains two different threats, and the 900px rule conflates them:

1. **Mis-tap.** A fat finger on a small touch target authorizes something the operator did not
   read. This is a property of the *pointing device*, not of the viewport.
2. **Unreadable evidence.** The command, diff and blast radius cannot be seen at once, so the
   operator authorizes without the information the pause exists to provide. This is a property of
   the *width*.

The conflation has a live cost on the only machine this product targets. The operator works
windowed on a 3440x1440 display, not full-screen. A quarter-width snap is 860px — 40px below the
floor — so every authorization control dies, with a notice that states the rule but not a reason
the operator recognises, because the operator did not choose that width for touch reasons. There
is no phone in the picture, and there never will be: OH-GUI is single-operator, local-first, on
Colossus.

A gate that fires on the operator's normal window is not protecting them from anything. It trains
them to widen the window reflexively to make buttons come back, which is precisely the
unconsidered-click behaviour the gate exists to prevent.

## Decision

**1. Split the gate along the two threats it was always addressing.**

- **Coarse pointer (touch): the 900px floor is retained, unchanged.** `@media (pointer: coarse)`
  identifies exactly the device class the mis-tap rule was written for.
- **Fine pointer (mouse/trackpad): the floor becomes 768px**, the authorization card's own
  `max-w-3xl` content width. Below its own max width the card starts compressing the command and
  the diff, which is the point at which the readability threat becomes real. Above it, the card
  renders its evidence in full and a mouse cannot mis-tap.

**2. Unknown pointer capability is treated as coarse.** If `matchMedia` is unavailable or the
query cannot be evaluated, the surface applies the 900px floor. The fail-safe direction is the
stricter one, matching the existing choice to snapshot server-side width as `0` rather than `900`.

**3. The gate remains client-side only and is still not a security boundary.** ADR-022 is
unchanged. Pointer type is client-reported, exactly like viewport width, so mirroring this in
middleware would trust the client it claims to guard against and would then appear in the audit
log as an enforced control that is not one.

**4. The read-only notice must state the applicable floor, not a constant.** An operator on a
narrow mouse-driven window and an operator on a phone are told different, true things.

## Rationale

The 900px number came from a mobile/tablet policy line written when this product was still assumed
to serve multiple household users of mixed proficiency. ADR-003 deleted that premise — there is one
operator and they are an expert — but REQ-03-015's number survived the premise that justified it.
This ADR finishes the job ADR-003 started rather than inventing a new policy.

**Why 768px and not a rounder number.** It is not a taste judgement: it is the card's own
`max-w-3xl` (48rem = 768px) at `AuthorizationCard.tsx:111`. Above that width the card is already
at full size and additional pixels change nothing about what the operator can read, so a floor
above it gates on something that does not vary. Below it the content genuinely compresses. Using
the component's real constraint means the number stays correct if the card is ever resized,
provided the constant is derived rather than duplicated.

**Alternatives considered.**

- *Lower the single floor to 768px for everyone.* Rejected: it silently weakens the mis-tap
  protection on touch devices to buy a desktop convenience, and gives up a real distinction to
  avoid writing one branch.
- *Add an explicit "widen to approve" affordance and keep 900px.* Rejected as insufficient on its
  own: it makes the wall legible without removing it, and the wall is wrong at 860px with a mouse.
  The improved notice in clause 4 is this idea's useful half, kept.
- *Remove the gate entirely.* Rejected: the readability threat is real, and the gate has already
  caught a regression (mutation M4 in `scripts/mutate-authz.sh`).

## Consequences

- `canActOnAuthorization` takes the pointer capability alongside the width. The single-argument
  form is removed rather than defaulted, so every call site is forced to state which environment
  it means — a default here would silently reintroduce the conflation.
- A `usePointerIsCoarse` hook joins `useViewportWidth`, using `useSyncExternalStore` for the same
  reason: reading during render, not after first paint, so a card never renders actionable for one
  frame in an environment where it should not be.
- `REQ-03-015` is rewritten; `REQ-03-014`'s breakpoint ladder is untouched, since it describes
  layout regions and not authorization.
- The read-only notice becomes conditional on the applicable floor.
- Contract tests must assert both branches and the unknown-pointer fallback, and must fail if the
  two floors are collapsed into one.

## Lock-in phase

Phase 1, with the authorization surface. It does not block the ADR-016 benchmark.

## References

- [ADR-003](ADR-003-single-operator-remove-household.md) — single-operator premise that removed the
  household/proficiency model
- [ADR-022](ADR-022-narrow-viewport-gate-is-a-ui-affordance.md) — the gate is an affordance,
  not a security boundary, and is deliberately not mirrored server-side
- `docs/specs/03-layout.md` REQ-03-015
- `apps/gui/src/features/authorization/viewport.ts`, `AuthorizationCard.tsx:111`
- `KNOWN_ISSUES.md` — "Quarter-tile windows silently disable all approvals" (2026-08-09)
