# Kosmos Session Handoff — 2026-08-08 20:05 EDT

> Project: **OH-GUI** (`rmholston420/oh-gui`, public, `main`). Read this before doing anything else.

## Current build-sequencing position

- **Stage / phase:** **Phase 0 CLOSED 2026-08-08 20:05 EDT.** Phase 1 (Authorization slice) is next
  and has not started.
- **Plugin / kernel component:** `apps/gui` first-run wizard shipped. Next component is the
  authorization slice per `docs/specs/04-authorization.md`.
- **Port(s) in progress:** none. `services/middleware/` does not exist yet and is the first thing
  Phase 1 needs.

## Completed this session

- `87094e9` — reclaimed 247 GB by deleting both orphaned apt container data-roots. Root cause was
  `containerd.service` (separate `containerd.io` package) still active after only Docker was masked.
  Free space 434G → 681G.
- `a404378` — local Docker volumes ruled permanently off-limits; handoff rewritten.
- `82efce7` — **ADR-016**: baseline benchmark decoupled from Phase 0 exit. It was gating code for
  reporting reasons; no Phase 1 module imports a benchmark result.
- `757caef` — **go/no-go executed: NO-GO, zero GPU spent.** The harness disagrees with itself on
  **40% of repeated tasks** (23 of 58; mean per-task pass probability 0.515). One GPU hour buys 36%
  power against a 20-point model gap; 80% power costs 171–320 min. ADR-013 gained clause 8 (state
  the minimum detectable effect in the manifest pre-run) and clause 9 (run-to-run variance is
  reportable).
- **Phase 0 exit criterion met** — first-run wizard verified, one native-fidelity defect fixed,
  test gate strengthened and proven against that defect. 27 Vitest + 8 Playwright green.

## Remaining before the current Definition of Done

Phase 0's DoD is met. Phase 1's exit criteria are the cumulative list in
`docs/specs/04-authorization.md` §4.10 (approve / reject-with-reason / mid-run trust-dial change
without restart; no retroactive auto-approval; provenance badge; expiring relaxation in the audit
log; stuck-loop card with five actions; hard-budget pause; reliability tier; malformed-tool-call
diagnostic; cloud-fallback escape hatch; scope-shape review screen; visible UNKNOWN handling — all
in both Vibe and Pro lenses).

Carried forward as owed work, tracked in `KNOWN_ISSUES.md`:
- Wizard spec 3.4 items 1 and 3 ship inert — they need the middleware.
- `trust-dial.ts` is a hand-maintained mirror; drive it from the middleware schema.
- ADR-014 is still **Proposed**, gated on four-item executable verification.

## Standing constraints (carry forward — violating these has cost real hours)

1. **Never prune Docker volumes.** ~122 GB across 69 local volumes is off-limits, permanently.
2. **Never make a model/quant/runtime superiority claim** without an ADR-013-compliant run
   (now including clauses 8–9). ADR-012's upstream-deference default is the only exception.
3. **Never quote the six Phase 0 block acceptance rates as a model ranking.**
4. **Always use Playwright to check the frontend.** jsdom has no layout engine and no colours.
5. GPU gates: `GPU_MAX_C=83`, `GPU_WARN_C=80`, `GPU_COLD_C=45`. Monitor temperature in any script
   that drives the LLM.
6. Verify a claim by executing it. A test's log is the author's summary, not the run.

## Open questions / awaiting user answer

- Whether to build a minimal middleware model-profile scan early in Phase 1 so wizard step 1 stops
  being a placeholder, or to leave it until the authorization slice needs the middleware anyway.
  My recommendation: leave it; the authorization slice forces the middleware into existence and the
  scan is cheap to add once it exists.

## Exact next action

Start the Phase 1 authorization slice: create `services/middleware/` and stand up the OH-GUI
middleware skeleton, since every remaining Phase 1 exit criterion depends on it and the frontend is
forbidden from talking to anything else (ADR-001 item 4). Restate scope from
`docs/specs/04-authorization.md` before writing code.
