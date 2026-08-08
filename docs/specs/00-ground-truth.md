# 00. Ground Truth - Read This First (Always Load)

Canonical source location: github.com/OpenHands/OpenHands, tag v1.12.0, commit 4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364. Proven by SLSA provenance attestation on the npm package @openhands/agent-canvas, not by README text. The repository root is the application - root package.json is literally named @openhands/agent-canvas, MIT-licensed, exposing CLI binary bin/agent-canvas.mjs.

Archival status, re-verified and confirmed accurate: OpenHands/agent-canvas carries the "Public archive" label - archived by the owner on Jul 27, 2026, now read-only. Confirmed independently across the issues page, releases page, CI workflow page, and individual PR pages. The repo also carries a permanent Beta disclaimer even pre-archival. Last active release was 1.6.0 (Jul 19, 2026). Action: retain only a one-line confirmation in the Phase 0 audit log. Caution: stale crawl artifacts of this repo's homepage can misreport an active-looking state; always cross-check the issues/releases/CI pages, not just the homepage.

> **SUPERSEDED v4.2 (2026-08-08) by [ADR-001](../../adrs/ADR-001-integration-boundary.md).**
> The "EXTEND, not fork" decision below, and every instruction in this file to modify
> upstream source in place, is **no longer in force**. OH-GUI is a standalone application;
> OpenHands is a versioned runtime dependency (pinned `agent-server` Docker digest + the
> `openhands-sdk` pip family) and its source is never modified, forked, or patched.
> Agent Canvas is reclassified from *base* to *donor* — vendor its MIT components into
> OH-GUI and log them in `PORTING_LEDGER.md`. The paragraph and the inventory table below
> are retained as accurate upstream reference material only.

Architecture Decision (SUPERSEDED — see ADR-001): EXTEND, not fork. Clone/checkout OpenHands/OpenHands directly. Pin to a specific tag at project start, re-verify before each phase gate. Reinforced by OpenHands' own "Agent Canvas Initiative" (GitHub issue 14374), which declares Agent Canvas the main interface going forward.

Pre-code audit - confirm this file/route inventory against the live checkout before writing anything new:

| Area | Path | Status |
|---|---|---|
| CLI entrypoint | bin/agent-canvas.mjs | Confirmed |
| Frontend source | src/ | Confirmed |
| Component families | src/components/browser,conversation,conversation-events,features,files,providers,settings,shared,sidebar,terminal,ui | Confirmed |
| Routes (35 files) | src/routes/ incl planner-tab.tsx, changes-tab.tsx, commits-tab.tsx, task-list-tab.tsx | Confirmed |
| Python UI automation tool | tools/canvas_ui_tool.py | Confirmed |
| Helm deployment | helm/agent-canvas/ | Confirmed |
| Specs directory | specs/*.md, SPEC-annotated | Confirmed; use this exact convention |
| Desktop packaging | electron/, electron-builder.config.mjs | Confirmed |
| Tests | __tests__/ (Vitest), tests/e2e/ (Playwright) | Confirmed, 60+ files |
| CI workflows | .github/workflows/*.yml | Confirmed |
| Dependencies | @monaco-editor/react, monaco-editor, @openhands/typescript-client pinned at 1.36.1 | Confirmed |

Do not treat this as a greenfield build. planner-tab.tsx, changes-tab.tsx, commits-tab.tsx, task-list-tab.tsx already exist.

> **AMENDED v4.2 (2026-08-08) by ADR-001.** "MUST be extended in place, never duplicated"
> is retired. These routes are **donor sources**: read them, vendor what is useful into
> OH-GUI under MIT with attribution, and log each port in `PORTING_LEDGER.md`. Do not edit
> them in the upstream checkout. The point of the original rule — do not rebuild from
> scratch what already exists — still stands and is now enforced by the porting ledger.

## Confirmed SDK primitives you will wire against

> **AMENDED v4.2 (2026-08-08) by ADR-001.** These are **Python** SDK primitives and run
> in the OH-GUI middleware, not in the browser. `@openhands/typescript-client` supports
> remote conversations only. The frontend reaches policy behaviour through the OH-GUI
> middleware API, never by calling these directly.

- Confirmation policies: AlwaysConfirm(), NeverConfirm(), ConfirmRisky(threshold=HIGH, confirm_unknown=True) - each implements should_confirm(risk) returning bool, receiving only a SecurityRisk enum value, never paths/hosts/text. ConfirmRisky takes an explicit threshold argument (default HIGH) and defaults confirm_unknown to True - both must be named explicitly in the trust-dial table.
- Security analyzer risk levels: LOW/MEDIUM/HIGH/UNKNOWN, produced by PatternSecurityAnalyzer, PolicyRailSecurityAnalyzer, LLMSecurityAnalyzer (default), GraySwanAnalyzer, EnsembleSecurityAnalyzer (max-severity aggregation). Analyzers implement security_risk(action) - DOES receive the full action.
- ConversationExecutionStatus: IDLE, RUNNING, PAUSED, WAITING_FOR_CONFIRMATION, FINISHED, ERROR, STUCK, DELETING. FINISHED/ERROR/STUCK are terminal; IDLE is NOT terminal.
- conversation.reject_pending_actions(reason) - clears agent_waiting_for_confirmation, emits UserRejectObservation per pending action.
- conversation.set_confirmation_policy() - callable at runtime, no restart required.
- Security gap: conversation.execute_tool() bypasses BOTH the analyzer and confirmation policy. Scoped to LocalConversation only.
- ask_agent(question) - thread-safe, stateless, no persistence, callable concurrently with run().
- Event model: LLM-convertible (MessageEvent, ActionEvent, ObservationEvent, UserRejectObservation, AgentErrorEvent, SystemPromptEvent, CondensationSummaryEvent) vs internal-only (ConversationStateUpdateEvent, CondensationRequest, Condensation, PauseEvent). Multiple ActionEvents can share one llm_response_id.
- StatsConversationStateUpdateEvent does NOT exist - use the generic ConversationStateUpdateEvent.
- Three distinct terminal-failure classes, never collapse: AgentErrorEvent (non-terminal), ConversationErrorEvent (terminal), partial streaming failure (stream dies mid-emission).
- StuckDetector already ships in the SDK. Confirmed thresholds: 4+ identical action-observation pairs, 3+ action-error pairs, 3+ consecutive monologue turns, 6+ alternating cycles, any context-window error.
- Hook-based blocking primitives: state.block_action(reason) / state.block_message(reason).
- switch_llm built-in tool already exists to let a conversation switch its bound LLM mid-run.

GPU/accelerator telemetry portability gap (closed): nvidia-smi does not exist on Apple Silicon or AMD hardware. The telemetry adapter MUST abstract across nvidia-smi, rocm-smi, powermetrics, and /sys/class/thermal.

Primary deployment profile: single local Qwen3 model in the 27B-35B parameter range, served via Ollama/vLLM/llama.cpp on a single high-VRAM GPU (RTX 5090-class, 32GB), cloud providers used rarely as an escape hatch, parallel/multi-agent execution treated as occasional.

Single-operator deployment (v4.3, ADR-003): this install serves exactly one expert
operator on Colossus. There are no additional profiles, proficiency tiers, or delegation
relationships. The v4.0 multi-user household premise is withdrawn; see
`docs/specs/archive/15-household-profiles.md`.

vLLM determinism note (v4.0 addition): vLLM supports a batch-invariant mode producing bit-exact reproducible outputs at a measured latency cost. Model profiles should record whether the active backend has this enabled.
