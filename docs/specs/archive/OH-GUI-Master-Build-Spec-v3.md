# OH-GUI Master Build Spec v3.0 â€” Fully Integrated Implementation Specification
### Vibe-Coding GUI for OpenHands Agent Canvas â€” Standalone Spec for Direct Execution by Perplexity Computer

**Audience:** Perplexity Computer (autonomous coding agent), implementing directly against a live repository checkout.

**Provenance of this integration:** This document merges seven revisions supplied by the user (v2.0 â†’ v2.1 â†’ v2.2 â†’ v2.3 â†’ v2.3.1 â†’ v2.4 â†’ v2.5). Each revision carried forward all prior, unretracted content and layered council/user-decision edits on top. v2.5 is the most complete cumulative document and forms the backbone of this integration; every edit traced across v2.0â€“v2.4 that survived into v2.5 unchanged is preserved below, and nothing that was superseded (e.g., the three-layout Vibe/Standard/Pro exploration, the Phase-2 promotion of Compare mode, the "archival status uncertain" note) is reintroduced. Where a section is verbatim-identical across versions this spec states "carried forward" rather than re-deriving it, exactly as the source documents do, to keep the authoritative chain traceable.[^1][^2][^3][^4][^5][^6][^7]

**Three governing structural decisions (final, not open questions):**
1. **Two modes only: Vibe and Pro.** No third "Standard" mode is ever user-facing.[^4]
2. **Primary hardware/model profile: Qwen3, 27Bâ€“35B class, single local instance, parallel execution rare.** This governs the model-profile schema, tool-calling reliability posture, and demotes Compare/multi-worktree orchestration to a low-priority, optional Phase 6.[^4]
3. **The Spec Wizard (Â§14) requires live web-search access and routes its heaviest reasoning steps to a distinct "thinking" model tier**, separate from the model driving the active build conversation, and is implemented as a first-party OH-GUI feature on native SDK primitives (Â§14.10) â€” not a generic plugin, not a frontend-only feature.[^4]

***

## 0. Ground Truth â€” Read This First

**Canonical source location:** `github.com/OpenHands/OpenHands`, tag `v1.12.0`, commit `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364`. Proven by SLSA provenance attestation on the npm package `@openhands/agent-canvas`, not by README text. The **repository root is the application** â€” root `package.json` is literally named `@openhands/agent-canvas`, MIT-licensed, exposing CLI binary `bin/agent-canvas.mjs`.[^1]

**Archival question â€” resolved, closed.** `OpenHands/agent-canvas` was archived by its owner on **July 27, 2026** and is now read-only, confirmed directly on the repo's issues/CI pages. An earlier "active as of 2026-04-23" signal was a stale crawl artifact, not evidence of live development. Action: retain only a one-line confirmation (`gh repo view OpenHands/agent-canvas --json isArchived,pushedAt`) in the Phase 0 audit log â€” a formality, not an open investigation.[^1]

**Architecture Decision: EXTEND, not fork.** Clone/checkout `OpenHands/OpenHands` directly. Pin to a specific tag (`v1.12.0` or later) at project start, and re-verify the tag before each phase gate (roughly one release every 2â€“3 days historically). Reinforced by OpenHands' own "Agent Canvas Initiative" (GitHub issue #14374), which declares Agent Canvas the main interface going forward and moves enterprise code out of OSS â€” the monorepo, not the archived standalone repo, is where surface area keeps growing.[^1]

**Pre-code audit â€” confirm this file/route inventory against the live checkout before writing anything new:**

| Area | Path | Status |
|---|---|---|
| CLI entrypoint | `bin/agent-canvas.mjs` | Confirmed |
| Frontend source | `src/` | Confirmed |
| Component families | `src/components/{browser,conversation,conversation-events,features,files,providers,settings,shared,sidebar,terminal,ui}` | Confirmed |
| Routes (35 files) | `src/routes/` incl. `planner-tab.tsx`, `changes-tab.tsx`, `commits-tab.tsx`, `task-list-tab.tsx`, `conversation.tsx`, `browser-tab.tsx`, `files-tab.tsx`, `automations-list.tsx`, `automation-detail.tsx`, `extensions-hub.tsx`, `mcp.tsx`, settings tree | Confirmed |
| Python UI automation tool | `tools/canvas_ui_tool.py` | Confirmed |
| Helm deployment | `helm/agent-canvas/` | Confirmed |
| Specs directory | `specs/*.md` â€” `@SPEC`-annotated | Confirmed; use this exact convention |
| Desktop packaging | `electron/`, `electron-builder.config.mjs` | Confirmed |
| Tests | `__tests__/` (Vitest), `tests/e2e/` (Playwright: `playwright.config.ts`, `playwright.live.config.ts`, `playwright.mock-llm.config.ts`) | Confirmed, 60+ files |
| CI workflows | `.github/workflows/*.yml` | Confirmed |
| Dependencies of note | `@monaco-editor/react`, `monaco-editor`, `@openhands/typescript-client` pinned at `1.36.1` | Confirmed |

**Do not treat this as a greenfield build.** `planner-tab.tsx`, `changes-tab.tsx`, `commits-tab.tsx`, `task-list-tab.tsx` already exist and MUST be extended in place, never duplicated. The shipped "branch a conversation from any message" feature (v1.2.0) is a precursor to rewind/fork-from-step (Â§5.5) â€” audit it first.[^1]

**Confirmed SDK primitives you will wire against:**
- **Confirmation policies:** `AlwaysConfirm()`, `NeverConfirm()`, `ConfirmRisky()` â€” each implements `should_confirm(risk: SecurityRisk) -> bool`, receiving **only** a `SecurityRisk` enum value, never file paths, hosts, or command text. This is a hard API constraint (see Â§4.1).
- **Security analyzer risk levels:** `LOW`/`MEDIUM`/`HIGH`/`UNKNOWN`, produced by `PatternSecurityAnalyzer` (regex: `rm -rf`, `eval`, `curl|sh`), `PolicyRailSecurityAnalyzer` (composed threats), `LLMSecurityAnalyzer`, `GraySwanAnalyzer` (external Cygnal API), `EnsembleSecurityAnalyzer` (max-severity aggregation). Analyzers implement `security_risk(action: ActionEvent) -> SecurityRisk` â€” **does** receive the full action.
- **`ConversationExecutionStatus`:** `IDLE`, `RUNNING`, `PAUSED`, `WAITING_FOR_CONFIRMATION`, `FINISHED`, `ERROR`, `STUCK`, `DELETING`. `FINISHED`/`ERROR`/`STUCK` are terminal via `.is_terminal()`; `IDLE` is NOT terminal.
- `conversation.reject_pending_actions(reason)` â€” clears `agent_waiting_for_confirmation`, emits `UserRejectObservation` per pending action, triggers a retry-with-safer-alternative loop.
- `conversation.set_confirmation_policy()` â€” callable at runtime, no restart required.
- **Security gap:** `conversation.execute_tool()` bypasses BOTH the analyzer and confirmation policy. Scoped to `LocalConversation` only â€” `RemoteConversation.execute_tool()` raises `NotImplementedError` unconditionally.
- `ask_agent(question)` â€” thread-safe, stateless, no persistence, no events, callable concurrently with `run()`. Correct backing call for the Â§6.10 "explain" affordance.
- **Event model:** LLM-convertible (`MessageEvent`, `ActionEvent`, `ObservationEvent`, `UserRejectObservation`, `AgentErrorEvent`, `SystemPromptEvent`, `CondensationSummaryEvent`) vs. internal-only (`ConversationStateUpdateEvent`, `CondensationRequest`, `Condensation`, `PauseEvent`). Multiple `ActionEvent`s can share one `llm_response_id` â€” never assume 1 event = 1 task.
- `Condensation` carries `forgotten_event_ids`, `summary`, `summary_offset`.
- **`StatsConversationStateUpdateEvent` does NOT exist.** Use the generic `ConversationStateUpdateEvent` (`key`/`value`) routed through a versioned adapter layer you own.
- **Three distinct terminal-failure classes** (never collapse any two into one UI treatment): `AgentErrorEvent` (tool-call-scoped, LLM-visible, non-terminal); `ConversationErrorEvent` (conversation-level, NOT LLM-convertible, terminal, drives run to `ERROR`); **partial streaming failure** â€” the token stream for an in-flight `ActionEvent` dies mid-emission (WebSocket drop, backend crash, upstream provider timeout) without producing either event above. Render the partial content with a visible "incomplete â€” stream interrupted" marker; never silently complete or discard it; never auto-retry an interrupted above-LOW-risk action without explicit user confirmation. This is distinct from the Â§9 WebSocket-disconnect case, which covers reconnection UX for events that already finished emitting.[^1]
- `StuckDetector` already ships in the SDK â€” not net-new work. Detects repeating action-observation cycles, repeating action-error cycles, agent monologue, repeating alternating patterns, and context-window/memory errors via configurable `StuckDetectionThresholds`. Dedicated `STUCK` execution status already exists.
- Hook-based blocking primitives: `state.block_action(reason)` / `state.block_message(reason)` with `pop_blocked_action()` / `pop_blocked_message()` accessors. Natural enforcement point for Â§4.9.

**GPU/accelerator telemetry portability gap (closed).** `nvidia-smi` does not exist on Apple Silicon or AMD hardware. The telemetry adapter (Â§8.2) MUST abstract across `nvidia-smi` (NVIDIA/CUDA), `rocm-smi` (AMD/ROCm), `powermetrics` (Apple Silicon), and `/sys/class/thermal` (generic Linux fallback). Detect the active backend at startup and record it in the model profile (Â§8.4); never hardcode a single vendor path.[^5]

**Primary deployment profile, stated explicitly for downstream design decisions.** This spec is designed first for a single local **Qwen3** model in the **27Bâ€“35B** parameter range, served via Ollama/vLLM/llama.cpp on a single high-VRAM GPU (RTX 5090-class, 32GB), with cloud providers used rarely as an explicit escape hatch rather than a co-equal default path, and with parallel/multi-agent execution treated as occasional rather than primary. This does not remove support for other model sizes/providers/parallelism â€” it changes what ships enabled-by-default vs. opt-in.[^4]

***

## 1. Governing UX Principles (apply to every phase)

1. **Precision in, precision out** â€” scaffold structured intent capture; never ship a bare chat box as the only input surface.
2. **First output is a sketch, not a final answer** â€” every surface must make review effortless (inline diffs, previews, test results).
3. **Iterate in bounded sections** â€” default all agent requests to scoped, section-by-section changes over open-ended full rewrites.
4. **Expose decision boundaries; do not maximize autonomy** â€” design explicit intervention points at the correct abstraction level.
5. **Proactivity has a disruption cost** â€” pay it down with visible presence/context cues, not silent background action.
6. **The review budget is finite (~400 lines/session, configurable â€” see Â§6.5)** â€” design batching and pacing explicitly; never rely on user diligence alone.
7. **Friction is budgeted and spent deliberately; the low-risk path must feel instant.** Input echo under 100ms, visible time-to-first-token under 1s, zero modal interruptions for any action rated LOW risk under the current trust-dial setting.
8. **Provenance is a first-class governing concern, not a Â§4.9 subsection.** Every piece of context, action, and authorization decision carries a trust class (`first-party` / `workspace-derived` / `third-party-untrusted`), visible wherever token cost, risk level, or capability scope is already shown. **Display is not enforcement** â€” see Â§5.2.1 for the plan-layer gate this principle requires.
9. **Two depth layers, one system, never two products (revised, final).** The GUI presents **Vibe Mode** (default) and **Pro Mode** as semantic-zoom lenses over one shared data model â€” never as separate builds and never as three. Switching lenses preserves scroll/selection state and never triggers a page reload or navigation event. Novices default to Vibe Mode; nothing in Vibe Mode is unavailable in Pro Mode, only differently dense. **The mode switch is a binary toggle, not a segmented control** â€” matching the "Safari Develop menu" reference pattern.[^5][^4]
10. **Design for one capable local model, not a fleet.** The primary session shape is one Qwen3 27Bâ€“35B-class model running one conversation at a time. Every surface that assumes multiple simultaneous models, multiple parallel worktrees, or a fleet of comparison runs must degrade gracefully to a single-model, single-run default and must never impose UI overhead on the common case for the sake of a rare parallel case. Parallel capability is additive, opt-in, and Phase 6 â€” never load-bearing for the core Vibe/Pro experience.[^4]

***

## 2. Repository Setup

1. Clone `github.com/OpenHands/OpenHands`, checkout tag `v1.12.0` (or latest â€” re-verify at kickoff).
2. Create a working branch per phase (e.g., `oh-gui/phase-1-authorization`).
3. Confirm license: MIT at repo root; `enterprise/` carries different terms, out of scope unless SSO/centralized-secrets/SIEM-export features are explicitly requested.
4. Run the existing test suite locally before any changes to establish a green baseline: `npm test` (Vitest), then Playwright suites.
5. **Baseline metrics report (Phase 0 exit criterion â€” do not skip):** run 5â€“10 representative coding tasks through the unmodified app and log: time-to-first-review, turns-to-acceptance, lines-accepted-without-inspection, "lost track of what it did" incident count, GPU temperature and power-draw-vs-limit (using the multi-backend abstraction from Â§0).
6. **Mental-model-formation baseline.** Log, per baseline task: how many turns elapsed before the user articulated a corrective instruction (e.g., "stop over-engineering," "you keep hallucinating that path"), and whether that correction was ever encoded anywhere durable. This is the baseline the Â§5.7 Session Profile Card is measured against post-build.[^5]
7. **Qwen3-specific baseline addition.** Run the Phase 0 baseline tasks specifically against a Qwen3 model in the 27Bâ€“35B range (not a smaller or cloud model). Record the specific Qwen3 variant (e.g., Qwen3-32B, Qwen3-30B-A3B if MoE) and quantization level â€” see Â§8.6 for why dense-vs-MoE matters even within the Qwen3 family.[^4]
8. Capture the stock-Agent-Canvas regression baseline per Â§3.0.1 as the permanent reference checkout (not a shipped mode).

***

## 3. Layout â€” Vibe/Pro Semantic-Zoom Workbench

**Two modes only.** Progressive-disclosure UX research caps effective complexity jumps at two levels; a third, separately-maintained mode risks becoming a maintenance burden without a clear user base. Decision: two modes only.[^4]

### 3.0 The two lenses

**Vibe Mode (default landing state):**
- Single-column, centered, generous-whitespace layout â€” mimics chat apps (WhatsApp/iMessage) rather than a dashboard, matching the lowest-cognitive-load scan pattern for first-time/casual users.
- Plans, diffs, and authorization cards expand **inline** as interactive cards directly in the conversation flow, using spring-physics entrance animation (not a snap-into-place).
- No terminal pane, plan tree, or telemetry strip visible by default â€” available via a single "expand" affordance per card, not permanent chrome.
- Touch/swipe support on tablet-class viewports for hunk-level review: swipe right to accept, swipe left to reject, tap to expand. **Authorization cards above LOW risk are exempt from swipe-approve** (see Â§3.2) â€” swipe applies to reversible hunk-level review only, never to "Approve and relax for this class."

**Pro Mode (opt-in, persists per project):**
- Global command bar (persistent, top): project/repo selector, branch/worktree indicator, active agent + model, execution mode, backend/runtime indicator, run state, context-use %, telemetry summary (Â§8), trust dial (Â§4.1), command palette trigger (`âŒ˜/Ctrl+K`), global pause/stop button, Vibe/Pro lens toggle.
- Left rail (280â€“360px, collapsible): projects, conversations/runs list, worktrees, automations, a "needs you" inbox, settings/extensions, plan tree (docked as navigation).
- Center stage (fluid, â‰¥60% of width, mode-switched via `âŒ˜1`â€“`âŒ˜4`): Build / Review / Debug / Compare.
- Right conversation column (380â€“440px, always present): structured intent capture with removable context tags, streamed reasoning, authorization/interrupt cards (Â§4.2) anchored here â€” never buried in chat scroll.
- Full keyboard model (Â§7.4), Vim-modal tier (Â§7.4.1), telemetry strip, plan tree, terminal â€” all persistently visible per the breakpoint table.

**The lens switch:** a single **binary toggle** in the global command bar. Switching is a CSS/layout transition on the same in-memory object graph â€” no route change, no data refetch, no loss of in-progress input.

### 3.0.1 What happens to "Standard" (the unmodified Agent Canvas)

The unmodified Agent Canvas build is **not** a third mode a user selects at runtime. It is retained exclusively as:
- A **pinned reference checkout** (separate git worktree or tag checkout of upstream `OpenHands/OpenHands`) used for diffing during development ("does our Pro Mode still do everything the stock build did").
- The **regression baseline** for the Phase 0 metrics report â€” baseline tasks run against stock Agent Canvas before any OH-GUI changes.
- **Never exposed as a runtime toggle, settings option, or documented user-facing mode.** If a user wants the closest experience to stock Agent Canvas, that is Pro Mode with all OH-GUI-specific enhancements toggled off in settings â€” not a separate build.[^4]

### 3.1 Pro Mode structure

See Â§3.0 Pro Mode bullets above (global command bar / left rail / center stage / right conversation column). Confirmed unchanged across all revisions.

### 3.2 Responsiveness

- One-keystroke maximize for any surface (`âŒ˜.`), with restore to prior layout.
- Explicit breakpoints: â‰¥1600px (up to four visible regions), 1200â€“1599px (two primary panes + collapsible side panels), 900â€“1199px (one main pane + drawer), <900px (monitoring/approvals/conversation only).
- **Mobile/tablet approval policy.** Below 900px: conversation input, monitoring, telemetry fully supported. Diff-hunk review supports swipe-to-accept/reject on tablet-class viewports. **Authorization cards are read-only below 900px** â€” viewing a pending confirmation's risk level/blast radius is fine on a phone, but "Approve," "Reject with reason," and especially "Approve and relax for this class" require a viewport â‰¥900px. Rationale: the audit-log and privilege-escalation consequences of Â§4.2.1 are too consequential for a thumb-tap on a horizontally-truncated patch view.[^5]
- Save per-mode layouts for expert users; novices land in Vibe Mode by default, never a four-pane cockpit.

### 3.3 Implementation notes

- Terminal pane and command palette: port `Qovery/react-xtermjs` and `cmdk`/`react-cmdk` as commodity UI.
- **Frontend motion/visual stack mandate.** Integrate `framer-motion` as the animation primitive for card expansion, lens switching, and authorization-card z-axis emphasis (Â§7.5). Where the visual design system calls for glass/gradient/glow treatments, use `aceternity-ui` and `magic-ui` component patterns rather than hand-rolling CSS.[^5]
- **Screen-reader model.** A detectable "screen-reader optimized mode" that: (a) suppresses per-token announcements in favor of a debounced "agent is responding" status plus a manual "read full response" action; (b) treats authorization cards as a distinct ARIA live-region priority level above normal chat content; (c) provides an accessibility-help overlay for terminal/diff navigation shortcuts (VS Code's screen-reader-optimized mode is the reference pattern). Extended to two additional surfaces:
  - **Plan tree:** render as a **flat task list with explicit parent references** ("Task 4, child of Goal 1: Build auth flow"), not a nested `role="tree"` â€” nested trees are the hardest ARIA pattern to navigate and the Goalâ†’Taskâ†’Attempt hierarchy is exactly that pattern.
  - **Diff/review workbench:** render each hunk as a **semantic change description** ("File `auth.py`, line 47: removed `if (foo)`, added `if (foo && bar)`"), not a visual side-by-side diff read cell-by-cell.[^5]

### 3.4 First-run experience

On first launch (no project, no conversation, no agent configured), present a guided sequence, not a bare empty canvas:
1. Connect a model/agent (local Ollama/vLLM/llama.cpp/SGLang or hosted). Detected local backends pre-populate from the model-profile scan (Â§8.4).
2. Walk the trust-dial stops (Â§4.1) with one live, harmless example action shown at each stop (e.g., a read-only `ls` at "Ask always" vs. a scoped file write at "Ask on writes outside worktree").
3. **State and justify the default stop explicitly: `ConfirmRisky()`.** This is the only default consistent with Principle 4 and Principle 7 simultaneously. `NeverConfirm()` is opt-in-only and the wizard must say why.
4. Seed the "lines accepted without inspection" counter (Â§6.5) at zero with a one-line explanation.
5. Show a **sample** plan tree (clearly labeled "example") before the user has ever produced a real one.
- This flow is itself a Vibe Mode surface â€” no rail, no terminal, single-column, dismissible but re-invokable from settings. It does not need a third branch for a "Standard" onboarding path.[^5][^4]

**Phase 0 exit criterion addition:** first-run wizard ships with the Phase 0 baseline-metrics report and states the default trust-dial stop explicitly in its own UI copy.

### 3.5 Kinetic feedback layer

Static toasts/badges under-communicate agent state and risk severity. This is additive to Â§4.2 and Â§9, not a replacement:
- **Thinking/generating state:** organic, low-amplitude pulsing gradient (not a spinner), honoring `prefers-reduced-motion` by degrading to a static "active" badge.
- **Diff materialization:** in Vibe Mode, generated diffs stream and settle with a brief spring-physics entrance rather than appearing instantly; disabled under `prefers-reduced-motion`; never affects Pro Mode's virtualized diff rendering performance gates (Â§6.9) â€” decorative only, must not touch the render path measured by those gates.
- **Authorization card emphasis:** when a conversation enters `WAITING_FOR_CONFIRMATION`, the card visually steps forward on the z-axis with background context dimming behind it, implemented as elevation/shadow/backdrop treatment, not a true modal â€” must not block the emergency stop or trust-dial controls.
- This layer is cosmetic and explicitly out of scope for the Hard Constraints Checklist (Â§13) gates â€” it must never relax a Â§6.9 latency/fps/memory gate or a Â§7.3 accessibility gate.[^5]

### 3.6 Compare mode â€” demoted, design frozen

Given the stated single-model usage profile, Compare mode's Phase-2 promotion (from an earlier revision) is reversed:
- **Compare mode reverts to Phase 6, opt-in, low-priority** â€” built after the core Vibe/Pro single-model experience is solid.
- Its *design* is unchanged: **shared context baseline** (N parallel agents/models/worktrees start from an identical context snapshot); **diff-of-diffs** (semantic comparison between two agents' outputs); **cost/latency leaderboard** (live per-agent tokens, wall-clock time, test-pass rate, ranked strip above the grid); **three-way merge and conflict resolution** (base/agent-A/agent-B viewer with per-hunk selection, reusing the Â§6.6 review hierarchy); **explicit merge-back position** â€” Compare mode supports merging selected hunks from multiple agent outputs into one accepted patch set, but does **not** support full git-style automatic three-way merge with recursive conflict markers (anything more complex is a "pick one agent's output, discard the other" fallback with a stated reason logged to the Â§6.7 commit-trailer provenance); **isolation boundary display** (Git isolation vs. runtime isolation remains visually enforced, since parallel agents can share filesystem/CPU/memory/GPU even when separated by worktree).
- The Phase 2 diff-virtualization benchmark (Â§6.3, Â§6.9, Â§6.11) should still be built with Compare mode's eventual diff-of-diffs reuse in mind (same engine, same worker-thread architecture) â€” but **no Compare-specific UI ships before Phase 6**.
- **Speculative execution (Â§4.10)** is similarly demoted: the trust-dial-adjacent control, audit-log wiring, and budget pre-check still ship in Phase 1 (cheap, and other features depend on the audit-log pattern anyway); the actual worktree-fan-out execution ships with Compare mode in Phase 6.[^4][^5]

**Phase 6 exit criterion (when built):** Compare mode's diff-of-diffs and three-way merge viewer pass the same Â§6.9 virtualization gates as the single-agent diff view, using shared diff infrastructure; N>2 parallel worktrees render correctly and isolation-boundary visualization holds at scale.

***

## 4. Authorization â€” The Missing Primitive (Phase 1, highest priority)

### 4.1 Trust dial (not a checkbox)

A persistent, header-anchored control with discrete stops:

| Stop | Maps to | Behavior |
|---|---|---|
| Ask always | `AlwaysConfirm()` | Every action pauses for approval |
| Ask on risky | `ConfirmRisky()` | Only MEDIUM/HIGH risk actions pause |
| Ask on writes outside worktree | Custom `SecurityAnalyzerBase` subclass composed into `EnsembleSecurityAnalyzer`, feeding `ConfirmRisky()` | Read-only and in-scope writes proceed; out-of-scope pauses |
| Never | `NeverConfirm()` | Full autonomy â€” explicit opt-in only, clearly labeled |

**Hard correction (final, do not re-litigate):** `ConfirmationPolicyBase.should_confirm()` receives only a `SecurityRisk` enum value â€” path-scoping logic is architecturally impossible at the policy layer. The correct implementation is a custom `SecurityAnalyzerBase` subclass (whose `security_risk(action: ActionEvent)` DOES receive the full action) that elevates any out-of-worktree write to at least `MEDIUM`, composed into `EnsembleSecurityAnalyzer`, paired with standard `ConfirmRisky()`. Do not subclass `ConfirmationPolicyBase` for this stop.

- Must be settable **per task type**, not only globally.
- Must be **mutable mid-run without cancelling the conversation** â€” wire directly to `conversation.set_confirmation_policy()`.
- **Race-condition rule:** if the trust dial is made stricter while an action is `WAITING_FOR_CONFIRMATION`, that pending action is evaluated against the policy in force at the time it was raised and is never retroactively auto-approved or auto-rejected. If the dial is made looser mid-run, already-pending confirmations remain pending until the user explicitly acts â€” a dial change is never itself an implicit approval.[^1]

### 4.1.1 Policy-lock visualization

Add a small lock icon and tooltip on any pending authorization card: "Raised under 'Ask on risky' â€” a dial change won't affect this pending action." Makes the race-condition rule verifiable in the UI, not just true in the backend.[^5]

### 4.2 Interrupt / authorization cards

When the conversation enters `WAITING_FOR_CONFIRMATION`, render a rail-anchored card (visually distinct from a chat bubble) in the right conversation column containing:
- The exact command/patch/tool call about to execute.
- The risk level AND which analyzer flagged it (pattern / policy-rail / LLM / GraySwan / ensemble) plus stated rationale.
- Blast radius: files, paths, network hosts, credentials touched.
- If any upstream context item feeding this action was tagged untrusted per Â§4.9, display a distinct "derived from untrusted content" badge, separate from the risk badge.
- Three actions: **Approve** / **Reject with reason** (free-text required) / **Approve and relax for this class**.
- Wire Reject directly to `conversation.reject_pending_actions(reason)`.
- UX pattern references (interaction pattern only): `agentkitai/agentgate`, `agent-approval-card`, CopilotKit's human-in-the-loop example.

### 4.2.1 Authorization audit log

"Approve and relax for this class" is a privilege-escalation primitive. It needs persistence, expiry, and a review surface:
- Every approval, rejection-with-reason, and "relax for this class" event is written to a visible, exportable authorization log (timestamp, action, analyzer/risk context, user rationale if provided).
- Every "relax for this class" grant is **session-scoped and expires automatically at conversation end** â€” it never persists into a new conversation, even against the same worktree.
- The trust-dial widget displays a live badge count of currently-active relaxations for the session; clicking it opens the audit log filtered to relaxation events.
- Cross-links to the Â§10 Context Inspector's per-item provenance data.[^1]

### 4.3 Batching to avoid approval fatigue

- Batch low-risk items into a single review screen; interrupt immediately only for HIGH risk.
- Trigger confirmation for: deleting many files, writing outside the project root, reading `.env`/SSH keys/cloud credentials, network calls to new hosts, package installation, privileged commands, CI/CD config changes, `git push`, package publish, database migrations, browser control, first-time MCP server access.

### 4.4 Capability manifest

Each task carries a visible, human-readable capability envelope: repository read/write scope, shell permissions, network allow-list, secrets access, git push permission, cloud API access.

### 4.5 Emergency stop

A global, always-visible control distinct from "cancel conversation": pauses the loop, terminates active processes, revokes network access and credentials, freezes the worktree, captures an incident snapshot for later audit.

### 4.6 Isolation boundary must be visible

Visually distinguish Git isolation (branches/commits) from runtime isolation (processes/ports/GPU/credentials) â€” parallel agents can share filesystem/CPU/memory even when separated by worktree.

### 4.7 Vision-based browser fallback â€” elevated risk default

The vision-based browser-agent fallback is the highest prompt-injection surface in the feature set. Default it to confirm-by-default regardless of the global trust-dial setting, and keep it off the critical implementation path.

### 4.8 Close the `execute_tool()` bypass

Hard constraint: `conversation.execute_tool()` skips both the analyzer and confirmation policy. No UI affordance may route through it for anything above LOW risk. This constraint is materially relevant only for `LocalConversation` deployments â€” `RemoteConversation.execute_tool()` already raises `NotImplementedError`. Enforce regardless of deployment mode, but scope audit effort to local-mode code paths.

### 4.9 Untrusted-content provenance and prompt-injection surface

Every MCP tool output, fetched web page, third-party issue/PR comment, and file read from outside the user's own workspace is a potential injected-instruction vector.
- Every item that enters the Context Inspector (Â§10) must carry a **trust class**: `first-party` / `workspace-derived` / `third-party-untrusted`.
- Any `ActionEvent` whose justification traces back to a `third-party-untrusted` context item must propagate that flag into its authorization card (Â§4.2) as a distinct badge â€” injection risk and execution risk are different axes.
- Use the SDK's `state.block_action(reason)` / `state.block_message(reason)` as the enforcement point.
- Treat the open upstream OPA/Rego policy-guard proposal as the likely long-term home for this logic â€” design the hook-based interim implementation so it can be swapped for a Rego policy without UI changes.

### 4.10 Speculative execution â€” a trust-dial-adjacent mode (execution scope demoted)

A **"Speculative"** mode, implemented as a distinct opt-in action (not a trust-dial stop, since it changes *what runs*, not *what pauses*): the agent spawns N parallel attempts in disposable worktrees with varied prompts/constraints, auto-prunes failures against configurable criteria (tests fail, new lint errors, diff exceeds a size threshold), and surfaces only survivors for review.
- Speculative branches are tracked separately in the Â§4.2.1 audit log â€” they never inherit the current trust-dial stop's approval semantics implicitly; each survivor still goes through normal authorization for any action above LOW risk.
- Respects the Â§8.5 budget model â€” N parallel attempts multiply resource consumption and must be visibly counted against the active budget ceiling before spawning.
- **Scope:** the trust-dial-adjacent control, audit-log wiring, and budget pre-check ship in Phase 1; the actual multi-worktree spawn mechanism ships in Phase 6 with Compare mode, since it is the same disposable-worktree infrastructure and a single-model user rarely needs to spawn N parallel attempts.[^4][^5]

### 4.11 Stuck-state intervention surface (elevated priority)

`StuckDetector.is_stuck()` firing should trigger a dismissible-but-persistent card in the right conversation column (not a toast) with one-click actions:
- **Nudge: simplify the task** â€” injects a scoping-down instruction and resumes.
- **Nudge: add explicit constraint** â€” opens a one-line free-text field appended to the active task's context.
- **Nudge: switch model** â€” re-runs the current step against a different configured model profile (Â§8.4) with the same context.
- **Fork and restart from step N** â€” routes to the Â§5.5 fork-from-step mechanism at the last known-good step.
- **Kill and open post-mortem** â€” terminates the run, captures an incident snapshot, and opens a summary of the repeating pattern `StuckDetector` identified.
- Each card is logged to the Â§4.2.1 audit log with the chosen intervention.
- **Elevated priority rationale:** with a single dependable local model (no "just try a different parallel agent" fallback available by default), stuck-detection accuracy matters more, not less.[^5][^4]

**Phase 1 exit criteria (cumulative):** a user can approve, reject-with-reason, and adjust the trust dial mid-run without restarting the conversation; a pending action is never retroactively (auto-)approved by a mid-flight dial change; an untrusted-content-derived action correctly surfaces its provenance badge; a "relax for this class" grant correctly expires at conversation end and appears in the audit log; a synthetic stuck-loop scenario surfaces the intervention card within one configured cycle with all five actions wired; a synthetic hard-budget scenario correctly pauses with Extend/Review; the reliability-tier indicator and malformed-tool-call diagnostic (Â§8.6) pass synthetic tests; the cloud-fallback escape hatch preserves context across a model substitution.

***

## 5. Plan/Task Model â€” Durable Object, Not a Raw Event Projection (Phase 3)

### 5.1 Why binding directly to the event stream is wrong

The event log is a flat, append-only trace; a plan is a hierarchy of intent. Multiple `ActionEvent`s can share one `llm_response_id`, and third-party ACP agents (Codex, Claude Code, Gemini) don't necessarily expose OpenHands' own plan schema.

### 5.2 Existing precursor â€” extend, don't rebuild

`src/routes/planner-tab.tsx` already exists (`planContent` store field, "Create a Plan" empty state, `conversationMode === "plan"`). Evolve it into a plan workbench. Net-new schema required:

```text
Goal
  id, title, success_criteria[], status, created_from_event_id

Task
  id, parent_id, title, description, status, dependencies[],
  assigned_agent, worktree_id, scope_paths[], risk_level,
  acceptance_criteria[], evidence[], revision

Attempt
  id, task_id, start_event_id, end_event_id, model,
  tool_calls[], changed_files[], test_runs[], outcome
```

- Statuses: `proposed, approved, queued, running, waiting-for-user, blocked, validating, completed, failed, superseded, canceled`.
- Construction is hybrid: consume agent-emitted plan events when available; fall back to heuristic folding of the flat event stream for ACP agents without a plan schema.
- A live trace-to-plan projection service maps execution events onto the durable Plan object.
- Every `evidence[]` item and every context item feeding a Task's `acceptance_criteria[]` inherits the Â§4.9 trust class from its source. A plan built partly from third-party-untrusted evidence must surface that in the plan tree, not only in the Context Inspector.[^1]

### 5.2.1 Plan-level provenance gate

Display alone is insufficient (Principle 6 forbids relying on user diligence, and the same logic applies to provenance):
- If a Plan's aggregate evidence chain exceeds a configurable threshold (default 50%) tagged `third-party-untrusted`, task approval within that plan is blocked behind an explicit interstitial: "This plan is derived largely from untrusted sources â€” confirm you've reviewed the evidence chain before approving." Distinct from the per-action authorization card (Â§4.2).
- This confirmation is logged to the Â§4.2.1 audit log with the computed untrusted-evidence percentage at time of approval.
- The threshold is project-configurable; the current live percentage is visible in the plan-tree header at all times.[^5]

### 5.3 Drift detection â€” the differentiating feature

Explicitly render divergence wherever the trace disagrees with the declared plan step. Plan drift is the named failure mode of the Planning agentic pattern â€” surfacing it is the actual value of this zone.

### 5.4 Collaborative planning affordances

Support: approve the whole plan, edit task wording, reorder independent tasks, mark a task "do not touch," add an acceptance criterion, assign a task to another agent/model, retry from checkpoint, fork an alternative attempt, redirect only the active task, lock files/directories to a task, promote an agent-discovered issue into a new task.

### 5.5 Rewind and fork-from-step

- Truncate the event log at event *n*, restore the corresponding worktree commit, allow the user to edit the original prompt, and re-run.
- Expose "fork from here" as a plan-tree gesture on any completed step.
- Audit the shipped "branch a conversation from any message" feature (v1.2.0) first â€” do not duplicate.
- UX reference (interaction pattern only): `microsoft/agdebugger`'s interactive message viewer.
- Document non-rewindable side effects explicitly in the UI: files written outside the worktree, network calls already made, database writes, migrations already applied.
- **Plan-versioning rule on rewind:** rewinding to event *n* **forks** the Plan object at the corresponding Task/Attempt boundary rather than mutating it in place â€” the pre-rewind Plan revision remains inspectable and is linked from the new revision as "superseded-by-rewind." Never silently overwrite a Plan revision.[^1]
- **Non-determinism disclosure:** persistent (not one-time-tooltip) disclosure in the rewind/fork UI that re-running from a forked checkpoint against the same local model is not guaranteed to reproduce the original output â€” local inference is not deterministic across hardware/batching conditions even at temperature zero. Frame as "replay approximately" throughout the copy.[^4]

### 5.5.1 Fork taxonomy â€” one primitive, three UI entry points

Reconciles three overlapping concepts (shipped v1.2.0 conversation-branch, fork-from-step, Plan-revision fork on rewind):
- **One underlying primitive.** The v1.2.0 conversation-branch feature is the foundation â€” audited then extended, not duplicated. Both "fork from here" and "rewind to event *n*" invoke the same underlying fork primitive: truncate/branch the event log at a checkpoint, restore the worktree commit, create a new Plan revision linked to its predecessor.
- **Conversation view on fork:** forking always opens a **new conversation**, with a visible "forked from [original], step N" banner and a one-click link back to the source.
- **Plan revisions form a DAG, not a tree.** Because a rewind can target an already-forked step, render the plan-revision history with explicit "merged from" links at diamond points.
- **Merge-back position:** explicit non-support for automatic merge-back of a forked conversation into its source. A user combining work from two forks does so manually via Compare mode's three-way merge viewer (Â§3.6), not a dedicated conversation-merge feature.[^5]
- **Because parallel execution is rare in this deployment profile,** the diamond case will be encountered infrequently. The DAG-capable data model still ships as specified (cheap to build correctly from the start, expensive to retrofit) but its UI can render as a simple linear list in the common single-fork case, only surfacing graph/diamond rendering when an actual diamond exists.[^4]

### 5.6 Three layers of activity â€” never conflate

1. **Plan layer** â€” what should happen.
2. **Narrative layer** â€” a concise, human-readable account of what is happening and why.
3. **Event layer** â€” raw actions/observations/tool payloads/timestamps, available on demand.

### 5.7 Session Profile Card

A collapsible card in the right conversation column (Pro Mode) / expandable card in the conversation flow (Vibe Mode) that accumulates, per conversation:
- Observed style signals (verboseâ†”concise, defensiveâ†”optimistic, test-firstâ†”ship-first) â€” heuristically derived from accepted/rejected hunk patterns, not a separate LLM judgment call.
- Recurring failure patterns surfaced by `StuckDetector` or repeated rejections, each with a one-click "add as constraint" action.
- A free-text "brief the agent" scratchpad, scoped to the current conversation only â€” never silently persisted across conversations without an explicit "save as project preference" action.[^5]

**Phase 3 exit criteria (cumulative):** a redirected task correctly forks a new worktree from the specified step; drift between declared and observed steps is visibly flagged; a rewind correctly produces a new Plan revision linked to its superseded predecessor; a fork-from-step and a rewind both produce a correctly-linked new conversation; the plan-revision DAG renders correctly for the diamond (rewind-of-a-fork) case; a >50%-untrusted-evidence plan cannot have a task approved without the interstitial confirmation; the rewind/fork UI displays the "replay approximately" disclosure persistently, not as a dismissible one-time tooltip.

***

## 6. Change Review Workbench (Phase 2)

### 6.1 Existing precursors â€” audit first

`src/routes/changes-tab.tsx`, `commits-tab.tsx` (per-commit diffs, v1.5.0), `task-list-tab.tsx` already exist. Audit before introducing new workbench structure.

### 6.2 Target failure mode: rubber-stamping, not invisibility

Reviewers either rubber-stamp AI-generated diffs or over-scrutinize every line â€” both failure modes ship bugs. A beautiful diff view with a prominent "Accept All" button engineers the rubber stamp; design against this explicitly.

### 6.3 Diff rendering â€” benchmark before committing

Before Phase 2 build begins, explicitly benchmark two paths: (1) extend Monaco Diff Editor (already present), (2) port `react-virtualized-diff`. Choose based on measured performance against Â§6.9 â€” not a priori preference. Pin cold vs. warm cache, worker-thread vs. main-thread diff computation, a fixed reference hardware class.

**Fourth benchmark metric:** peak memory under a 50,000-line diff. For a workstation running a local LLM (Ollama/vLLM) alongside the GUI, memory contention â€” not frame drops â€” is the failure mode most likely to bite a local-LLM user. Measure it explicitly as a fourth gate alongside the three in Â§6.9.[^1]

### 6.4 Risk-ranked review, not alphabetical

Default sort by review priority: auth/secrets/migrations/CI config/dependency manifests first; generated files, lockfiles, test fixtures collapsed by default with a visible count.

### 6.4.1 Scope-shape review (closes the rubber-stamping gap)

Before a reviewer opens any individual file or hunk, present a single **scope-shape screen** above the file list showing:
- **Declared-vs-actual file scope:** files the plan (Â§5) declared it would touch vs. files actually touched, with any delta visually flagged.
- **"While I'm here" detector:** files modified with no corresponding plan task or acceptance criterion â€” agent-initiated scope expansions, never silently bundled into the same review pass as declared changes.
- **Test-claim summary:** for each test file added or modified, a one-line extracted claim of what it asserts, so a reviewer can judge whether the test proves what it claims before reading its implementation.

This converts review from "read N lines" to "verify five architectural claims" â€” the review discipline that survives agent-authored throughput. It is a gate the reviewer passes through before the existing risk-ranked file list (Â§6.4).[^5]

### 6.4.2 Vibe-coding-specific security checklist

Added to the scope-shape screen as a distinct, always-visible sub-panel (not buried in generic risk-analyzer output â€” these are the empirically most common, highest-impact AI-generated-code defect categories):
- Service-role/admin keys or secrets appearing in client-visible bundles or `NEXT_PUBLIC_`/`VITE_`-prefixed (or equivalent) environment variables.
- Database row-level-security policies newly set to permissive (e.g., `USING (true)`) or newly disabled.
- Storage buckets or endpoints newly flipped to public access.
- Webhook or callback handlers added without signature/HMAC verification.
- Hardcoded fallback secrets or credentials ("if the env var is missing").
- New dependencies added that cannot be resolved against a known package registry (possible hallucinated package name/version).
- CSRF protection absent on newly added state-changing endpoints.

Each flagged item routes through the existing risk-ranked file ordering (Â§6.4) at elevated priority â€” these checks fire before generic pattern-analyzer risk scoring.[^4]

### 6.5 Budgeted review sessions

When a turn exceeds a review-line threshold, refuse the single-pass affordance: split into review batches with a visible progress meter. "Accept All" above the threshold requires an explicit override step. **The threshold is user-configurable per project (default 400 lines), not hardcoded.** Combined with a persistent session-level "lines accepted without inspection" counter (data the Phase 0 baseline already requires capturing), this converts a brittle guardrail into a self-observed behavior signal.[^1]

### 6.6 Review hierarchy and acceptance semantics

Review operates at five levels: entire run â†’ task â†’ checkpoint â†’ file â†’ hunk.
1. Every agent turn begins from a known checkpoint.
2. Agent edits occur in a task-specific worktree.
3. The backend captures a turn-level patch and resulting filesystem state.
4. Review produces an accepted patch set distinct from the agent's raw output.
5. Rejecting a hunk reconstructs the accepted candidate from base + remaining accepted hunks.
6. Tests run against the raw result AND, before merge, against the accepted candidate.
7. **Accept â‰  merge. Merge â‰  push.**

### 6.7 Verification strip and author-class provenance

A persistent strip shows: last test run, pass/fail delta caused by this turn, coverage on changed lines. Every hunk carries an author-class tag â€” human / agent-assisted / agent-authored â€” persisted to commit trailers.

**Commit trailer format:** use a dedicated, machine-parseable trailer key rather than an ad hoc string:
```
X-Agent-Authored: true
X-Agent-Model: <model-id>
X-Agent-Review-Status: accepted-with-edits
```
Do not overload `Co-authored-by:` â€” that trailer has established Git tooling semantics (GitHub UI co-author attribution) that agent-authorship metadata would collide with. A dedicated `X-Agent-*` namespace keeps the door open for future SLSA-style provenance attestation.[^1]

### 6.8 Non-text and structural changes

Explicitly account for: new/deleted/renamed files, binary assets, lockfiles, database migrations, generated code, permission-bit changes, symlinks, submodules, large files, accidentally introduced secrets, infrastructure/environment files.

### 6.9 Engineering constraint â€” virtualization is mandatory

Diff computation happens server-side or in a worker; rendering uses row virtualization. Hard gates for the Phase 2 test suite:
- A 10,000-line diff must reach first paint under 200ms.
- Scroll through the same diff must sustain 60fps (no dropped-frame runs longer than 2 frames).
- Hunk-level keyboard navigation (`j`/`k`) must respond in under 50ms.
- Peak memory under a 50,000-line diff must stay within a documented ceiling (set the number once the Â§6.3 benchmark is run â€” do not ship without a measured figure).

### 6.10 "Why did you change this?" â€” generalized

Any event in the stream (plan step, terminal command, hunk) should support an inline "explain" affordance. Back this with `conversation.ask_agent(question)` â€” thread-safe, stateless, no persistence or event emission, callable concurrently with an active `run()` loop.

### 6.11 Semantic-diff comprehension benchmark (fifth Â§6.9 gate)

The Â§6.9 gates all measure rendering performance, not reviewer *comprehension*. For a 50,000-line diff, a reviewer's actual bottleneck is recognizing structural changes (function moved, symbol renamed, code extracted to a new file), not scrolling speed.
- Add a fifth, qualitative gate: given a synthetic diff with at least one moved function, one renamed symbol, and one extracted-to-new-file change, a reviewer using the shipped diff view must correctly identify each structural change in under 5 seconds per change, using whatever move/rename detection the chosen engine supports natively or via a lightweight AST-diff pass.
- If neither candidate engine supports this natively, this becomes an explicit build item â€” do not silently ship line-level diff for structural changes and call the gate "waived".[^5]

**Phase 2 exit criteria (cumulative):** a 10,000-line synthetic diff meets all four latency/fps/memory gates; the semantic-diff comprehension gate passes for all three structural-change types; "Accept All" above the configurable batch threshold requires explicit override; the scope-shape screen correctly flags at least one synthetic "while I'm here" modification and one test-claim mismatch; the vibe-coding security checklist correctly flags each of the seven named patterns in a synthetic test fixture.

***

## 7. Visual Design System (Phase 4)

### 7.1 Core visual language

- **Base:** deep lapis/monastery-night palette, `#040814`â€“`#0B132B`, luminance-stepped panels.
- **Accent:** saffron/amber (`#F59E0B` or `#FBBF24`) reserved **exclusively** for "agent active" states.
- **Typography:** highly legible geometric sans/monospace pairing for code, diffs, and metrics (tabular numerals for costs/timestamps); Vibe Mode's conversational surfaces may use a warmer, more expressive display face for headers only â€” never for code, diffs, or any surface subject to Â§7.3 contrast gates.
- **Green/red remain reserved strictly for diff and pass/fail status** â€” a semantic constraint that does not move with any aesthetic revision.

*(Rationale: the original zinc/Geist near-black palette was evaluated by design-council review; the lapis/saffron/Tibetan-inspired direction with a Motion/Aceternity/Magic UI stack was adopted per explicit user preference, with the underlying safety-relevant semantic constraints â€” accent-color budget, weight-tiering â€” preserved unchanged.)*[^5]

### 7.2 Material language

- **Glassmorphism is a first-class material.** Use `aceternity-ui`/`magic-ui` glass, glow-border, and gradient-mesh patterns for focus states, active-generation indicators, and card elevation in both Vibe and Pro Mode. Caps still apply wherever glass is used: â‰¤12px blur, semi-opaque tint layer beneath text, `@supports` fallback, never animate blur under `prefers-reduced-motion`, honor "reduce transparency."
- **Neobrutalist weight-tiering is preserved:** irreversible / consequential / routine action-weight tiers, mapped so "Accept All" is never the visually heaviest button on any review screen. This is a Hard Constraints Checklist item (Â§13).
- **Motion is a first-class citizen alongside state** (Â§3.5): thinking pulse, diff materialization, authorization-card z-axis emphasis.
- **Parallel-agent color exception budget:** accent = user attention/focus; each parallel run gets a desaturated identity hue that only reaches full saturation when focused.
- **High-contrast diff palette:** standard WCAG contrast on syntax-highlighted diff text against a dark background is frequently insufficient in practice. Ship a dedicated diff color palette, verified at 7:1 contrast for all diff token types (added/removed/moved/unchanged), part of the Â§7.3 CI-enforced token set.[^5]

### 7.3 Accessibility â€” CI-enforced acceptance criteria (not a late polish phase)

- Every theme token ships with a measured contrast ratio against its intended surface(s), checked automatically in CI.
- Minimum interactive-border alpha/luminance step meeting 3:1 non-text contrast.
- Non-color redundancy for all diff/status indicators â€” never green/red alone.
- Full keyboard navigation, logical focus order, visible focus states, roving tab index.
- `prefers-reduced-motion` and a "reduce transparency" toggle honored everywhere.
- Ship light theme, high-contrast theme, and density modes alongside dark-first.
- **Conformance labeling, corrected:** **Target Size Minimum (2.5.8)** is a Level **AA** criterion (interactive targets â‰¥24Ã—24 CSS pixels, or spaced so a 24px circle centered on each undersized target doesn't intersect another). **Focus Appearance (2.4.13)** is a Level **AAA** criterion, not AA â€” given the dark-first, keyboard-heavy nature of this tool, meeting 2.4.13 is still high-value and enforced as a blocking CI gate, but must be labeled accurately as "WCAG 2.2 AA conformance, plus 2.4.13 (AAA) enforced as a project-level requirement," never bundled as if 2.4.13 were baseline AA â€” this avoids a false conformance claim under external audit.[^1]
- Screen-reader mode extended to plan tree (flat list, parent refs) and diff view (semantic change descriptions), in addition to conversation/authorization-card/terminal surfaces.[^5]
- High-contrast diff palette verified at 7:1, added to the CI token-check set.

### 7.4 Keyboard model

Command palette (`âŒ˜/Ctrl+K`), zone/mode navigation (`âŒ˜1`â€“`âŒ˜4`), hunk-level review shortcuts (`j`/`k` navigate, `y`/`n`/`e` accept/reject/edit), pause shortcut, next-intervention shortcut, focus-mode toggle (`âŒ˜.`). All destructive shortcuts require explicit confirmation or route through a reversible staging step.

### 7.4.1 Vim-modal tier (Pro Mode only)

Expert throughput during batched review (Â§6.5's 400-line budget) is eaten by navigation friction with discrete hotkeys alone. Add, as a Pro Mode opt-in setting:
- A toggleable Vim-modal mode for the diff/review workbench, not merely Vim-style individual keybindings.
- A leader-key namespace for agent actions (e.g., `eader>ar` = "ask agent to explain this hunk," backed by `ask_agent()`).
- Macro recording for repetitive review patterns within a session.
- Entirely absent from Vibe Mode by design â€” an expert-throughput feature, not a discoverability requirement.[^5]

**Phase 4 exit criterion:** all shipped tokens â€” lapis/saffron palette and high-contrast diff palette â€” pass automated WCAG 2.2 AA contrast checks in CI; 2.5.8 (AA) and 2.4.13 (AAA, project-required) both enforced and accurately labeled; screen-reader mode functional across conversation, authorization-card, terminal, plan-tree, and diff-view surfaces; Vim-modal tier available and does not regress the base keyboard model.

***

## 8. Run Telemetry â€” Provider-Aware, Not a Dollar Sparkline (Phase 5, with a thin slice pulled into Phase 1)

### 8.0 Phase-1 telemetry seed

Extract a minimal telemetry strip â€” tok/s, VRAM used/total, context-window pressure % â€” and ship as part of Phase 1 rather than waiting for Phase 5. Instrumentation, not a feature â€” keep it out of Phase 1's scope-of-work estimate but in its delivery.

### 8.1 Provider-aware display

- **Hosted provider:** tokens, dollar burn rate, rate-limit headroom.
- **Local (Ollama / llama.cpp / vLLM / SGLang):** tok/s (prompt vs. generate, tracked separately), VRAM used/total, KV-cache occupancy, queue depth, a "degraded: layers offloaded to CPU" warning, benchmarked against a per-model baseline recorded on first run.
- **Universal:** context-window pressure %, wall-clock elapsed, turns since last human input, tool-call count, retry/error rate.
- **GPU temperature and power-draw-vs-power-limit** in the local-provider telemetry set, polled via vendor tooling (`nvidia-smi`/`rocm-smi`/`powermetrics`/`/sys/class/thermal` per Â§0) at the same cadence as tok/s sampling. On consumer GPUs under sustained multi-hour agent load, tok/s degradation is frequently thermal/power-limit throttling, not layer offloading; surface a distinct "degraded: thermal/power-limited" warning separate from the offload warning.[^1]
- **Diagnosed-state fusion:** when the offload warning and the thermal/power warning would both fire simultaneously (common, since thermal throttling is a frequent *cause* of offload decisions, not an independent event), the telemetry adapter must fuse them into one diagnosed message ("degraded: thermal throttling is causing layer offload") rather than two uncorrelated alerts.[^5]

### 8.2 Mandatory implementation detail

Telemetry MUST route through a versioned adapter layer you own. `StatsConversationStateUpdateEvent` does not exist â€” use the generic `ConversationStateUpdateEvent` (`key`/`value`).

### 8.3 Stuck detection

The SDK already ships `StuckDetector` with configurable thresholds and a dedicated `STUCK` execution status. Remaining work is wiring â€” surface `StuckDetector.is_stuck()` results as a non-blocking nudge in the UI (materially expanded to the Â§4.11 intervention card), expose thresholds in settings, never let `STUCK` render as a silent failure.

### 8.4 Model profiles

Reusable profiles for Ollama, vLLM, llama.cpp, SGLang, OpenAI-compatible endpoints, and ACP-backed harnesses, recording context limit, tool/vision support, endpoint, quantization, GPU assignment, data-egress status. **Schema additions** (stronger predictors of agentic reliability than parameter count or quantization alone):
- **Model generation/family version** (e.g., "Qwen3" vs. a hypothetical "Qwen2.5") â€” a distinct field from parameter count, since generation was found materially more predictive of tool-calling reliability than size within comparable families.
- **Architecture: dense vs. mixture-of-experts (MoE)** â€” tracked explicitly, since MoE variants (including Qwen3-30B-A3B) showed a distinct failure signature â€” emitting multiple tool calls per turn without reliable loop termination â€” that dense variants in the same range did not exhibit as frequently. **For the stated primary profile (Qwen3 27Bâ€“35B), default to assuming a dense variant unless confirmed MoE**, and surface the dense/MoE flag prominently.
- Auto-detect generation/architecture from Ollama/vLLM model manifest metadata; fall back to a manual field in the model-profile editor when unavailable.[^4]

### 8.5 Budget model

- **Scope:** per-conversation, with project-level defaults inherited at conversation start.
- **Denomination is provider-aware:** hosted provider â†’ dollar ceiling (soft + hard); local provider â†’ **wall-clock time or turn count**, since VRAM/thermal pressure is the actual binding constraint, not spend.
- **Soft limit:** non-blocking nudge to the "needs you" inbox with current consumption vs. ceiling.
- **Hard limit:** pauses the run (never kills it), presents a summary of what changed since conversation start, offers Extend or Review as the only two actions.
- **Orthogonal to the trust dial:** `NeverConfirm()` never bypasses a hard budget ceiling â€” full autonomy over authorization does not imply unlimited resource consumption.
- **Interaction with speculative execution (Â§4.10):** N parallel attempts are counted against the active budget ceiling before the user commits, displayed as a pre-spawn estimate.
- **Tool-call-depth ceiling, added as a distinct budget axis** independent of turn count and wall-clock time â€” because a single conversational "turn" can fan out into an unbounded chain of tool calls with no metered-billing-driven implicit ceiling for local providers. Local-provider budget gains a configurable maximum tool-call count per task; hitting it triggers the same soft/hard-limit UX. Hosted-provider dollar denomination is unchanged, since metered billing already governs there.[^4][^5]

### 8.6 Local tool-calling reliability posture

Distinguishes "the task is hard" from "the model can't reliably drive this tool-calling loop," with a defined vocabulary for local-model-specific failure signatures distinct from the cloud-oriented Â§9 error-class model:
- **Reliability tier display.** Each model profile carries a reliability-tier indicator (derived from observed session-level tool-call success rate, refreshed continuously), surfaced next to the model selector in both modes. For dense Qwen3 27Bâ€“35B, defaults to "high" based on published BFCL-class benchmarking, adjusting downward automatically if observed failure rate diverges.
- **Local-failure-signature vocabulary**, additive to the Â§9 three-class error model:
  - *Malformed tool-call output* â€” tool-call JSON fails to parse. Surfaced as retry-with-visible-diagnostic, not silent auto-retry.
  - *Tool-call abandonment* â€” model stops invoking tools mid-task and reverts to prose without completing the declared plan step. Surfaced distinctly from a normal task-completion message, cross-referenced against the plan's acceptance criteria.
  - *Circular retry* â€” model repeats a materially identical failing tool call in succession (what `StuckDetector` already catches generically); named explicitly here so the stuck-intervention card's "switch model" and "add explicit constraint" actions are pre-populated with local-model-appropriate defaults (a same-family Qwen3 quantization/context-window swap before suggesting an entirely different model family).
- **Cloud-fallback escape hatch, explicitly designed.** A single, low-friction action â€” from the stuck-intervention card and the model selector directly â€” to re-run the current task against a configured cloud fallback model without losing conversation/plan context. Not a mode switch; a per-task model substitution, logged to the same telemetry/budget systems, with budget denomination switching to dollars for the duration of that task only.
- **Tool/skill count warning.** Live count of active MCP tools/skills in the Context Inspector (Â§10) and Pro Mode's global command bar, with a soft warning at 30 concurrently enabled tools â€” informational only, since the threshold is heuristic.
- **Non-determinism disclosure** (see Â§5.5).

**Phase 1 exit criterion addition:** the reliability-tier indicator displays correctly for a loaded Qwen3 27Bâ€“35B profile; a synthetic malformed-tool-call-output scenario surfaces the correct distinct diagnostic; the cloud-fallback escape hatch preserves conversation/plan context across the model substitution.[^4]

***

## 9. Missing States (Phase 5)

- **WebSocket disconnect / sandbox death mid-run:** plan tree freezes at last known event with a "reconnecting" affordance; diff canvas remains usable (checkpoint-backed); conversation rail queues input rather than discarding it.
- Empty states for every zone (first run, no conversation selected, agent hasn't planned yet, zero diffs).
- Agent stuck/failing repeatedly: loop-detection surfacing (backed by `StuckDetector`, Â§8.3/Â§4.11), an escalation path when confidence is low or a task crosses a declared boundary.
- Cost/budget anxiety: a budget ceiling with soft and hard limits per Â§8.5.
- **Three-class error model** (never merge any two into one toast type): `AgentErrorEvent` (tool-call-scoped, LLM-visible, non-terminal â€” treat inline, low-severity, self-correcting); `ConversationErrorEvent` (conversation-scoped, NOT LLM-convertible, terminal â€” hard-stop, high-visibility); **partial streaming failure** (token stream dies mid-emission â€” render partial content with a visible "incomplete â€” stream interrupted" marker, never silently complete/discard, never auto-retry an interrupted above-LOW-risk action without confirmation).[^1]
- **Â§8.6's local-failure-signature vocabulary is additive to, not a replacement for, this three-class model** â€” the local failure signatures are UX-layer diagnostics derived from telemetry/pattern-matching; the three-class model remains the SDK-level event taxonomy all of them ultimately route through.[^4]
- **Notification model:** desktop notification (Electron packaging already in the stack) fires on run completion, run error, `WAITING_FOR_CONFIRMATION` raised, hard budget limit hit, `STUCK` detected. Every notification also writes to the "needs you" inbox and persists until explicitly acknowledged â€” desktop notification is a delivery channel, not the record of truth. Per-event-type notification preferences (enable/disable, sound on/off) in settings. Notifications are suppressed for events on a conversation the user is actively viewing.
- **Return-to-context re-orientation view:** when a user returns to a conversation after an async run, present a summary combining the plan tree's current state, the last N authorization decisions and outcomes, any drift flagged (Â§5.3), and current `STUCK`/error state â€” the narrative layer (Â§5.6) rendered as a re-entry surface.[^5]

***

## 10. Mission Control and Context (Phase 5)

- **Mission control dashboard:** homescreen listing all conversations with pause/resume/cancel, plus the "needs you" inbox.
- **Context Inspector:** exposes exactly what composes the next model call â€” prompt, system instructions, repo instructions, active skills, selected files, retrieved code, MCP outputs, conversation history, condensed summaries, persistent project memory â€” each tagged with source, creation time, why it was selected, approximate token cost, and whether it leaves the local environment, **plus the Â§4.9 trust class** and cross-linked to the Â§4.2.1 audit log where applicable.
- **Condensation UX, specified:** render as a two-pane view â€” left pane = forgotten events rendered as a collapsed conversation transcript (not raw IDs); right pane = the proposed summary, with inline annotations linking each summary sentence to the forgotten events it was derived from. Pinning operates on the left pane.[^5]
- **Markdown-first export, generalized:** default agent-authored docs to rendered Markdown with one-click PDF/DOCX export, plus a "use as context in new conversation" / AGENTS.md action.
- **Project Skill panel:** wired into existing skills/MCP configuration, exposed as a first-class, diffable, user-editable panel.
- **Air-gapped mode:** disables all network-dependent features (MCP, browser fallback, GitHub sync, any telemetry phone-home), displays a persistent "air-gapped" badge in the global command bar, tested in CI under network-namespace isolation. The natural extension of the existing `data-egress status` field in model profiles â€” from tracked to enforced. **Given the stated deployment profile (rare cloud usage), this mode will likely be active in most sessions** â€” its internal priority within Phase 5 is elevated relative to other Phase 5 items, though it remains scheduled in Phase 5 since it has no earlier-phase dependency.[^4][^5]

***

## 11. Development Plan â€” Vertical Slices, Not Theme-First

### Phase 0 â€” Baseline audit and instrumentation
Architecture decision (extend, not fork; archival question closed with a one-line log entry) + hands-on baseline metrics report from 5â€“10 real tasks run specifically against a dense Qwen3 27Bâ€“35B model, including GPU temp/power baseline (multi-backend abstraction) and the mental-model-formation baseline, plus the stock-Agent-Canvas regression baseline (permanent reference checkout, never a shipped mode).
**Exit criterion:** architecture decision record + baseline metrics report (Qwen3 variant/quantization, thermal/power, mental-model baselines) + first-run wizard shipped with its default trust-dial stop stated in-UI.

### Phase 1 â€” Authorization slice (Â§4, Â§8.0â€“Â§8.1 seed, Â§8.5, Â§8.6)
Trust dial (analyzer-based out-of-worktree implementation + mid-flight race-condition rule + policy-lock visualization), interrupt/authorization cards with analyzer-identity disclosure, reject-with-reason, per-step risk badges, capability manifest, emergency stop, `execute_tool()` bypass closure, untrusted-content provenance badges, authorization audit log with session-scoped relaxation expiry, thin telemetry seed (including multi-backend GPU thermal/power), speculative-execution audit-log/budget hooks (spawn mechanism deferred to Phase 6), stuck-state intervention surface with local-failure-signature-aware defaults, budget model **including the tool-call-depth ceiling**, cloud-fallback escape hatch, reliability-tier model-profile display.
**Exit criterion:** a user can approve, reject-with-reason, and adjust the trust dial mid-run without restarting the conversation; a pending action is never retroactively (auto-)approved by a mid-flight dial change; an untrusted-content-derived action correctly surfaces its provenance badge; a "relax for this class" grant correctly expires at conversation end and appears in the audit log; a synthetic stuck-loop scenario surfaces the intervention card and all five actions are wired; a synthetic hard-budget scenario correctly pauses with Extend/Review for both hosted-dollar and local-turn-count denominations; the reliability-tier indicator and malformed-tool-call diagnostic pass synthetic tests; the cloud-fallback escape hatch preserves context across a model substitution.

### Phase 2 â€” Change Review Workbench slice (Â§6)
Benchmark Monaco Diff Editor vs. `react-virtualized-diff` against the five-metric gate (first paint, scroll fps, hunk-nav latency, peak memory, semantic-diff comprehension) â€” built with future Compare-mode diff-of-diffs reuse in mind, but no Compare UI ships. Worker-side/virtualized diff rendering, risk-ranked file ordering, scope-shape review screen **plus the vibe-coding security checklist (Â§6.4.2)**, configurable batch-review gate (default 400 lines) with a persistent "lines accepted without inspection" counter, verification strip, author-class provenance via `X-Agent-*` commit trailers, precise accept/merge/push semantics, `ask_agent()`-backed explain affordance.
**Exit criterion:** a 10,000-line synthetic diff meets all four latency/fps/memory gates; the semantic-diff comprehension gate passes for all three structural-change types; "Accept All" above the configurable threshold requires explicit override; the scope-shape screen correctly flags a synthetic "while I'm here" modification and test-claim mismatch; the security checklist correctly flags each of the seven named patterns in a synthetic fixture.

### Phase 3 â€” Plan/drift/rewind slice (Â§5)
Extend `planner-tab.tsx` into a durable Plan object + hybrid trace projection + drift indicator + fork taxonomy (DAG-capable data model, list-rendered UI in the common single-fork case) + explicit Plan-revision forking on rewind + plan-level provenance gate + Session Profile Card + non-determinism disclosure in rewind/fork UI. Audit the shipped v1.2.0 conversation-branch feature first.
**Exit criterion:** a fork-from-step and a rewind both produce a correctly-linked new conversation; the plan-revision DAG renders correctly for the diamond (rewind-of-a-fork) case; a >50%-untrusted-evidence plan cannot have a task approved without the interstitial confirmation; the rewind/fork UI displays the "replay approximately" disclosure persistently, not as a dismissible tooltip.

### Phase 4 â€” Design system extraction (Â§7)
Extract tokens from Phases 1â€“3: lapis/saffron visual language, contrast-verified tokens in CI including the high-contrast diff palette, neobrutalist weight tiers preserved, glassmorphism as first-class material via Aceternity/Magic UI, light/high-contrast/density themes, full keyboard model plus Vim-modal tier, screen-reader mode extended to plan tree and diff view (in addition to conversation/authorization-card/terminal).
**Exit criterion:** all shipped tokens pass automated WCAG 2.2 AA contrast checks in CI, plus 2.4.13 enforced as an accurately-labeled project-level AAA requirement; screen-reader mode functions across all five surfaces; Vim-modal tier does not regress the base keyboard model.

### Phase 5 â€” Async, telemetry, and mission control (Â§8, Â§9, Â§10)
"Needs you" inbox, full provider-aware Run Telemetry strip with diagnosed-state fusion, model profiles with generation and dense/MoE fields, `StuckDetector` UI wiring (not a rebuild), mission-control dashboard, Project Skill panel, Context Inspector with trust-class tagging cross-linked to the audit log, condensation preview two-pane view, notification model, air-gapped mode (elevated internal priority, unchanged schedule), three-class error model including partial-streaming-failure handling.
**Exit criterion:** notifications correctly deliver for all five specified event types with inbox persistence; air-gapped mode passes CI under network-namespace isolation; model profiles correctly populate generation and architecture fields for a loaded Qwen3 checkpoint.

### Phase 6 â€” Compare mode and multi-agent orchestration [optional/low-priority, deferrable indefinitely]
Compare mode's full design (shared-context baseline, diff-of-diffs, three-way merge, cost/latency leaderboard, isolation-boundary enforcement) and the speculative-execution multi-worktree spawn mechanism both ship here, reusing Phase 2's diff infrastructure and Phase 1's audit-log/budget hooks respectively. **This phase may be deferred indefinitely without blocking the core product** â€” the two-mode Vibe/Pro experience is complete and usable without it.
**Exit criterion:** N>2 parallel worktrees render correctly in Compare mode; isolation-boundary visualization holds at scale; Compare mode's diff-of-diffs/merge viewer pass the same virtualization gates using shared infrastructure â€” explicitly non-blocking for a "done" release.

### Phase 0/Phase 1 boundary â€” Spec Wizard (Â§14)
Ships early enough to be usable for the project's own subsequent-phase specification (dogfooding), rather than deferred to Phase 5. See Â§14.7 and Â§14.10 exit criteria below.

***

## 12. Portable Components â€” Use, Don't Rebuild

| Sub-problem | Component | Integration note |
|---|---|---|
| Diff virtualization | `react-virtualized-diff` (`diff` + `react-virtuoso`) | Benchmark against Monaco Diff Editor first (Â§6.3) using the five-metric gate |
| Terminal pane | `Qovery/react-xtermjs` | No OpenHands-specific logic; port as commodity UI |
| Command palette | `cmdk` / `react-cmdk` | No OpenHands-specific logic; port as commodity UI |
| Rewind/fork-from-step UX reference | `microsoft/agdebugger` | Interaction pattern only (AutoGen-based); do not port backend |
| Authorization card UX reference | `agentkitai/agentgate`, `agent-approval-card`, CopilotKit human-in-the-loop example | Interaction pattern only â€” rewire to `reject_pending_actions()` / `set_confirmation_policy()` |
| Stuck detection | `StuckDetector` (already in `openhands-sdk`) | First-party SDK code. Wire directly; do not rebuild |
| Explain affordance backing | `conversation.ask_agent()` (already in `openhands-sdk`) | Thread-safe, stateless, no event emission; use directly for Â§6.10 |
| Untrusted-content enforcement (interim) | `state.block_action()` / `state.block_message()` (already in `openhands-sdk`) | Interim enforcement point for Â§4.9; monitor upstream OPA/Rego policy-guard proposal |
| GPU/accelerator telemetry | `nvidia-smi` / `rocm-smi` / `powermetrics` / `/sys/class/thermal` | Adapter must detect and abstract across all four backends |
| Motion/visual stack | `framer-motion`, `aceternity-ui`, `magic-ui` | Vite/React-native, Tailwind-compatible; use for kinetic feedback (Â§3.5), lens transitions (Â§3.0), glass/glow material language (Â§7.2) â€” do not hand-roll equivalent CSS |
| Screen-reader mode reference | VS Code's screen-reader-optimized mode | Interaction pattern only; extend to plan-tree flat-list and diff semantic-description renderings (Â§3.3) |
| Spec Wizard: thinking-model routing | SDK's built-in `switch_llm` tool (`openhands-sdk/openhands/sdk/tool/builtins/switch_llm.py`) | Already exists to let a conversation switch its bound LLM mid-run; use directly for Â§14.9, no new LLM-switching infrastructure needed |
| Spec Wizard: web search | SDK's MCP integration (`create_mcp_tools()`, stdio/HTTP/SSE transport) | For air-gapped mode, swap the configured MCP server to a self-hosted SearXNG instance rather than a third-party API â€” a server-swap, not a different code path |

**Non-finding, confirmed unchanged across all revisions:** the durable Plan object, drift detection, capability manifest, and the Compare-mode merge logic remain fully new-build work dependent on OpenHands-specific event schema.

***

## 13. Hard Constraints Checklist (verify before every PR)

- [ ] No UI path calls `conversation.execute_tool()` for anything above LOW risk (Â§4.8), scoped correctly to `LocalConversation`.
- [ ] Every reject action requires and passes a free-text reason to `reject_pending_actions(reason)` (Â§4.2).
- [ ] Trust dial changes call `set_confirmation_policy()` and do not require conversation restart (Â§4.1).
- [ ] The "writes outside worktree" trust-dial stop is implemented as a custom `SecurityAnalyzerBase`, NOT a custom `ConfirmationPolicyBase` (Â§4.1).
- [ ] A pending action's confirmation policy is locked to the policy in force when it was raised â€” mid-flight trust-dial changes never retroactively (auto-)approve or (auto-)reject it (Â§4.1).
- [ ] Risk badges display analyzer identity (pattern/policy-rail/LLM/GraySwan/ensemble), not just a risk level (Â§4.2).
- [ ] Untrusted-content provenance badges are visually distinct from risk badges on authorization cards (Â§4.9).
- [ ] Every approval, rejection, and "relax for this class" grant is written to the authorization audit log; relaxation grants expire at conversation end (Â§4.2.1).
- [ ] `AgentErrorEvent`, `ConversationErrorEvent`, and partial-streaming-failure states never share the same UI treatment (Â§9).
- [ ] All telemetry reads route through your versioned adapter, never a hardcoded `StatsConversationStateUpdateEvent` reference (Â§8.2).
- [ ] Local-provider telemetry distinguishes thermal/power-limit degradation from layer-offload degradation, fused into one diagnosed message when both fire simultaneously (Â§8.1).
- [ ] Any diff view enforces all four Â§6.9 gates (first paint, scroll fps, hunk-nav latency, peak memory) before shipping, plus the fifth semantic-diff comprehension gate (Â§6.11).
- [ ] "Accept All" is never the heaviest-weight button on any review screen (Â§7.2).
- [ ] The batch-review line threshold is user-configurable, not hardcoded, and a "lines accepted without inspection" counter is persisted per session (Â§6.5).
- [ ] Agent-authored commit trailers use the `X-Agent-*` namespace, not `Co-authored-by:` (Â§6.7).
- [ ] Every new theme token has a CI-checked contrast ratio; 2.5.8 is labeled AA and 2.4.13 is labeled AAA â€” never bundled under one "AA" claim (Â§7.3).
- [ ] Screen-reader mode is detectable and functional across conversation, authorization-card, terminal, plan-tree, and diff-view surfaces (Â§3.3, Â§7.3).
- [ ] Non-rewindable side effects are explicitly surfaced in any rewind/fork-from-step UI, and a rewind produces a new Plan revision rather than overwriting the prior one (Â§5.5).
- [ ] Fork-from-step, rewind, and the v1.2.0 conversation-branch feature route through one shared primitive; plan-revision history renders as a DAG, not an assumed tree (Â§5.5.1).
- [ ] Before adding a new tab/route, confirm it doesn't duplicate an existing one â€” extend in place.
- [ ] `StuckDetector` is wired directly, not rebuilt (Â§8.3, Â§12).
- [ ] `ask_agent()` backs the explain affordance, not a bespoke call (Â§6.10, Â§12).
- [ ] Any action rated LOW risk under the current trust dial produces zero modal interruptions (Principle 7, Â§1).
- [ ] Trust-class tags (Principle 8) are consistently visible across the Context Inspector, authorization cards, and plan evidence chains â€” not confined to Â§4.9 alone.
- [ ] A plan exceeding the configurable untrusted-evidence threshold blocks task approval behind an explicit interstitial, distinct from the per-action authorization card (Â§5.2.1).
- [ ] The scope-shape review screen (declared-vs-actual file scope, "while I'm here" detector, test-claim summary) renders before hunk-level review is reachable (Â§6.4.1).
- [ ] Budget ceiling is denominated correctly per provider (dollars for hosted, time/turns for local) and is orthogonal to the trust dial â€” `NeverConfirm()` never bypasses a hard budget limit (Â§8.5).
- [ ] Kinetic-feedback/motion treatments never relax a Â§6.9 diff-performance gate or a Â§7.3 accessibility gate (Â§3.5, Â§7.2).
- [ ] Authorization-card actions above read-only are unavailable below the 900px breakpoint; hunk-level swipe review remains available (Â§3.2).
- [ ] Vibe Mode and Pro Mode share one data model; switching lenses never triggers a route change, data refetch, or loss of in-progress input (Â§3.0, Principle 9).
- [ ] Notifications for the five specified event types write to the "needs you" inbox as the record of truth, independent of desktop-notification delivery success (Â§9).
- [ ] Air-gapped mode passes CI under network-namespace isolation with all network-dependent features disabled (Â§10).
- [ ] The mode toggle in the global command bar is a binary control (Vibe/Pro), never a segmented control implying a third state (Â§1 Principle 9, Â§3.0).
- [ ] Stock/unmodified Agent Canvas is never exposed as a runtime-selectable mode, settings option, or documented user-facing surface (Â§3.0.1).
- [ ] Model profiles record generation/family version and dense-vs-MoE architecture as fields distinct from parameter count and quantization (Â§8.4).
- [ ] The local-provider budget ceiling includes a tool-call-depth axis independent of turn count and wall-clock time (Â§8.5).
- [ ] Malformed-tool-call-output, tool-call-abandonment, and circular-retry are each surfaced with a distinct diagnostic, not folded into one generic error toast (Â§8.6).
- [ ] The cloud-fallback escape hatch preserves conversation and plan context across a per-task model substitution, and correctly switches budget denomination to dollars only for the duration of that substituted task (Â§8.6).
- [ ] Rewind/fork UI displays a persistent "replay approximately, not exactly" disclosure, not a dismissible one-time tooltip (Â§8.6).
- [ ] No Compare-mode or speculative-execution worktree-spawn UI ships before Phase 6; Phase 1â€“5 deliverables function correctly with these features entirely absent (Â§3.6, Â§11).
- [ ] The scope-shape review screen's vibe-coding security checklist (Â§6.4.2) fires before generic pattern-analyzer risk scoring for its seven named categories.

***

## 13a. Hard Constraints Checklist â€” Spec Wizard additions (Â§14)

- [ ] The Spec Wizard never bypasses the Change Review Workbench (Â§6) or authorization architecture (Â§4) for any code generated from its output â€” a wizard-produced spec is an *input* artifact only, never an execution-privilege shortcut.
- [ ] Every requirement in a wizard-produced draft spec is expressible in one of the five EARS patterns, or the draft is returned to Clarify rather than shipped with an unclassifiable requirement (Â§14.4).
- [ ] The gap report (Â§14.5) is presented as a distinct artifact from the draft spec, never silently merged into it or silently gating approval without user visibility.
- [ ] Clarification question batching follows the same highest-impact-unknowns-first, bounded-batch discipline used elsewhere in this project's own workflow â€” never a single overwhelming questionnaire (Â§14.3.2).
- [ ] A trivial/small request can skip full four-phase ceremony via an explicit fast-path, and this is a wizard-recommended default based on apparent request size, not a hidden setting (Â§14.6).
- [ ] Web search fires only on trigger conditions (external library/API/integration references, security-pattern verification, duplication/feasibility checks) â€” not on every wizard invocation, and never when air-gapped mode is active (Â§14.8).
- [ ] Any requirement or gap-report item shaped by a web-search result carries trust-class provenance tagging and an inline source reference visible in the structured-requirement view (Â§14.8).
- [ ] When air-gapped mode is active, the wizard explicitly flags any requirement that would normally have been web-verified as unverified, rather than silently proceeding (Â§14.8).
- [ ] The wizard routes Clarify/Gap-report passes to a model tagged "thinking" in the model-profile system when more than one local model is configured, and degrades to the single configured model without error when only one exists (Â§14.9).
- [ ] The wizard's UI attributes each phase's output to the specific model that produced it, distinct from the active build conversation's model indicator (Â§14.9).
- [ ] The Spec Wizard's Agent is never granted the build agent's bash/file-edit tools â€” its tool set is restricted to search and structured-output tools only, enforced at the SDK Conversation level, not just by prompt instruction (Â§14.10).
- [ ] The Spec Wizard runs as its own SDK Conversation, distinct and independently visible from any build conversation, and is never implemented as frontend-only logic calling a shared conversation (Â§14.10).

***

## 14. Spec Wizard â€” Natural-Language-to-Build-Spec Conversion

### 14.1 Rationale

The 2026 tooling landscape has converged on a four-phase pattern for turning natural language into a build-ready artifact â€” Specify â†’ Clarify â†’ Plan â†’ Tasks â€” implemented across GitHub Spec Kit, AWS Kiro, Tessl, and Cursor Plan Mode, each treating the clarification step as the phase that "pays for itself even if you throw away the generated code," since surfacing ambiguity is itself the valuable output. This validates building a Spec Wizard rather than relying on ad hoc back-and-forth: the pattern is proven, widely adopted (GitHub Spec Kit alone has 90,000+ stars and supports 30+ agents), and addresses the dual-workflow reality â€” sometimes you hand OpenHands a structured spec, sometimes you describe intent in natural language, and the second case currently has no on-ramp to the rigor of the first.

The Spec Wizard is **not** a replacement for OpenHands' own planning/task-decomposition behavior (Â§5) â€” it operates one level upstream, converting a natural-language request into a structured build spec *before* a conversation/plan is created.[^2]

### 14.2 Where it lives

A **Vibe Mode-native entry point**, consistent with Principle 9 â€” the natural on-ramp for "I just described what I want," never requiring a switch to Pro Mode. Invoked by:
- A dedicated action in the first-run wizard (Â§3.4) and the "new conversation" flow generally â€” "Describe what you want built" vs. "Paste a build spec," offered as two equally first-class entry paths.
- Direct paste of an existing structured spec (bypasses elicitation, routes straight to validation/gap-check â€” Â§14.5).

### 14.3 The four-phase loop

1. **Capture.** The user describes intent in free-form natural language â€” no structure imposed.
2. **Clarify.** The wizard analyzes for ambiguity, missing constraints, and undeclared scope, asking targeted questions **one focused batch at a time** â€” mirroring the `clarifying_questions` discipline (highest-impact unknowns first, 2â€“4 concrete options per question, always allow free-text override). Categories the wizard must probe:
   - **Success criteria** â€” what does "done" look like, concretely and testably (the EARS-style discipline, applied conversationally).
   - **Scope boundaries** â€” what is explicitly out of scope, not just what's in scope.
   - **Edge cases and error behavior** â€” empty states, failure states, concurrent-access semantics.
   - **Non-functional constraints** â€” performance, accessibility, security posture, and (specific to this project) trust-dial default and budget ceiling for the resulting task.
   - **Existing-system integration** â€” for a brownfield change, which existing files/routes/components does this touch, and does it duplicate something that already exists (reusing the "audit first" discipline of Â§5.2, Â§6.1).
3. **Draft.** The wizard generates a structured spec in this document's own section format (Governing principles â†’ Requirements â†’ Constraints â†’ Exit criteria) or a lighter single-feature variant for small requests â€” output proportional to the request's actual size.
4. **Confirm.** The user reviews the draft as an editable, diffable artifact (reusing Markdown-first rendering, Â§10) before it becomes the active spec for a build. Editing the draft and re-running clarification on just the edited section is supported.[^2]

### 14.4 Structured requirement authoring using EARS

Freeform requirements are a documented source of ambiguity. Adopt EARS (Easy Approach to Requirements Syntax â€” Rolls-Royce, now a Spec Kit extension) constraining requirements into five testable patterns (Ubiquitous, Event-Driven, State-Driven, Unwanted Behavior, Optional Feature) using `shall`/`when`/`while`/`if-then`/`where`. Adopt this as the **internal requirement-authoring format**, not a syntax the user types:
- The Draft phase internally expresses each requirement in EARS form, e.g., a captured "handle failed logins gracefully" becomes "**If** an invalid password is entered, **then** the system **shall** display a specific, non-enumerable error message" â€” shown as a natural-language gloss by default, with a "view as structured requirement" toggle for inspection/hand-editing.
- Closes a specific, common gap: EARS's "Unwanted Behavior" (If/Then) pattern systematically forces an error-case question for every requirement.
- Where a requirement cannot be cleanly expressed in one of the five patterns, the wizard treats that as a signal the requirement is still ambiguous and returns to Clarify rather than forcing a bad fit.[^2]

### 14.5 Gap and risk flagging (distinct from clarification)

A separate, later pass on the completed draft (whether wizard-generated or pasted), analogous to Spec Kit's `/analyze` and `/checklist`:
- **Consistency check:** do the draft's requirements contradict each other or this project's frozen architectural decisions (Â§0's EXTEND-not-fork, Â§4's authorization primitives, Â§13's Hard Constraints)? Flag any requirement that would violate a Hard Constraints item before the build starts.
- **Duplication check:** does this re-describe something already in the current codebase (audit-before-building discipline already applied to `planner-tab.tsx`, `changes-tab.tsx`, etc.)?
- **Security/scope-shape pre-check:** run the Â§6.4.2 vibe-coding security checklist categories as a **pre-build** question set â€” e.g., if intent involves "add a webhook" or "add file storage," proactively ask about signature verification or access scope during Clarify rather than catching the omission at Change Review.
- **Local-model feasibility flag (Â§8.6):** if the draft's scope implies a task complexity/tool-count profile known to strain the target model's reliability tier, flag this explicitly before the build starts, offering the cloud-fallback escape hatch pre-emptively rather than discovering it mid-build via a stuck-loop.
- Output: a distinct **gap report**, separate from the draft spec, presented before "Confirm," so the user approves the spec and gap report together.[^2]

### 14.6 Non-goals and honest limitations

- **Does not eliminate spec drift.** Once a build starts, the executing agent's interpretation can still diverge over a long-running task â€” a documented, currently-unsolved problem across the SDD category. The wizard's job is a good starting spec, not runtime conformance guarantee; Â§5.3's drift-detection is the correct place for that concern.
- **Not mandatory overhead for every request.** Consistent with Principle 6, trivial/exploratory requests get a fast "skip clarification, just draft" path â€” the wizard recommends its own depth based on apparent size/risk, not forcing every "fix this typo" through the full ceremony.
- **Does not replace human review of generated code.** It only improves the quality of the *input*; Â§6's Change Review Workbench remains the checkpoint for the *output*.[^2]

### 14.7 Phase placement

The Spec Wizard depends on nothing from Phase 1â€“5 except the Markdown rendering (Â§10) and the model-profile reliability tier (Â§8.6). Scoped as **Phase 0/Phase 1 boundary work** â€” it should ship early enough to be usable for the project's own subsequent phases (dogfooding), rather than deferred to Phase 5.

**Exit criterion:** a natural-language request of moderate complexity (e.g., "add file upload with virus scanning") produces, via the four-phase loop, a structured spec whose requirements pass EARS-pattern validation, whose gap report correctly flags at least one security pre-check item (unscanned-file-execution risk) and one local-model feasibility consideration, and which the user can approve, edit, or send back to Clarify without restarting the whole flow.[^2]

### 14.8 Web search grounding

The Clarify/Draft phases and the Gap/Risk report frequently need current, external information the model's training data cannot reliably supply â€” current library/API versions, whether a package name exists on a registry (serving the duplication/hallucination check in Â§14.5), current CVEs, or best-practice patterns for a vaguely-described integration.
- **Grounding discipline, not optional enrichment.** The model is never permitted to answer a factual/external/version-sensitive question from memory alone when a search tool is available â€” it must search first, and if no relevant result is found, say so explicitly ("I couldn't verify this â€” proceeding without confirming Stripe's current webhook signature format") rather than fabricate.
- **Trigger conditions, not always-on.** Web search fires specifically when the captured request references a named external library/framework/API/SaaS integration; a security-relevant pattern where current best practice matters; or a duplication/feasibility check. Purely internal, project-specific requests never trigger a search â€” keeps the wizard fast/offline for the common case (Principle 7, air-gapped-mode design).
- **Air-gapped mode interaction.** When active, web search is unavailable by definition. The wizard must detect this and explicitly downgrade its confidence in any draft requirement that would normally have been grounded by a search, surfaced in the gap report, never silently omitted.
- **Provenance tagging.** Any requirement or gap-report item derived from a web search carries the project-wide trust-class tagging â€” `third-party-untrusted` by default unless resolving to an official/first-party source (official docs, the package registry itself), in which case tagged `workspace-derived`-equivalent.
- **Citation surfacing in the draft spec.** Where a requirement was shaped by a specific search result, the draft spec retains an inline reference, visible in the "view as structured requirement" toggle â€” auditable in the same way this project's own research reports are.[^6]

### 14.9 Dedicated thinking-model routing for the wizard

The Clarify, Draft, and Gap-report phases are reasoning-heavy in a way the fast, high-frequency tool-calling build loop is not â€” route reasoning-heavy, low-frequency steps to the most capable available model, reserving the fast/high-volume path for the build conversation.
- **The wizard is a distinct model consumer,** entitled to route to a different model. The model-profile system (Â§8.4) gains a designated **"thinking" role tag**. If more than one local model is configured, the wizard defaults to the model tagged "thinking," not necessarily the model active in the build conversation.
- **Single-model deployments degrade gracefully** â€” consistent with Principle 10, if only one local model is configured, the wizard simply uses it; the thinking-role tag is an optional override, never a hard requirement.
- **Reasoning-mode activation** where the model supports it â€” enabled specifically for Clarify/Gap-report, may be disabled for the lighter Draft-formatting pass.
- **Explicit model attribution in the UI** â€” the wizard states which model produced each phase's output (e.g., "Clarify pass run with: Qwen3-32B-Thinking"), preventing confusion with the active build model.
- **Budget and telemetry accounting** â€” wizard-driven thinking-model usage is tracked against the same Â§8.5 budget model as build-conversation usage.
- **Cloud-fallback interaction** â€” extends naturally: if no local model is tagged "thinking" and the available model's reliability tier is insufficient for a high-stakes Clarify pass, the wizard may offer the same cloud-fallback option specified for build tasks.[^6]

**Phase 1 exit criterion addition:** given two configured local models where one carries the "thinking" role tag, the wizard's Clarify and Gap-report passes route to the tagged model by default; the UI correctly attributes each phase's output to the model that produced it; a synthetic air-gapped-mode test correctly suppresses web search while surfacing the "could not verify" disclosure rather than silently proceeding as if the search had succeeded.

### 14.10 Implementation architecture: native SDK feature, not a generic plugin

Three architectural options were evaluated; **Option C is adopted**:

- **Option A â€” Pure GUI-layer feature (rejected).** The wizard needs its own LLM calls, its own tool access (web search), and its own short-lived execution loop distinct from a build conversation â€” none of which the frontend can or should implement.
- **Option B â€” A generic OpenHands Plugin (rejected as primary).** OpenHands' plugin system is designed for portable, install-and-restart bundles extending *an agent's* capabilities inside a normal build conversation. The Spec Wizard is architecturally prior to that â€” it runs *before* a build conversation/plan exists and needs deep read/write access to OH-GUI-specific systems (Â§8.6's reliability tiers, Principle 8's provenance, Â§8.5's budget model, Â§14.5's gap-report UI) that a generic plugin has no contract for.
- **Option C â€” Adopted: a first-party OH-GUI feature on native SDK primitives:**
  - **A dedicated, short-lived SDK `Conversation`/`Agent` instance** (`openhands.sdk`), separate from the build conversation it eventually hands off to â€” its own LLM binding, its own restricted tool set, its own event log. Spun up when the wizard session starts, torn down/archived once the draft spec is approved.
  - **A restricted custom tool set** using the SDK's standard Action/Observation/Executor pattern â€” deliberately **not** granting the build agent's usual bash/file-edit tools, satisfying Â§14.6's non-goal and the Hard Constraints Checklist item that the wizard never bypasses Change Review or authorization architecture.
  - **Web search (Â§14.8) via MCP**, not a custom-built search tool â€” the SDK's existing MCP integration already supports this pattern generically. For air-gapped mode, swap the configured MCP server to a self-hosted SearXNG instance.
  - **Thinking-model routing (Â§14.9) via the SDK's built-in `switch_llm` tool** â€” already exists to let a conversation switch its bound LLM mid-run; the model-profile system supplies the role-tagged model identifier, and the wizard's Agent calls `switch_llm` to bind to it for Clarify/Gap-report, switching back for lighter Draft work.
  - **GUI surface is a thin client** over this backend feature â€” chat-like interaction, question batching, draft/gap-report rendering, and the "view as structured requirement" toggle are frontend presentation over the SDK Conversation's event stream, using the same Markdown-first rendering already specified in Â§10.
  - **Future portability is not foreclosed:** if there's later interest in a portable, independently-installable Spec Wizard, the correct path is to extract the already-decoupled pieces (custom tools, MCP config, wizard Agent's system prompt/skill) into a plugin bundle *after* the fact.[^4]

**Exit criterion:** the wizard's Agent runs as a distinct SDK Conversation with its own event log, visibly separate from any build conversation in the mission-control dashboard (Â§10); its web-search tool is configured via MCP with a confirmed air-gapped-mode SearXNG fallback; a synthetic test confirms `switch_llm` is invoked before the Clarify pass when a "thinking"-tagged model differs from the wizard's default binding.

***

## Appendix â€” Integration Notes and Superseded Content (for traceability only)

The following ideas appeared in intermediate revisions and are **explicitly not part of this final integrated spec** â€” they are noted here only so the build team does not accidentally resurrect them:

- **Three-layout Vibe/Standard/Pro exploration** â€” rejected; superseded by the two-mode decision (Â§1 Principle 9, Â§3.0, Â§3.0.1).[^4]
- **Compare mode as a Phase 2 promotion** â€” an earlier revision (v2.2) materially expanded and promoted Compare mode to Phase 2 as "the product's differentiator." This was reversed once the single-model Qwen3 usage profile was established; Compare mode's *design* is fully preserved (Â§3.6) but its *build priority* reverts to Phase 6.[^4][^5]
- **"OpenHands/agent-canvas is possibly still active" uncertainty** â€” an early revision (v2.0) flagged conflicting signals about the standalone repo's archival status and scheduled a diffing investigation. This was fully resolved: the repo is confirmed archived (July 27, 2026), and the investigation task was deleted from Phase 0 scope, replaced with a one-line log confirmation (Â§0).[^7][^1]
- **Ambiguous WCAG conformance labeling** â€” an early revision bundled Target Size Minimum (2.5.8) and Focus Appearance (2.4.13) together as "WCAG 2.2 AA." This was corrected: 2.5.8 is AA, 2.4.13 is AAA (still enforced as a blocking, accurately-labeled project requirement) (Â§7.3).[^1]

This appendix exists purely for build-team context and audit-trail completeness; none of its content is an active requirement.

---

## References

1. [OH-GUI-build-spec-v2.1.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/57152701/d4f9f6fd-ae23-43ff-8ab7-51f0f492d443/OH-GUI-build-spec-v2.1.md) - # OH-GUI Build Spec v2.1
### Standalone Implementation Specification â€” Vibe-Coding GUI for OpenHands...

2. [OH-GUI-build-spec-v2.3.1.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/57152701/c2d93dca-a37f-46af-ba2c-65db8bee9463/OH-GUI-build-spec-v2.3.1.md) - Audience Perplexity Computer autonomous coding agent implementing this directly against a live repos...

3. [OH-GUI-build-spec-v2.3.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/57152701/885642e1-372c-4b29-a81a-507035d7f4fb/OH-GUI-build-spec-v2.3.md)

4. [OH-GUI-build-spec-v2.5.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/57152701/f4cda94b-5855-4428-acc2-4ac9defc6278/OH-GUI-build-spec-v2.5.md) - # OH-GUI Build Spec v2.5
### Standalone Implementation Specification â€” Vibe-Coding GUI for OpenHands...

5. [OH-GUI-build-spec-v2.2.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/57152701/6134e26a-27ed-4936-b86f-ab1627895127/OH-GUI-build-spec-v2.2.md) - # OH-GUI Build Spec v2.2
### Standalone Implementation Specification â€” Vibe-Coding GUI for OpenHands...

6. [OH-GUI-build-spec-v2.4.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/57152701/9d454a7d-ac07-4c5c-9975-ab76e5f55f7e/OH-GUI-build-spec-v2.4.md) - Audience Perplexity Computer autonomous coding agent implementing this directly against a live repos...

7. [OH-GUI-build-spec-v2.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/57152701/ca095c28-9eda-4145-bfd0-52f40638b7b6/OH-GUI-build-spec-v2.md) - Audience Perplexity Computer autonomous coding agent implementing this directly against a live repos...
