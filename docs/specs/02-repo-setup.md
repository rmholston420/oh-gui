# 02. Repository Setup (Phase 0)

> **AMENDED v4.2 (2026-08-08) by [ADR-001](../../adrs/ADR-001-integration-boundary.md).**
> Items 1-2 below are replaced. OpenHands is a runtime dependency, not a checkout you
> modify. Items 4-9 are unchanged and still binding.

1. **(REPLACED)** Pin the OpenHands runtime as a dependency, not a checkout:
   - `agent-server` Docker image pinned **by digest**, not by floating tag.
   - `openhands-sdk`, `openhands-tools`, `openhands-workspace`, `openhands-agent-server`
     pinned in the middleware's Python lockfile.
   - `@openhands/typescript-client` pinned in the frontend lockfile; it self-describes as
     alpha, so wrap it behind the middleware anti-corruption layer per ADR-001 item 7.
   - Record every pin and the re-verification date in `BUILD_LOG.md` at each phase gate.
2. **(REPLACED)** Create a working branch per phase in **this** repo (e.g.
   `oh-gui/phase-1-authorization`). Never branch or modify upstream.
3. Confirm license: OpenHands is MIT at repo root; enterprise/ carries different terms and
   is out of scope. MIT permits vendoring Agent Canvas components into OH-GUI with
   attribution - log each in `PORTING_LEDGER.md`.
4. Run existing test suite before any changes: npm test (Vitest), then Playwright suites.
5. Baseline metrics report (Phase 0 exit criterion): run 5-10 representative coding tasks through unmodified app, log time-to-first-review, turns-to-acceptance, lines-accepted-without-inspection, "lost track" incidents, GPU temp/power.
6. Mental-model-formation baseline: log turns elapsed before user articulates a corrective instruction, and whether it was ever encoded durably.
7. Qwen3-specific baseline: run Phase 0 baseline tasks against a Qwen3 27B-35B model specifically. Record variant and quantization.
8. Capture the stock-Agent-Canvas regression baseline as the permanent reference checkout.
   (v4.2: this checkout is **read-only** - baseline and donor reading only, never edited.)
9. ~~(v4.0) Household onboarding decision point.~~ **REMOVED v4.3 by ADR-003** -
   single-operator deployment; there is no household mode to schedule.

Phase 0 exit criterion (v4.3): architecture decision record + baseline metrics report +
upstream artifact pins recorded + first-run wizard shipped with default trust-dial stop
stated in-UI. (The household-mode timing criterion is removed by ADR-003.)
