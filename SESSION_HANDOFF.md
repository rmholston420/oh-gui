# OH-GUI Session Handoff — 2026-08-08 20:21 EDT

## Current build-sequencing position
- **Stage / phase:** Phase 0 **CLOSED**. Phase 1 (Authorization slice) **not started**.
- **Plugin / kernel component:** next up is `services/middleware/`, which does not exist yet.
- **Port(s) in progress:** none.

## Completed this session
- ADR-016 — decoupled the baseline benchmark from Phase 0 exit (`82efce7`).
- Go/no-go on the baseline benchmark: **NO-GO**, zero GPU hours spent (`757caef`). Power analysis
  over empirical per-task pass rates showed the binding constraint is instrument noise, not sample
  size: the harness disagrees with itself on ~40% of repeated tasks, and 80% power on a 20-point
  gap costs 3–5 GPU hours. ADR-013 amended with clauses 8 and 9.
- First-run wizard verified; **native-fidelity defect found and fixed** (`490aee0`). `trust-dial.ts`
  guarded the out-of-worktree HIGH elevation with `risk !== 'UNKNOWN'`, so with
  `confirm_unknown=false` the UI claimed an unclassifiable write outside the worktree would
  proceed where OpenHands actually pauses. `EnsembleSecurityAnalyzer` filters UNKNOWN out before
  `max(concrete)`, so `confirm_unknown` is never consulted. ADR-015 violation. Regression tests
  proven against the old predicate before the fix landed.
- `scripts/verify-local.sh` — one-command, colour-coded operator verification (`0a91b75`).
- Walkthrough test + clamp extraction (`845ea1e`). Mutation testing showed a button-mashing test
  was covering nothing; clamp moved to `wizard-nav.ts` where it is reachable.
- **Operator ran the headed walkthrough on Colossus and it passed. Phase 0 closed.**

## Remaining before the current Definition of Done
Phase 0 has none. Phase 1 exit criteria are the cumulative list at `docs/specs/04-authorization.md`
§4.10 — restate them before writing any code.

## Open questions / awaiting operator answer
- Build a minimal middleware model-profile scan early in Phase 1 so wizard step 1 stops being an
  inert placeholder? Agent recommendation: no — the authorization slice forces the middleware into
  existence anyway, and the scan is cheap to add once it exists.

## Carried-in debt
- Wizard spec §3.4 items 1 and 3 ship inert: ADR-001 item 4 confines the frontend to the
  middleware, which does not exist until Phase 1. Both flagged in `KNOWN_ISSUES.md`.
- `trust-dial.ts` is a hand-maintained mirror of SDK semantics and has already shipped one wrong
  decision. Drive it from the middleware's generated schema in Phase 1.
- ADR-014 is **Proposed**, gated on four-item executable verification.
- Baseline benchmark decoupled (ADR-016) and unrun; harness self-disagreement is the open problem.
- Next free ADR number: **ADR-017**.

## Exact next action
Read `docs/specs/04-authorization.md` §4.10, restate the Phase 1 scope and stop condition to the
operator, and wait for confirmation before creating `services/middleware/`.
