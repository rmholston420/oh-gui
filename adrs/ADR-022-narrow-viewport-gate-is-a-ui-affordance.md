# ADR-022 — The 900px read-only rule is a UI affordance gate, not an enforcement boundary

**Status:** Ratified
**Lock-in phase:** Phase 1 · Authorization slice · §3.2 / §4.2
**Supersedes:** —

## Context

`docs/specs/03-layout.md` §3.2 and `docs/specs/13-hard-constraints.md` (lines 49 and 101) require
that below a 900px viewport, authorization cards are **read-only** — Approve, Reject and
"relax for this class" require ≥900px, with **no exception path** (ADR-003 removed the
delegated-review exception).

Building it raised a question the specs do not answer: *where* is this enforced? Two candidates.

1. **Frontend only.** The card renders its actions disabled below the breakpoint.
2. **Frontend and middleware.** The frontend disables the controls, and `/v1/authorize`'s
   decision endpoints additionally reject approve/reject/relax requests that report a sub-900px
   viewport.

The second looks stricter and is the reflex answer for anything filed under "hard constraint".

## Decision

**Enforce in the frontend only.** The middleware must **not** accept, read, or act on a
client-reported viewport dimension, and no viewport field is added to any IPC schema.

The rule is recorded in `13-hard-constraints.md` as a **UI affordance gate**: a constraint on what
the interface offers, in the same category as "the primary action is not the destructive one".
It is not a security boundary and must not be described as one.

## Rationale

**A middleware check on viewport would be theatre.** Viewport size is reported by the client. A
middleware that refuses a request because the client said "800px" is trusting the same client it
claims to be guarding against — anything able to forge the approval can equally report 1920. It
would add a schema field, a rejection path, tests, and an audit-log branch, and buy exactly zero
adversarial strength. Worse, it would appear in the audit log as an enforced control, which is how
a reviewer later concludes the system defends against something it does not.

**The rule's actual purpose is not adversarial.** Its purpose is to stop an operator fat-fingering
an irreversible approval on a cramped surface where the command, the diff, and the blast radius
cannot all be read at once. That threat is *the operator's own hand*, not an attacker, and the
frontend is exactly the right and only place to address it. Disabling the control removes the
mistake entirely.

**We already own the honest framing.** ADR-015's whole point is not to display things we cannot
substantiate. Labelling a client-side affordance as an enforced authorization boundary is the same
error in a different register: presenting a weaker fact as a stronger one.

**Rejected: frontend + middleware.** Covered above — cost without strength, plus a false entry in
the audit record.

**Rejected: neither (advisory banner only).** §3.2 says read-only with no exception path. A banner
that says "your window is small" while leaving Approve clickable does not implement that, and the
operator-error case is real.

## Consequences

- `AuthorizationCard` renders Approve / Reject / relax as `disabled` below 900px, with the reason
  stated in the UI rather than left to be inferred from a greyed-out button.
- No viewport field is added to `AuthorizeRequest`, `Decision`, or the audit-log entry shape
  (ADR-020). If one ever appears in a diff, this ADR is being violated.
- `13-hard-constraints.md` line 101's "no exception path" is satisfied: there is no code path,
  setting, or override that re-enables the actions below the breakpoint.
- The gate is proven by a **headed Playwright assertion at a narrow viewport**, per the operator's
  standing requirement that frontend behaviour is demonstrated by driving the UI, not by a green
  unit-test count. jsdom has no layout engine, so a Vitest-only proof would not be one.
- **Stated limitation, deliberately not fixed:** resizing the window past 900px re-enables the
  actions immediately. That is correct — the constraint is about the surface being adequate to
  review on, and a wider window *is* an adequate surface. It is not a lock to be defeated.

## Lock-in phase

Phase 1, with the first authorization card. Binding on every later authorization surface.

## References

- `docs/specs/03-layout.md` §3.2 (breakpoints, mobile/tablet approval policy)
- `docs/specs/13-hard-constraints.md` lines 49, 101
- `adrs/ADR-003-*.md` (removed the delegated-review exception)
- `adrs/ADR-015-*.md` (do not present a weak fact as a strong one)
- `adrs/ADR-020-audit-log-provenance-reference.md` (audit entry shape, unchanged by this ADR)
