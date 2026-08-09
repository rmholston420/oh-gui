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
Exit criterion (v4.3): architecture decision record + baseline metrics report + upstream artifact pins recorded + first-run wizard shipped with default trust-dial stop stated in-UI. <!-- [REQ-11-001] -->

> **v4.3 status:** ADR-001 (integration boundary) and ADR-003 (single-operator; supersedes
> ADR-002) are filed and ratified. ~~Baseline model set fixed: `qwen3.6:27b` (planner) and
> `qwen3-coder:30b` (coder).~~ **Superseded 2026-08-08 by ADR-005 Amdt #6:** planner
> `qwen3.6:27b` + coder `qwen3.6:35b-a3b-mtp-q4_K_M`.
> Outstanding for Phase 0 exit: ~~baseline metrics report~~ **(struck by ADR-016 2026-08-08 19:50
> EDT — moved to a parallel track; it gates model *claims*, not code)**, ~~upstream artifact
> pins~~ (done), ~~read-only stock Agent Canvas reference checkout~~ (done), ~~**first-run
> wizard**~~ (done 2026-08-08 20:05 EDT).

> **PHASE 0 EXIT CRITERION MET 2026-08-08 20:05 EDT.** Every surviving item is satisfied. The
> wizard renders all five post-ADR-003 steps, states its default stop (`ConfirmRisky(threshold=HIGH,
> confirm_unknown=True)`) and justifies it in-UI, and marks `NeverConfirm()` opt-in-only with its
> reason. Gate: 27 Vitest assertions and 8 Playwright browser assertions green, including per-step
> WCAG AA contrast, overflow, and narrow-viewport checks, with every step screenshotted into the
> report. **Carried into Phase 1, not silently closed:** spec 3.4 items 1 and 3 ship inert pending
> the middleware (see the delivery note in 03-layout.md §3.4), and the trust-dial table is a
> hand-maintained mirror that Phase 1 must drive from the middleware schema.

> **AMENDED 2026-08-08 19:50 EDT by ADR-016.** The baseline metrics report is no longer a Phase 0
> exit criterion. ADR-013's seven clauses remain fully binding on any benchmark that does run, and
> per ADR-016 clause 3 no model/quantization/runtime superiority claim may be made anywhere until a
> compliant run supports it — ADR-012's upstream-deference default excepted. The benchmark carries
> a one-hour GPU cap and a pre-run attainability gate.

## Phase 1 - Authorization slice
Files: 04-authorization.md, 04a-prompt-injection.md, 08-telemetry.md (8.0-8.1, 8.5, 8.6), 06-change-review.md (6.4.1-6.4.2 only). *(15-household-profiles.md removed by ADR-003.)*
Trust dial, interrupt/authorization cards, reject-with-reason, capability manifest, emergency stop, execute_tool bypass closure, untrusted-content quarantine, authorization audit log, thin telemetry seed, speculative-execution hooks, stuck-state intervention surface, budget model, cloud-fallback escape hatch, reliability-tier display, scope-shape review screen.
Exit criterion: cumulative across 04-authorization.md, 08-telemetry.md, and 06-change-review.md §§6.4.1-6.4.2. All must be demonstrated in both Vibe and Pro lenses (Principle 11). <!-- [REQ-11-002] -->

> **AMENDED 2026-08-08 20:52 EDT by [ADR-017](../../adrs/ADR-017-phase-1-exit-criteria-resolution.md).**
> Three resolutions, all binding on Phase 1 exit:
> 1. `deterministic_replay` — Phase 1 owns the middleware field and its read path; the rewind/fork
>    UI half moves to **Phase 3** (`05-plan-model.md`, which is not in Phase 1's file list).
> 2. The §6.4.2 seven-pattern security-checklist fixture is a **Phase 1** gate.
> 3. **The Vibe/Pro lens primitive is added to Phase 1 scope.** The qualifier above gates all
>    eleven criteria, and at `52fa9e6` the lens system does not exist anywhere in `apps/gui/`.
>    Phase 1 builds the mechanism only — persisted lens selector, lens-aware render path, and
>    Playwright coverage driving each Phase 1 surface once per lens. `03-layout.md`'s full two-lens
>    information architecture is unaffected.

## Phase 2 - Change Review Workbench slice (remainder)
Files: 06-change-review.md (6.1-6.3, 6.5-6.11)
Benchmark diff engines against the five-metric gate. Worker-side/virtualized diff rendering, risk-ranked file ordering, configurable batch-review gate, verification strip, author-class provenance, precise accept/merge/push semantics, explain affordance.
Exit criterion: see 06-change-review.md. <!-- [REQ-11-003] -->

## Phase 3 - Plan/drift/rewind slice
Files: 05-plan-model.md
Evolve the vendored planner-tab.tsx donor copy (ADR-001) into a durable Plan object + hybrid trace projection + drift indicator + fork taxonomy + explicit Plan-revision forking + plan-level provenance gate + Session Profile Card + conditional non-determinism disclosure.
Exit criterion: see 05-plan-model.md. **Plus (ADR-017):** `deterministic_replay` correctly read by the rewind/fork UI, deferred here from the Phase 1 list. <!-- [REQ-11-004] -->

## Phase 4 - Design system extraction
Files: 07-visual-design.md
Extract tokens: lapis/saffron palette, contrast-verified tokens in CI, neobrutalist weight tiers, glassmorphism as vendored material, light/high-contrast/density themes, keyboard model plus Vim-modal tier, screen-reader mode extended.
Exit criterion: see 07-visual-design.md. <!-- [REQ-11-005] -->

## Phase 5 - Async, telemetry, and mission control
Files: 08-telemetry.md (remainder), 09-missing-states.md, 10-mission-control.md
"Needs you" inbox, full telemetry strip, model profiles with new fields, StuckDetector UI wiring, mission-control dashboard, Project Skill panel, Context Inspector, condensation preview, notification model, air-gapped mode, three-class error model.
Exit criterion: see 09-missing-states.md and 10-mission-control.md. <!-- [REQ-11-006] -->

> **AMENDED 2026-08-08 by [ADR-020](../../adrs/ADR-020-audit-log-provenance-reference.md).**
> Phase 5 additionally owns **resolution of the audit log's `provenance[].id` references**: the
> Context Inspector built here is what makes `04-authorization.md` §4.2.1's cross-link live.
> Phase 1 captures the IDs; Phase 5 renders them. A Phase 5 exit that ships the Context Inspector
> without resolving audit-log provenance leaves §4.2.1 permanently half-built.

## Phase 1/Phase 2 boundary - Spec Wizard
Files: 14-spec-wizard.md
Ships early enough to be usable for the project's own subsequent-phase specification.
Exit criterion: see 14-spec-wizard.md. <!-- [REQ-11-007] -->

> **AMENDED 2026-08-08 by [ADR-019](../../adrs/ADR-019-spec-wizard-phase-placement.md).**
> Moved from the Phase 0/1 boundary, which had already passed unnoticed at `52fa9e6` — a
> boundary in the past is not a schedule. Split at the primitive boundary:
>
> - **Phase 1** builds the **restricted-capability primitive** the wizard needs, because
>   `04a-prompt-injection.md` §4.9.1 needs the same thing for untrusted-content quarantine and
>   is already in Phase 1's file list. One tool-less quarantined conversation mechanism, two
>   consumers. Building it twice is how the two copies drift.
> - **The wizard itself ships at the Phase 1→2 boundary**, trigger: *no Phase 2 specification
>   work begins until the wizard is usable*. This preserves the original intent — that the
>   project specify itself with its own tool — by tying the ship date to the first moment that
>   intent can actually be exercised, rather than to a calendar point.
> - **Phase 1 exit does not gate on the wizard.** Phase 1's exit criterion is §4.12 (ADR-017)
>   and is unchanged. Loading the wizard into Phase 1 exit would hold the authorization slice
>   hostage to a feature that needs live web search and a separate thinking-model tier.

## Phase 6 - Compare mode and multi-agent orchestration (optional, deferrable indefinitely)
Files: 03-layout.md section 3.6, 04-authorization.md section 4.10
Compare mode's full design and speculative-execution spawn mechanism. May be deferred indefinitely without blocking the core product. <!-- [REQ-11-008] -->
Exit criterion: see 03-layout.md section 3.6.
