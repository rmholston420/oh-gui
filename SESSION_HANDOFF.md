# OH-GUI Session Handoff — 2026-08-08 21:15 EDT

## Current build-sequencing position
- **Stage / phase:** Phase 1 (Authorization slice), **slice 1 of N complete**.
- **Plugin / kernel component:** `services/middleware/` — scaffolded, **pre-enforcement**.
- **Port(s) in progress:** anti-corruption layer (ADR-001 item 7) established; no formal
  adapter port yet.

## Completed this session
- **ADR-017 filed and ratified** — three Phase 1 exit criteria could not be built to as written.
  `deterministic_replay` UI half deferred to Phase 3; §6.4.2's seven-pattern fixture promoted to a
  Phase 1 gate; **the Vibe/Pro lens mechanism added to Phase 1 scope** because it does not exist
  anywhere in `apps/gui/` yet gates all eleven criteria. Specs 04/06/08/11 amended.
- The exit-criteria list is now **§4.12**. It was an unnumbered trailing paragraph being miscited
  as §4.10, which is Speculative execution.
- **`services/middleware` scaffolded.** Fail-closed IPC seam (ADR-014 clause 3), loopback-only,
  anti-corruption layer as the sole `openhands*` import site, `/healthz` `/v1/upstream`
  `/v1/authorize`. Denies everything, by construction, and says why.
- `scripts/verify-local.sh` gained a middleware gate plus `--middleware-only` / `--skip-middleware`.
- Two defects logged in DEBUG_LOG: seven of eight dependency pins were written from recall and were
  wrong (21:05 EDT); the script's Node check contradicted its own `package.json` engines (21:08 EDT).

## Gate as of this handoff
- Frontend: 31 Vitest, 8 Playwright, 1 walkthrough — **unchanged, not re-run this session.**
- Middleware: **48 assertions, ruff clean, 2 live probes** (a real server on 127.0.0.1 denying a
  credential read; a `0.0.0.0` bind refused).
- **Mutation-tested, five mutants, all killed.** Every fault case is paired with an unguarded
  control asserting the same faulty resolver does *not* deny when called directly.
- **Not yet witnessed by the operator on Colossus.** Verified in the agent sandbox only.

## Remaining before the Phase 1 Definition of Done (§4.12 + 08 §8.6 + 06 §§6.4.1–6.4.2)
1. **Ratify ADR-014** — four executable items, needs the pinned agent-server up on Colossus.
   Nothing else in Phase 1 may be built first; it gates all enforcement.
2. Trust dial wired to `conversation.set_confirmation_policy()`, incl. the pending-action policy
   lock and the race-condition rule.
3. The out-of-worktree `SecurityAnalyzerBase` subclass (ADR-006), and **drive `trust-dial.ts` from
   the middleware's generated schema** rather than by hand.
4. Authorization cards: approve / reject-with-reason / relax-for-this-class, session-scoped expiry,
   live relaxation badge.
5. Authorization audit log — written at decision time, must represent actions that never executed.
6. Untrusted-content quarantine and provenance badge (`04a`, not yet read in detail).
7. Capability manifest · emergency stop · `execute_tool()` bypass closure · isolation-boundary
   visualization · browser-fallback elevated default.
8. Stuck-state card, five actions. Budget model with hard-limit pause. Speculative control +
   audit + budget pre-check only.
9. Telemetry seed (§8.0), reliability tier, malformed-tool-call diagnostic, cloud-fallback hatch,
   `deterministic_replay` field + read path.
10. Scope-shape review screen (§6.4.1) and the seven-pattern checklist + fixture (§6.4.2).
11. **The Vibe/Pro lens mechanism**, and every surface above driven **once per lens, headed**.

## Open questions / awaiting operator answer
- None outstanding. The model-profile-scan question is **resolved**: it is not built early as a
  standalone, but §8.6's reliability tier reads a model profile, so the scan lands as part of that
  work rather than as separate scaffolding.

## Carried-in debt
- Wizard spec §3.4 items 1 and 3 still inert — unblocked now that the middleware exists, but not
  yet wired.
- `apps/gui/src/features/first-run/trust-dial.ts` still a hand-maintained SDK mirror.
- ADR-014 **Proposed**; ADR-016 baseline benchmark decoupled and unrun (harness self-disagreement
  ~40%; do not restart casually).
- Next free ADR number: **ADR-018**.

## Exact next action
Run the gate on Colossus and watch it:

```bash
cd ~/dev/oh-gui && ./scripts/verify-local.sh --middleware-only
```

Then decide whether to start ADR-014's verification gate, which needs the pinned agent-server
container running locally.
