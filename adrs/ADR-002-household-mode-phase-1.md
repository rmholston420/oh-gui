# ADR-002 — Household Multi-User Mode Ships in Phase 1

**Status:** Ratified
**Lock-in phase:** Phase 0 (kickoff decision)
**Supersedes:** —

## Context

`docs/specs/02-repo-setup.md` item 9 requires a Phase 0 kickoff decision on whether
multi-user household mode (`docs/specs/15-household-profiles.md`) ships in Phase 1 or
defers to Phase 3.

The spec's own decision rule (§15.1): *"ship in Phase 1 if a non-technical user will use
the system within the first month of deployment; otherwise defer to Phase 3 alongside the
Plan-model slice, since both phases touch conversation ownership semantics."*

The user has confirmed **Phase 1**.

## Decision

**Household multi-user mode ships in Phase 1**, together with the authorization slice.

Consequently the Phase 1 scope absorbs, in full:

- `HouseholdUser` profile schema (§15.2) — `proficiency_tier`, `default_lens`,
  `default_trust_dial_stop`, `default_review_line_threshold`, `default_budget_ceiling`,
  `can_modify_own_trust_dial`, `can_view_other_users_conversations`, `optional_delegate_ids`.
- `created_by` attribution on every conversation, authorization-log entry, and
  budget-ledger entry (§15.3).
- Per-user "needs you" inbox and per-user notification scoping (§15.3).
- Assist mode with dual-identity audit attribution and the "currently assisted by [user]"
  banner (§15.4).
- Optional delegated approval for novice-owned conversations, including the sub-900px
  "Ask delegate to review" affordance (§4.2.2, §3.2).
- Household fork in the first-run wizard, plus the abbreviated per-user onboarding pass
  (§15.5, §3.4).
- Novice-tier `AlwaysConfirm()` default with a configurable step-down window (default 10
  conversations).
- Per-user budget ceilings with optional project-level pooling, and the shared-GPU
  contention notice in the telemetry strip (§15.4).

Phase 1 exit now requires the §15 exit criterion in addition to the §4 exit criteria, and
both must be demonstrated in **both** Vibe and Pro lenses per Principle 11.

## Rationale

**Why Phase 1.** The spec's rule is a straightforward conditional and the user answered
the antecedent affirmatively. Beyond that, deferring is actively more expensive here:
`created_by` is an identity dimension threaded through the conversation, audit-log, and
budget-ledger schemas. Retrofitting it in Phase 3 means migrating records written across
all of Phase 1 and Phase 2 and re-auditing every authorization-log entry produced before
the migration. Identity is cheapest when it is present at first write.

**Why not Phase 3.** The spec's stated reason for pairing with Phase 3 is that both slices
touch conversation ownership semantics. That argument holds for *implementation adjacency*
but not for *data migration cost*, and the migration cost dominates. It would also mean
the authorization audit log — the Phase 1 centrepiece — ships without the `created_by`
field that `13-hard-constraints.md` gates on.

**Accepted cost.** Phase 1 was already the largest slice in the plan. This makes it
materially larger and it now carries the project's only comprehension-testing gate (§4.2
authorization-card copy verified with a non-technical reviewer). Schedule accordingly;
do not compress the comprehension check.

## Consequences

| File | Change |
|---|---|
| `docs/specs/02-repo-setup.md` | Item 9 marked decided: Phase 1 |
| `docs/specs/15-household-profiles.md` | §15.1 timing conditional resolved to Phase 1 |
| `docs/specs/11-dev-plan.md` | Phase 1 file list: household profiles no longer conditional; Phase 3 reference removed |
| `docs/specs/README.md` | v4.2 changelog note |
| `adrs/README.md` | Index row; open item cleared |

Other consequences:

- Phase 1 exit criteria are now cumulative across `04-authorization.md`,
  `08-telemetry.md`, `06-change-review.md` §§6.4.1-6.4.2, and
  `15-household-profiles.md`.
- The two-user synthetic test (inbox isolation, dual attribution, read-only shared
  conversation, delegated review from a sub-900px viewport) becomes a Phase 1 gate.
- No Phase 3 rework: `05-plan-model.md` §5.7 Session Profile Card can assume
  `created_by` already exists.

## Lock-in phase

Phase 0. Recorded before Phase 0 exit, as `02-repo-setup.md` item 9 requires.

## References

- `docs/specs/02-repo-setup.md` item 9
- `docs/specs/15-household-profiles.md` §15.1, §15.2, §15.3, §15.4, §15.5, §15.6
- `docs/specs/04-authorization.md` §4.2.2, §4.2.1
- `docs/specs/03-layout.md` §3.2, §3.4
- `docs/specs/11-dev-plan.md` Phase 1, Phase 3
- `docs/specs/13-hard-constraints.md` v4.0 and v4.1 additions
- [ADR-001](ADR-001-integration-boundary.md)
