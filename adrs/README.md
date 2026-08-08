# OH-GUI Architecture Decision Records

Filed in ID order. An ADR is required for any decision that reshapes the integration
boundary, adds or changes a formal port, alters plugin/module scope, changes a storage
backend, or shifts the vendor-vs-hand-build line. Reversible code-level choices
(naming, refactors, lint style) do not get an ADR.

Amend in place with a `> **STATUS AMENDMENT (YYYY-MM-DD):**` block; never delete
original decision text. If a decision reverses, author a new ADR that supersedes the
old one and mark the old one `Amended · superseded by ADR-###`.

| ID | Title | Status | Lock-in phase |
|---|---|---|---|
| [ADR-001](ADR-001-integration-boundary.md) | OpenHands Integration Boundary: Standalone App over Agent Server API | Ratified | Phase 0 |

## Open items awaiting a decision

| Item | Blocking | Source |
|---|---|---|
| Household-mode onboarding timing (Phase 1 vs Phase 3) | Phase 0 exit | `docs/specs/02-repo-setup.md` item 9, `docs/specs/15-household-profiles.md` §15.1 |
| LICENSE for this repo | Public-repo hygiene; vendoring MIT donor code | User declined at bootstrap; revisit |
| Upstream pin re-verification before each phase gate | Phase 0 kickoff | `docs/specs/00-ground-truth.md` |
