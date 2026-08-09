# 12. Portable Components - Use, Don't Rebuild (v4.0 Updated with Verified GitHub Sources)

> **AMENDED v4.2 (2026-08-08) by [ADR-001](../../adrs/ADR-001-integration-boundary.md).**
> Two changes: (1) the openhands-sdk rows below are **Python** primitives running in the
> OH-GUI middleware, not in the browser - the frontend reaches them through the middleware
> API; (2) **Agent Canvas itself is now the largest donor source** (see table addition).

| Sub-problem | Component | Integration note |
|---|---|---|
| Diff virtualization | Zhang-JiahangH/react-virtualized-diff | v4.0 verified: combines diff library with virtuoso; simple two-prop DiffViewer API. Benchmark against Monaco first. | <!-- [REQ-12-001] -->
| Terminal pane | Qovery/react-xtermjs | No OpenHands-specific logic; port as commodity UI. | <!-- [REQ-12-002] -->
| Command palette | cmdk / react-cmdk | No OpenHands-specific logic; port as commodity UI. | <!-- [REQ-12-003] -->
| Rewind/fork UX reference | microsoft/agdebugger | v4.0 verified: send/step/edit messages, revert to earlier points, interactive conversation-graph visualization. Lift the graph component directly for DAG rendering. | <!-- [REQ-12-004] -->
| Authorization card UX reference | agentkitai/agentgate | v4.0 verified: full HITL approval system - policy engine, REST server, TypeScript SDK, Slack/Discord/email routing, MCP server, React dashboard. Read dashboard source directly. | <!-- [REQ-12-005] -->
| Agent inbox UX reference | langchain-ai/agent-inbox | v4.0 verified: production interrupt-review UI, add-any-graph flow, accept/respond/ignore actions. Informs the "needs you" inbox. | <!-- [REQ-12-006] -->
| Stuck detection | StuckDetector, already in openhands-sdk | First-party SDK code. Wire directly; do not rebuild. | <!-- [REQ-12-007] -->
| Explain affordance backing | conversation.ask_agent(), already in openhands-sdk | Thread-safe, stateless, no event emission; use directly. | <!-- [REQ-12-008] -->
| Untrusted-content enforcement | state.block_action() / state.block_message(), already in openhands-sdk | Enforcement point for 04a-prompt-injection.md. | <!-- [REQ-12-009] -->
| GPU/accelerator telemetry | nvidia-smi / rocm-smi / powermetrics / /sys/class/thermal | Adapter must detect and abstract across all four backends. | <!-- [REQ-12-010] -->
| Motion/visual stack | motion (import motion/react), plus vendored Aceternity UI and Magic UI source | v4.0 correction: motion is the current package name. Aceternity/Magic UI are copy-paste - vendor source, do not npm-install. | <!-- [REQ-12-011] -->
| Screen-reader mode reference | VS Code's screen-reader-optimized mode | Interaction pattern only; extend to plan-tree and diff renderings. | <!-- [REQ-12-012] -->
| Spec Wizard: thinking-model routing | SDK's built-in switch_llm tool | Already exists; use directly, no new LLM-switching infrastructure needed. | <!-- [REQ-12-013] -->
| Spec Wizard: web search | SDK's MCP integration | For air-gapped mode, swap to a self-hosted SearXNG instance - a server-swap, not a different code path. | <!-- [REQ-12-014] -->

## v4.2 addition - Agent Canvas as donor source

> **CORRECTED 2026-08-08 (ADR-001 Amendment #2).** The rows below name
> `OpenHands/agent-canvas` and call it "MIT, archived Jul 27 2026 (frozen = stable donor)".
> That is wrong on every count. `OpenHands/agent-canvas` is a **README-only stub with no LICENSE
> file** - never vendor from it. The real donor is **`OpenHands/OpenHands`** @ tag `v1.12.0` =
> commit `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364`, which is MIT (`LICENSE` at root), whose root
> `package.json` is named `@openhands/agent-canvas`, and which is **not archived** - so the
> "frozen, no upgrade treadmill" premise is also false, which is exactly why it is pinned.
> Read-only checkout: `~/dev/oh-gui-ref/agent-canvas/v1.12.0/`. See `PORTING_LEDGER.md`.

| Sub-problem | Component | Integration note |
|---|---|---|
| Conversation UI, terminal, files, settings, browser panes | OpenHands/agent-canvas `src/components/*` | MIT, archived Jul 27 2026 (frozen = stable donor). Vendor with attribution; log each port. | <!-- [REQ-12-015] -->
| Planner / changes / commits / task-list surfaces | agent-canvas `src/routes/planner-tab.tsx`, `changes-tab.tsx`, `commits-tab.tsx`, `task-list-tab.tsx` | Read as reference and vendor selectively. Formerly "extend in place" - retired by ADR-001. | <!-- [REQ-12-016] -->
| Agent Server transport | `@openhands/typescript-client` | Alpha, API may change without notice. Must sit behind the middleware anti-corruption layer. | <!-- [REQ-12-017] -->
| Agent runtime | `ghcr.io/openhands/agent-server` Docker image | Pin by digest. Tags are commit SHAs, not semver. | <!-- [REQ-12-018] -->

Non-finding, confirmed unchanged: the durable Plan object, drift detection, capability manifest, and Compare-mode merge logic remain fully new-build work. <!-- [REQ-12-019] -->
