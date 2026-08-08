# 11. Development Plan - Vertical Slices, Not Theme-First (Reference)

## Phase 0 - Baseline audit and instrumentation
Files: 00-ground-truth.md, 02-repo-setup.md
Architecture decision + baseline metrics report against the ADR-005 role pair, including GPU temp/power and mental-model-formation baselines, plus the stock-Agent-Canvas regression baseline.

> **AMENDED 2026-08-08 (operator decision; ADR-005 Amendment #6).** Previously read "against a
> **dense** Qwen3 27B-35B model", and the v4.3 status block below fixed the baseline set as
> `qwen3.6:27b` + `qwen3-coder:30b`. Both are superseded. The baseline is measured against the
> **ADR-005 selection**: planner `qwen3.6:27b` (dense) + coder `qwen3.6:35b-a3b-mtp-q4_K_M`.
> The word "dense" is **retired**: the selected coder is MoE (~3B active) and could never satisfy
> it, and `qwen3-coder:30b` was benched and rejected. Baselining a model that will never ship would
> measure the wrong system.
Exit criterion (v4.3): architecture decision record + baseline metrics report + upstream artifact pins recorded + first-run wizard shipped with default trust-dial stop stated in-UI.

> **v4.3 status:** ADR-001 (integration boundary) and ADR-003 (single-operator; supersedes
> ADR-002) are filed and ratified. ~~Baseline model set fixed: `qwen3.6:27b` (planner) and
> `qwen3-coder:30b` (coder).~~ **Superseded 2026-08-08 by ADR-005 Amdt #6:** planner
> `qwen3.6:27b` + coder `qwen3.6:35b-a3b-mtp-q4_K_M`.
> Outstanding for Phase 0 exit: baseline metrics report, ~~upstream artifact pins~~ (done),
> ~~read-only stock Agent Canvas reference checkout~~ (done), first-run wizard.

## Phase 1 - Authorization slice
Files: 04-authorization.md, 04a-prompt-injection.md, 08-telemetry.md (8.0-8.1, 8.5, 8.6), 06-change-review.md (6.4.1-6.4.2 only). *(15-household-profiles.md removed by ADR-003.)*
Trust dial, interrupt/authorization cards, reject-with-reason, capability manifest, emergency stop, execute_tool bypass closure, untrusted-content quarantine, authorization audit log, thin telemetry seed, speculative-execution hooks, stuck-state intervention surface, budget model, cloud-fallback escape hatch, reliability-tier display, scope-shape review screen.
Exit criterion: cumulative across 04-authorization.md, 08-telemetry.md, and 06-change-review.md §§6.4.1-6.4.2. All must be demonstrated in both Vibe and Pro lenses (Principle 11).

## Phase 2 - Change Review Workbench slice (remainder)
Files: 06-change-review.md (6.1-6.3, 6.5-6.11)
Benchmark diff engines against the five-metric gate. Worker-side/virtualized diff rendering, risk-ranked file ordering, configurable batch-review gate, verification strip, author-class provenance, precise accept/merge/push semantics, explain affordance.
Exit criterion: see 06-change-review.md.

## Phase 3 - Plan/drift/rewind slice
Files: 05-plan-model.md
Evolve the vendored planner-tab.tsx donor copy (ADR-001) into a durable Plan object + hybrid trace projection + drift indicator + fork taxonomy + explicit Plan-revision forking + plan-level provenance gate + Session Profile Card + conditional non-determinism disclosure.
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
