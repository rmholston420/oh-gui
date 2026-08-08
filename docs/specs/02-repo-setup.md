# 02. Repository Setup (Phase 0)

1. Clone github.com/OpenHands/OpenHands, checkout tag v1.12.0 (or latest - re-verify at kickoff).
2. Create a working branch per phase.
3. Confirm license: MIT at repo root; enterprise/ carries different terms, out of scope unless explicitly requested.
4. Run existing test suite before any changes: npm test (Vitest), then Playwright suites.
5. Baseline metrics report (Phase 0 exit criterion): run 5-10 representative coding tasks through unmodified app, log time-to-first-review, turns-to-acceptance, lines-accepted-without-inspection, "lost track" incidents, GPU temp/power.
6. Mental-model-formation baseline: log turns elapsed before user articulates a corrective instruction, and whether it was ever encoded durably.
7. Qwen3-specific baseline: run Phase 0 baseline tasks against a Qwen3 27B-35B model specifically. Record variant and quantization.
8. Capture the stock-Agent-Canvas regression baseline as the permanent reference checkout.
9. (v4.0) Household onboarding decision point: decide at Phase 0 kickoff whether household mode ships in Phase 1 or Phase 3. See 15-household-profiles.md section 15.1.

Phase 0 exit criterion: architecture decision record + baseline metrics report + first-run wizard shipped with default trust-dial stop stated in-UI + household-mode timing decision recorded.
