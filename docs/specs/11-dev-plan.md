# 11. Development Plan - Vertical Slices, Not Theme-First (Reference)

## Phase 0 - Baseline audit and instrumentation
Files: 00-ground-truth.md, 02-repo-setup.md
Architecture decision + baseline metrics report against a dense Qwen3 27B-35B model, including GPU temp/power and mental-model-formation baselines, plus the stock-Agent-Canvas regression baseline. v4.0: also decide household-mode onboarding timing.
Exit criterion: architecture decision record + baseline metrics report + first-run wizard shipped with default trust-dial stop stated in-UI + household-mode timing decision recorded.

## Phase 1 - Authorization slice
Files: 04-authorization.md, 04a-prompt-injection.md, 08-telemetry.md (8.0-8.1, 8.5, 8.6), 06-change-review.md (6.4.1-6.4.2 only), 15-household-profiles.md (if elected at Phase 0)
Trust dial, interrupt/authorization cards, reject-with-reason, capability manifest, emergency stop, execute_tool bypass closure, untrusted-content quarantine, authorization audit log, thin telemetry seed, speculative-execution hooks, stuck-state intervention surface, budget model, cloud-fallback escape hatch, reliability-tier display, scope-shape review screen.
Exit criterion: see 04-authorization.md.

## Phase 2 - Change Review Workbench slice (remainder)
Files: 06-change-review.md (6.1-6.3, 6.5-6.11)
Benchmark diff engines against the five-metric gate. Worker-side/virtualized diff rendering, risk-ranked file ordering, configurable batch-review gate, verification strip, author-class provenance, precise accept/merge/push semantics, explain affordance.
Exit criterion: see 06-change-review.md.

## Phase 3 - Plan/drift/rewind slice
Files: 05-plan-model.md, 15-household-profiles.md (if not done in Phase 1)
Extend planner-tab.tsx into a durable Plan object + hybrid trace projection + drift indicator + fork taxonomy + explicit Plan-revision forking + plan-level provenance gate + Session Profile Card + conditional non-determinism disclosure.
Exit criterion: see 05-plan-model.md.

## Phase 4 - Design system extraction
Files: 07-visual-design.md
Extract tokens: lapis/saffron palette, contrast-verified tokens in CI, neobrutalist weight tiers, glassmorphism as vendored material, light/high-contrast/density themes, keyboard model plus Vim-modal tier, screen-reader mode extended.
Exit criterion: see 07-visual-design.md.

## Phase 5 - Async, telemetry, and mission control
Files: 08-telemetry.md (remainder), 09-missing-states.md, 10-mission-control.md
"Needs you" inbox, full telemetry strip, model profiles with new fields, StuckDetector UI wiring, mission-control dashboard, Project Skill panel, Context Inspector, condensation preview, notification model, air-gapped mode, three-class error model.
Exit criterion: see 09-missing-states.md and 10-mission-control.md.

## Phase 0/Phase 1 boundary - Spec Wizard
Files: 14-spec-wizard.md
Ships early enough to be usable for the project's own subsequent-phase specification.
Exit criterion: see 14-spec-wizard.md.

## Phase 6 - Compare mode and multi-agent orchestration (optional, deferrable indefinitely)
Files: 03-layout.md section 3.6, 04-authorization.md section 4.10
Compare mode's full design and speculative-execution spawn mechanism. May be deferred indefinitely without blocking the core product.
Exit criterion: see 03-layout.md section 3.6.
