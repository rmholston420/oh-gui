# Forge-OH donor review — documentation and configuration

**Donor reviewed:** `forge-oh` at `df73ebed2d6d9df9397f7e95dd1eb66bd3dd98b2` (MIT repository).  
**Target:** OH-GUI: Vite/React, thin Python middleware, OpenHands SDK 1.41.0, Colossus single-user/local-first, RTX 5090.  
**Verdict:** take the **boundary disciplines and operational lessons**, not Forge-OH's Next.js, Docker/Compose, shared-Kosmos, GitHub, or exact-model topology.

## Reading record and reliability

### Read fully

- Root architecture/operating records: `README.md`, `START-HERE.md`, `AGENTS.md`, `DOMAIN_MODEL.md`, `CHANGELOG.md`, `KNOWN_ISSUES.md`, `PORTING_LEDGER.md`, `workflow-notes.md`, `SESSION_HANDOFF.md`.
- `DEBUG_LOG.md` in full (2,324 lines), and every `docs/adr/*.md` in full (ADRs 003–029, with no 014, plus index; 4,023 lines).
- `docs/agent-server-routes-1.40.0.txt`, `docs/deployment-topology.md`, `docs/frontend-backend-gap.md`, `docs/kosmos-plugin-analysis.md`, and `docs/decisions/*.md` in full.
- Root configuration and templates in full: `package.json`, `pnpm-workspace.yaml`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`, `ruff.toml`, `.pre-commit-config.yaml`, `requirements.txt`, `Dockerfile`, `Caddyfile`, three Compose files, and two environment templates.
- `.openhands/` in full, including its duplicated/context ADRs and `hooks.json`.

### Read structurally / selectively

- `BUILD_LOG.md` (heading index plus entries relevant to decisions, deployment, ports, and failures; not every 7,357 lines).
- The remaining plan, slice, self-eval, skills-index, and `misc/` files: headings, decision blocks, status/amendment markers, and relevant sections. This is sufficient for donor selection, but **not** a claim that every one of those files was read end-to-end.
- `.agents/` skills: all metadata, triggers, headings, and the seven Forge-specific skill metadata/contract outlines were inspected; `misc/user-scope-skills/` was inventoried and structurally reviewed rather than read end-to-end.

**Documentation-health warning:** the donor has valuable evidence but many competing “canonical” plans, historical copies, and status amendments. Treat current ADRs and source verification as authoritative; never port a quoted model, port number, or plan step without re-validating it against OH-GUI’s SDK 1.41.0 and runtime.

---

## 1. Architectural decisions — inherit deliberately, reject deliberately

### Core decisions that OH-GUI should inherit

| Donor decision / source | Transfer decision | OH-GUI interpretation |
|---|---|---|
| **Browser never calls OpenHands directly** — `AGENTS.md`, `.openhands/decisions/002-no-direct-openhands.md`, ADR-004 | **INHERIT** | Keep Vite browser → thin Python middleware → local agent-server. Browser never receives the OpenHands base URL, API key, raw LLM credentials, or a direct agent-server websocket. One client module owns upstream calls. |
| **The BFF is policy and contract boundary** — ADR-004, `.openhands/context/conventions.md` | **INHERIT, slimmed** | Middleware owns Pydantic input validation, secret redaction, model routing, workspace/preset policy, upstream error translation, and event normalization. Do not recreate a broad orchestration platform. |
| **Canonical domain names and external-data schemas** — `DOMAIN_MODEL.md`, `.openhands/context/conventions.md` | **INHERIT** | Use one common language and Zod/Pydantic boundary validation. Generate or share types where possible; don’t duplicate browser-side types as Forge-OH repeatedly did. |
| **Three state domains** — ADR-003 | **INHERIT** | TanStack Query owns server truth; a stream store owns live run/event state; Zustand (or equivalent) owns only UI state. Reset stream cursor/state when changing runs, or stale cursors skip events. This is framework-neutral. |
| **Normalize at the upstream boundary, once** — `bff/services/event_normalize.py` decision/skills; DEBUG 2026-08-03 05:19 and 2026-08-06 00:02 | **INHERIT** | Both bootstrap `GET /runs/{id}/events` and live relay emissions must use the same normalizer. Emit only a stable OH-GUI wire schema, retain raw payload for inspection, and add a regression test for each new SDK event kind. |
| **Response-envelope and schema discipline** — `bff-fe-contract-sync` skill; DEBUG 2026-08-02 22:32, 2026-08-05 23:25, 2026-08-06 06:53 | **INHERIT** | Choose one documented `{data: ...}` rule and validate every response at the browser boundary. Fixtures and route mocks must satisfy the complete schema. |
| **Run creates independently from model warmup** — `.openhands/decisions/012-bff-create-run-async-warmup.md` (Proposed) | **INHERIT THE INTENT** | A run-start request should return after durable registration/initial state, not block on cold model initialization. Surface warming/failure as run events. Implement only after checking SDK 1.41 conversation semantics. |
| **Role-first model routing with compatibility-gated preset override** — ADR-012 and ADR-027 | **INHERIT THE POLICY, NOT THE CATALOG** | Route by task/role and available local runtime; a preset may select only a compatible model/backend. Never pass arbitrary `base_url`, API key, or raw LLM config from the browser. `switch_llm` only, driven by an approved preset ID. |
| **Local-only, no-cloud failure policy** — original ADR-001/ADR-009 lineage | **INHERIT** | No cloud fallback. If no approved local backend is available, create an explicit blocked/failed state with an actionable reason; do not return HTTP 200 with `id=""`. |
| **Single-GPU residency and benchmark evidence** — ADR-009/013/017 | **INHERIT, re-benchmark** | One RTX 5090 cannot reliably host the donor’s coder and planner together. Enforce one active GPU-heavy server, cold-start budget, memory preflight, NVML capture, deterministic prompts on disk, and quality-before-speed evaluation. Exact Forge-OH models, ports, score floors, and vLLM flags are stale donor data. |
| **Event relay yields and moves blocking work off loop** — DEBUG 2026-08-03 23:40 | **INHERIT** | Relay-side derived work must run in a worker/background queue; yield on each event. Bound/retire orphaned relays. This protects every request handler from sidecar-induced event-loop starvation. |
| **Security analyzer and confirmation policy at the agent boundary** — DEBUG 2026-08-05 23:15; Stage 3 plans | **INHERIT, local only** | Use deterministic `PatternSecurityAnalyzer` where SDK 1.41 supports it; preserve `confirm_unknown=true` until attachment is mandatory and verified. Keep approval policy explicit and audited. |
| **Workspace isolation / non-destructive restart** — ADR-026 | **INHERIT THE SAFETY PROPERTY** | Never rely on agent-server conversation fork to rewind a workspace. Restart from a recorded event/commit into a new run/worktree, preserving the original. Revalidate the SDK 1.41 event shape and workspace capability before implementation. |
| **Port-level zero-trust validation** — ADR-022 | **INHERIT** | Validate every write at the formal port/adapter boundary; reject coercive booleans/numbers and bypass paths. This is particularly suitable for memory writes and tool execution. |
| **Observability must be graceful** — ADR-006/024/019 | **INHERIT** | Optional memory/retrieval/graph services must make availability explicit and degrade to a clear 503/disabled state, not crash startup or silently lie. |
| **Frontend/backend parity rule** — ADR-010, `docs/frontend-backend-gap.md` | **INHERIT** | A nav/control may ship only with a consumer, empty/error/loading states, and a backed endpoint; a backend route must have a documented consumer or be explicitly internal. |
| **Agent skills are SDK-native where possible** — ADR-029 | **INHERIT, re-check API** | Prefer SDK 1.41 Skills, Workspace, and Condenser over parallel reimplementations. Add only narrow OH-GUI adapters such as verification outcome schema, bounded repair controller, and token-budget gate. |
| **Append-only build/debug records and current handoff** — `AGENTS.md`, `workflow-notes.md` | **INHERIT** | Matches OH-GUI requirements exactly: append `BUILD_LOG.md`/`DEBUG_LOG.md`, overwrite `SESSION_HANDOFF.md`, maintain a ledger/ADRs, and search debug history before diagnosing. |

### Decisions/topology to reject or defer

| Donor decision / source | OH-GUI decision | Why |
|---|---|---|
| **Next.js API proxies and Next App Router** — `.openhands/decisions/002`, `src/app/api` assumptions, Next configs | **REJECT** | OH-GUI is Vite/React. Keep one thin Python middleware; no second browser-proxy layer and no Next-specific route, hydration, or env rules. |
| **Auth/RBAC/NextAuth/Rigpa LMS plugin shell** — ADR-005, `.openhands/context/decisions/003-rigpa...`, `004-rbac...` | **REJECT** | Violates single-user/local-first constraint. Remove NextAuth/RBAC/LMS roles, server-side SSO, and user/workspace access control. Keep only local action confirmation if desired. |
| **GitHub parity, PR branches, GitHub CI, screenshot pushes** — ADR-016, `.pre-commit-config.yaml`, `AGENTS.md` | **REJECT** | Hard constraint: no GitHub-native CI. Preserve local pre-commit quality checks and ignored-file hygiene, but do not require remote parity, PRs, pushes, CI variables, or screenshot commits. |
| **Shared Kosmos-owned DozerDB** — ADR-019, `docs/deployment-topology.md` | **REJECT** | Cross-project ownership is a hidden dependency and violates the clean single-app boundary. If OH-GUI ever needs graph memory, use its own embedded/local store or a separately declared OH-GUI-owned local service. |
| **RepoGraph/DozerDB-first code intelligence** — ADR-006/018/019 | **DEFER** | The retrieval cascade (LSP → structural graph → grep) is sound, but it is not MVP-critical. Consider a local LSP/subprocess first; only introduce a graph after an OH-GUI use case and a licence/ops review. |
| **Qdrant + DozerDB graph memory stack** — ADR-020–024 | **DEFER** | Valuable memory design, but two additional databases and an embedding model compete with the GPU/runtime. Start with a small local SQLite/FTS case store if memory becomes necessary. |
| **Forge-OH exact Qwen/DeepSeek models, ports 8000/8501/8511, Docker `:latest`, benchmark floors** — ADR-009/013, deploy docs | **REJECT AS DATA** | The donor contains contradictory model history and 1.40-specific tuning. OH-GUI must benchmark on its own 1.41 stack and lock image/model identifiers rather than inherit mutable `:latest`. |
| **Per-run Docker SWE-bench evaluator** — ADR-015 | **DEFER** | Safe evaluator isolation is good, but SWE-bench is not a GUI prerequisite and adds images/CPU/RAM/ops complexity. |
| **Self-eval systemd harness** — ADR-011 | **DEFER** | An on-demand local verification harness may be useful later; do not import systemd units, nightly behavior, or BFF-driven self-modification into the first OH-GUI slice. |
| **SearXNG/research tool and code-execution mode** — Stage 6, `.openhands/decisions/013` | **DEFER** | Neither is required to supervise coding. If adopted later, tools must be SDK-registered and execute in the agent-server sandbox, never with `exec()` in middleware. |
| **Caddy/public proxy/container split** — `Caddyfile`, Compose | **REJECT** | No public ingress/domain/HTTPS needs. Bind local services to loopback wherever possible. |
| **Control-plane vs target-plane safety model** — build plan, `.openhands/context/architecture.md` | **INHERIT ONLY IF SELF-MODIFICATION SHIPS** | Good isolation principle, but defer worktrees/promotion workflow until OH-GUI actually changes its own source. |

### ADR disposition inventory

This index accounts for every ADR present under `docs/adr/` (there is no ADR-014).

| ADR | Donor decision | OH-GUI disposition |
|---|---|---|
| 003 | Layered server/UI/stream state | Inherit principles. |
| 004 | FastAPI BFF middleware (CORS/auth/RBAC/OTel) | Keep slim local validation/redaction/error boundary; reject auth/RBAC, make external telemetry optional. |
| 005 | Casbin RBAC library | Reject. |
| 006 | RepoGraph structural retrieval | Defer; retain LSP/structural-retrieval principle only. |
| 007 | Execution-verified self-debugging loop | Defer until a bounded local verification/repair capability has a use case. |
| 008 | Trajectory memory/case retrieval | Defer; do not make memory a prerequisite of the GUI. |
| 009 | Local coder/planner model roles | Inherit local-only/role policy and failure semantics; re-benchmark all actual models and topology. |
| 010 | Frontend parity scope | Inherit parity rule, not the donor's feature scope. |
| 011 | On-demand self-eval harness | Defer. |
| 012 | Role-first routing with preset override | Inherit policy, compatibility gate, and approved-only switching. |
| 013 | Canonical planner/coder benchmark ratification | Reject exact model/rate/flag data; inherit measurement discipline. |
| 015 | Containerized SWE-bench verification | Defer. |
| 016 | Colossus/GitHub exact mirrors | Reject. |
| 017 | Mandatory NVML benchmark sampling | Inherit. |
| 018 | Serena MCP/LSP passthrough | Defer Serena; inherit lifecycle correction and local LSP-first option. |
| 019 | Kosmos-canonical shared DozerDB | Reject. |
| 020 | Qwen embedding default | Defer; do not select an embedding model before local memory is needed. |
| 021 | CIDOC graph memory model | Defer. |
| 022 | Zero-trust port-layer validators | Inherit. |
| 023 | ACE-style memory curation | Defer. |
| 024 | Memory frontend plumbing | Defer; inherit graceful-disabled behavior only. |
| 025 | Fork-and-reset restore | Reject; superseded. |
| 026 | Fresh-run restart from target file state | Inherit safety outcome; revalidate SDK/workspace behavior. |
| 027 | Only `switch_llm` forwarded by BFF | Inherit after SDK 1.41 route discovery. |
| 028 | Stage/topology plan renumbering | Do not port as architecture; use only as a warning that plan labels drift. |
| 029 | SDK-native Skills/Condenser/Workspace | Inherit, subject to SDK 1.41 API verification. |

### Decision chronology / conflicts to avoid porting

1. `.openhands/context/decisions/001-use-ollama-first.md` is explicitly a stale scaffold. `.openhands/decisions/001...` is itself superseded for routing by ADR-009; ADR-009’s routing layer is superseded by ADR-012; exact role choices are amended by ADR-013. **Do not use any early “Ollama-first” text as current design.**
2. ADR-025’s destructive restore-via-fork proposal is superseded by ADR-026’s restart-from-here design. **Do not port fork/reset.**
3. ADR-018 corrected its own startup design: calling the BFF’s HTTP endpoint from lifespan fails before the server is bound. Directly register/start the local agent-server integration during lifecycle instead.
4. ADR-028 renumbered and deferred plans; Stage/phase identifiers in `BUILD_LOG.md`, master plans, and handoffs are not stable architecture identifiers.
5. `DOMAIN_MODEL.md` uses `awaiting-approval`, while later implementation records establish `awaiting_approval` as the canonical wire/API enum. Choose one OH-GUI spelling at the schema boundary (recommend underscore) and translate only for display.

---

## 2. `DOMAIN_MODEL.md` — full starting model for OH-GUI

The donor model is a strong starting vocabulary. Preserve names where they fit, but remove multi-user/LMS assumptions and make run/workspace identity durable.

| Entity | Donor definition / state | OH-GUI recommendation |
|---|---|---|
| **Run** | A live or historical agent execution mapped one-to-one to an OpenHands conversation; status: `idle`, `running`, `streaming`, `queued`, `paused`, `awaiting-approval`, `succeeded`, `failed`, `blocked`, `disconnected`. | **Core.** Store `run_id`, agent-server conversation ID, workspace ref, preset/role/backend snapshot, timestamps, status, terminal reason. Normalize status from SDK. Treat `awaiting_approval` as canonical wire form. |
| **AgentPreset** | Reusable named configuration: model, system prompt, tools, approval policy, skills, model role; a default exists. | **Core.** Preset holds approved local backend/model role and safety/skill selection—not browser-supplied credential/base URL. Enforce model compatibility at middleware. |
| **Workspace** | Local, Docker, or remote API execution environment; identity, path/image/URL, health, dirty state. | **Core, reduced.** Begin with local workspace plus agent-server-provided workspace metadata. Add container/remote only when SDK 1.41 integration is proven. |
| **ToolEvent** | Normalized event: id, run id, sequence, timestamp, kind, tool, input/output, error, redaction, raw payload. | **Core.** Stable normalized wire record with raw payload retained server-side for diagnostics; bootstrap and stream must share it. |
| **Artifact** | Named output linked to a run: type/path/URL, media type, metadata. | **Core.** File diff, patch, terminal log, screenshot, report; use local path/opaque id—not public object URLs. |
| **Integration** | External service/plugin/MCP descriptor, health and capabilities. | **Optional.** Treat OpenHands-native tools/skills/MCP endpoints as local integrations; no cloud/control-plane connectors by default. |
| **TraceSpan** | Correlation/timing for tool/LLM/workflow operations, cost/tokens/status. | **Useful.** Preserve trace id, parent id, timing, input/output tokens; make external telemetry opt-in and local-only. |
| **SecretRef** | Metadata reference only: provider/key/scope/last-used; never secret value. | **Core security invariant.** OH-GUI should show only metadata and keep actual tokens in local environment/keyring. |
| **PlanNode** | Run plan step with id/title/description/state/dependencies/tool references. States `queued`, `active`, `done`, `failed`, `blocked`, `awaiting-approval`. | **Core UI projection.** Reconstruct from events if SDK has no durable plan API; distinguish agent plan from UI-only checklist. |
| **CommandExecution** | Command action/observation: command, cwd, exit code, stdout/stderr, duration, truncation. | **Core.** Essential audit and approval surface; redact values and cap retained output. |
| **BrowserSession** | Browser automation session/frame/URL/status/screenshot. | **Defer.** Keep the entity reserved but do not build it until SDK browser work is in scope. |

**Missing pieces OH-GUI should add before implementation:** `BackendSnapshot` (actual endpoint/model/runtime selected for a run), `ApprovalRequest` (tool/action/risk/decision), `RunWorkspaceSnapshot` (worktree/commit anchor), and a `RunFailure` envelope. The donor’s repeated `agentPresetId` and `workspaceId` losses show that these need durable run metadata rather than a response-only convenience field.

---

## 3. Exhaustive transferable findings from `KNOWN_ISSUES.md` and `DEBUG_LOG.md`

### Current `KNOWN_ISSUES.md` backlog — port-relevant items

1. **Docker health endpoint is wrong:** BFF image probes `/health`, but only `/api/repograph/health` exists. Add one real local health endpoint before containerizing OH-GUI, or keep it host-only.
2. **Container user home is missing:** trajectory storage calls `Path.home()` and resolves `/home/bff`, which is not writable/created. Use an explicit data directory/volume; do not infer persistence from the process home.
3. **Approval fail-open risk:** `ConfirmRisky(confirm_unknown)` must retain `true` while security analyzer attachment is best-effort. Do not declare risk policy active until analyzer registration failure is fatal/visible.
4. **Relay-yield tests were structurally invalid:** timestamp/coroutine order made them unable to prove scheduling latency. Measure inside the queued coroutine relative to a pre-task timestamp; regression tests were later repaired but deserve independent re-validation.
5. **vLLM context/VRAM limits:** the donor’s 32K model cap and smoke context skips are model-specific. Explicitly record skipped tasks and do not compare raw rates without the same context set.
6. **DependencyGuard placement:** dependency installation happens in agent-server tools, not in the BFF. A BFF-only guard is dead architecture; put it in an SDK tool/pre-tool hook or agent-server path.
7. **Event normalization must be symmetric:** the relay initially emitted raw events while bootstrap normalized. Normalize every outbound event exactly once.
8. **Status spelling drift:** implementation wants `awaiting_approval`, documentation sometimes uses hyphenated form. Normalize at the boundary and test it.
9. **Known test debts:** Blob cross-realm `instanceof`, RepoGraph health cache/settings leak, old fixture/schema mismatch, and route-mock ordering/envelopes. Use shape tests plus real boundary validation, not fragile implementation assertions.
10. **Dev/prod server ambiguity:** Next dev `:3000`, production `:3100`, stale server and stale build behavior repeatedly invalidated checks. OH-GUI should standardize one explicit dev/test lifecycle and kill only managed PIDs.
11. **SDK/tool registry is version-sensitive:** `resolve_tool` in 1.40 requires a `Tool` spec and conversation state; registry values are resolver closures. Test capability, not exact private representation.
12. **Agent-server REST limits/events:** event search `limit` must be ≤100, read-back user text is under `llm_message.content[*].text`, and an unknown event should yield 404 before “no commit anchor” 409.
13. **Environment contamination:** module-import `load_dotenv()` polluted full pytest processes; any test asserting a default must clear environment variables explicitly. Avoid import-time env loading in OH-GUI if possible.

### `DEBUG_LOG.md` — exhaustive transfer index by failure family

The following covers every logged finding, including resolved ones, because resolved donor defects often recur during a port.

#### A. API, run lifecycle, and wire contracts

- **22:32 2026-08-02:** list endpoints must match the frontend envelope; a bare preset list left `agentPresetId` empty and caused downstream Zod failure.
- **22:44:** agent-server `GET /api/conversations` requires ids; list via `/search`. Relay event names and connection query keys must match browser names (`event`/`status`, `runId`/`conversationId`).
- **22:57:** polling code must unwrap `{data: ...}` before reading terminal state.
- **23:12:** direct run creation requires `title`; either make the API explicit or give middleware a deterministic title policy.
- **23:17:** agent-reported paths can be absolute; encoded route paths and leading-slash fallback must be handled safely.
- **23:24/23:26:** form field `contextPrompt` versus schema `taskPrompt` silently stripped the prompt. Contract tests must submit real browser payloads.
- **23:24:** malformed tool call can produce an error observation before a later success; reconstruct files only from successful observations.
- **23:29:** shared workspace causes repeated file creation collisions; use unique fixture names and, later, isolated run worktrees.
- **00:09 2026-08-03:** rejecting a confirmation leaves agent-server idle, not terminal; follow with interrupt and represent paused/cancelled semantics deliberately.
- **20:17:** agent-server conversation workspace gives a path, not the UI workspace UUID. Maintain a path→id mapping and echo caller-provided id on creation.
- **22:15 2026-08-05:** presets cannot use a cloud-only `Literal`; use strings plus approved backend IDs/role compatibility. Persist `agentPresetId`, not only in initial POST response.
- **09:05/09:10/09:29 2026-08-06:** page agent-server events at ≤100; read `llm_message.content`; fetch event before checking commit ledger so unknown anchors are 404; preserve commit SHA in typed frontend projection or safety UI disappears.
- **09:43:** current 1.40 REST surfaces were `switch_profile`, `switch_llm`, `switch_acp_model`; choose only `switch_llm`, preset-driven. Re-discover names in SDK 1.41 rather than assuming a `/switch-model` route.

#### B. Event/streaming, ASGI, and concurrency

- **05:19 2026-08-03:** bootstrap events needed the same normalizer as live events; raw events lacked `.summary` and made the timeline useless.
- **22:52:** client timeout shorter than inner BFF/upstream timeout creates a false “transport failure”; do not solve it with ever-larger timeouts—make creation asynchronous.
- **23:40:** synchronous per-event planning/fsync starved the asyncio loop. Use `asyncio.to_thread`, yield per event, cap producer backlog, and stop orphaned relays.
- **00:02 2026-08-06:** terminal status is checked after a relay page is emitted; test doubles must return an empty second page or expect a deliberate double emission.
- **00:02/04:17/11:46:** hazard tests initially measured the wrong timestamp/order. Queue both tasks before yielding and capture start time before task creation.
- **06:37:** `bff.main:app` is bare FastAPI; only `bff.main:app_with_sio` mounts Socket.IO. Treat the wrapper as the sole ASGI entrypoint and probe `/socket.io` in startup tests.

#### C. UI/schema/testing defects

- **00:07:** computed `process.env[NEXT_PUBLIC_...]` is not inlined by Next. Irrelevant to Vite’s exact mechanism, but the general rule remains: browser-exposed feature flags need build-time explicit access and tests.
- **05:19:** uninstalled Tailwind classes/global CSS names and missing tokens rendered browser defaults. OH-GUI should use one declared styling system and lint/test component styling, not compatibility shims.
- **05:32:** Ruff formatting rejects aligned dict columns; type checkers may not narrow `Any | None` in comprehensions; keep formatter output canonical.
- **05:34:** upstream `skills` may be objects; normalize text fields to primitives before JSX. Central endpoint constants prevent missing `/api` prefixes. Tab UIs should render real zero/empty states once data exists, not permanent skeletons.
- **06:10/06:17 2026-08-05:** an envelope drift made `presets` non-iterable, causing a Next Fast Refresh CPU storm. Use array guards plus React error boundaries; Vite avoids Next’s exact loop but not unhandled render failures.
- **03:00/03:10/03:11 2026-08-04:** generic `.then()` helpers can infer `unknown`; Next dynamic params were Promise-shaped; frontend `TaskOutcome` drifted from Python output. In OH-GUI: explicit generics, no framework assumptions, and derive/generated shared contract types where feasible.
- **23:25/23:37 2026-08-05 and 04:07 2026-08-06:** Playwright mocks must include envelopes and full schema; register specific routes before general routes; scope strict locators (Next route announcer/decorative icons create legitimate duplicates).
- **06:48/06:53:** tightening schemas broke old fixtures silently downstream. Whenever a boundary schema changes, grep and update every fixture.
- **05:00:** E2E paths must be derived from spec location, not process CWD; package has no ESM mode, so `import.meta` fails under CJS test compilation.
- **03:04:** a top-level `.gitignore` `tests/` pattern hides `src/tests/**`; use a precise scratch path, not a broad component pattern.
- **08:04:** Unicode `\uXXXX` escapes render literally in JSX text/Markdown; use literal glyphs there, escapes only in JS strings.

#### D. Process, environment, and container topology

- **05:44/05:47:** stale uvicorn processes masked new Python code. PID files alone are insufficient; stop by owned port **and** command signature, then restart. Do not kill unrelated incumbents.
- **20:55:** `uvicorn --reload` may terminate an in-flight long model request. Dev-only reload must never be used for smoke/production.
- **02:24:** compaction/session summaries can invent commits/defaults. Verify any load-bearing statement with source/git and correct the handoff immediately.
- **03:29/03:34:** a launcher that fails to source required env makes optional memory 503; standalone scripts need repo-root import setup; local tool state such as `.serena/` must be explicitly ignored rather than violating hygiene checks.
- **14:40:** BFF Docker build context must include package path *and* sibling local packages (`bff` plus `openhands_tools_ext`); `uvicorn bff.main:...` fails when code lands at `/app/main.py`.
- **14:47:** BFF image health check and container home path were both wrong. Data paths and health URLs need an actual container test, not only source review.
- **15:28:** a vLLM image entrypoint changes the meaning of `docker run ... --version`; override entrypoint for probes and expose GPUs only for GPU probes.
- **15:37/15:39:** bench scripts must be invoked as package modules when they import `bench.*`; stale command-line flags and “all” versus smoke aliases caused accidental wrong workloads.

#### E. Local-model / GPU / benchmark lessons

- **12:15 2026-08-03:** OS Python upgrades can orphan a venv through interpreter symlink drift. Recreate/reinstall rather than trusting visible `site-packages`.
- **12:50/13:31/13:32:** GGUF path needs `--dtype float16`; Triton needs Python development headers; an older FlashInfer whitelist rejected Blackwell SM_120—disable it rather than assuming the error means hardware is too old.
- **18:34/18:46/18:57:** old native vLLM did not know `qwen3_5_moe`; stale ports need ownership checks; image version changes altered cold start to >300 s. Pin version/digest, preflight ports, and make readiness timeout measured/configurable.
- **02:03/02:40/02:42 2026-08-04 and 06:52 2026-08-05:** GPU launch failures were VRAM contention, often Ollama/user-systemd or planner still resident. Check `nvidia-smi`, both system and `--user` systemd scopes, process/port ownership, then stop the nonresident runtime. One 32 GB GPU cannot host donor planner + coder simultaneously.
- **23:57 through 02:52:** model names are unreliable indicators. Inspect `config.json` quantization; Mamba sets a max sequence limit; compressed-tensors conflicts with forced AWQ/ModelOpt flags; VLMs consume vision memory; tokenizer/chat-template and Mistral backend modes can make an otherwise-ready server return 400/501. Validate `/v1/chat/completions`, not only `/v1/models`.
- **00:33/00:39:** HuggingFace CLI patterns changed; glob arguments were parsed as literal filenames and “successful” runs fetched only configs. Verify a large weight shard exists, not merely exit status.
- **01:27:** if a Mistral/HF tokenizer routing path cannot honor chat templates, drop the candidate rather than carrying a nonfunctional model into the matrix.
- **02:31:** 30B FP8 weights may leave no compile-time activation headroom. On a 5090, 4-bit/NVFP4 alternatives are more plausible; benchmark actual memory, not parameter-count intuition.
- **02:41:** community quant repos can omit chat templates; mount/use the upstream template only after license/provenance verification.
- **08:12/08:38:** coding model patches often have incorrect hunk counts or duplicate file sections. Recount/normalize defensively before evaluator application and record whether repair occurred.
- **15:41/15:45/15:52 2026-08-06:** endpoint host port and served model name must be independently configured and recorded in benchmark manifest. A TCP 404 proves connectivity, not model identity.
- **16:32/18:05:** speculative decoding improved tokens/s but plausibly damaged structural patch quality; remove it first when quality collapses. Thirty-task single-sample score deltas are noisy (about ±2 tasks); use paired/multi-sample evidence before declaring a context regression.

#### F. SDK skills, memory, and storage specifics

- **11:11 2026-08-06:** YAML frontmatter bare numerics become integers and can cause **all** skills in a directory to fail loading. Quote numeric trigger values. Root `AGENTS.md` is intentionally loaded as an always-on “agents” third-party skill, not a phantom defect.
- **01:59:** embedding tests must derive dimension from resolved model and isolate ambient environment; donor changed 768-d `nomic` to 1024/2560/4096-d Qwen variants.
- **03:54/04:00/04:04:** direct registry probing was more stable than fabricating SDK Tool/ConversationState; registry contains callable resolver closures, not tool classes.
- **04:00/04:04:** tests that depend on a live LLM must handle blocked model routes and fresh agent servers. Avoid making a memory-display test responsible for starting a coder runtime.
- **05:45:** Pydantic SDK Actions emit a `kind` discriminator; strip SDK metadata before idempotency argument hashing/ledger persistence so class-name changes do not alter semantic hashes.
- **07:22:** DozerDB reports `edition=enterprise` internally despite a community-origin image. Do not infer commercial Neo4j licensing from that string; OH-GUI should avoid this stack anyway.
- **07:39:** code search must match symbol *and* file path, not symbols alone.
- **01:23/11:46:** test isolation around live graph services requires clearing cached drivers and patching the settings function used by helpers—not only the router symbol.

---

## 4. `PORTING_LEDGER.md` — donor provenance and licence transfer

### Ledger entries found

| Component / usage | Source recorded | Licence recorded | OH-GUI assessment |
|---|---|---|---|
| RepoGraph design/reference, no upstream code copied | `repo-graph` commit `6c3977d8…` | MIT | Reference only. Do not import its architecture until OH-GUI needs graph retrieval; source itself has execution/eval risk noted by donor. |
| LLMDebugger design/reference | `SWE-agent/LLMDebugger` commit `49ac…` | Apache-2.0 | Reference only; no immediate OH-GUI use. |
| Qwen3.6 AutoRound model weights/config | Model source noted by ledger | Apache-2.0 claimed | Not code to port. Revalidate model licence/model availability before any adoption. |
| `react-force-graph-2d` | npm dependency | MIT | Optional only if/when OH-GUI ships a local graph UI. |
| Serena language-service/MCP integration | `oraios/serena` commit `c7af…`, launched via pinned `uvx` | MIT | Potentially useful later. Take the stdio lifecycle finding, not an unpinned runtime command. |
| Kosmos memory compose / port interfaces / adapters | same-owner Kosmos commit `c455165…` | MIT / Apache-2.0 inconsistently stated | Do not copy wholesale. The useful pieces are interfaces/validators/curation patterns, but the ledger is incomplete and the donor ties it to shared Dozer/Qdrant. |
| Memory consult tool and non-Kosmos glue | hand-authored against SDK | MIT | Only reconsider after OH-GUI has a concrete memory requirement. |
| Kosmos SearchPort + SearXNG adapter | same-owner Kosmos commit `c455165…` | Apache-2.0 | Defer. Local web research is not part of the target’s minimum GUI. |

### Licence conclusion

- **No non-permissive licence is recorded in `PORTING_LEDGER.md`:** its listed licences are MIT or Apache-2.0.
- **Material caveat:** ADR-006/019 describe `graphstack/dozerdb` as GPLv3/community-origin. It is not clearly recorded as vendored code in the ledger, but it is an external runtime dependency. Treat it as a **non-permissive operational dependency** and do not adopt it into OH-GUI without a separate licence/distribution review.
- **Ledger quality issue:** early rows supply URL, commit, SPDX licence, and modification notes; several later same-owner entries abbreviate provenance and omit a clear SPDX field/source URL. OH-GUI’s `PORTING_LEDGER.md` should require all fields for every imported component, including “reference only / no code copied.”

---

## 5. Configuration and tooling review

### Adopt or adapt

| Donor item | Recommendation |
|---|---|
| `ruff.toml` | **Adopt/adapt.** Python 3.11 baseline, 100-char lines, import sorting, and explicit exceptions are sensible. Review each ignore; broad exception suppression is acceptable only for documented noncritical health/degradation paths. Update target version to OH-GUI’s actual Python. |
| `vitest.config.ts` | **Adopt as Vite-native base.** `jsdom`, React plugin, explicit test include/exclude, setup file, V8 coverage, and alias mapping fit OH-GUI. Keep coverage scope intentional. |
| `playwright.config.ts` | **Adopt/adapt.** One worker is correct for a single local GPU/agent server. Keep failure trace/screenshot/video. Remove CI-conditioned retries/`forbidOnly`; define an OH-GUI-owned base URL and explicit test server lifecycle. |
| TypeScript strictness (`tsconfig.json`) | **Adopt.** `strict`, no emit, JSON resolution, and a single `@/` alias are worth keeping. Remove Next types/plugin/included `.next` paths; use Vite/React config. |
| ESLint flat configuration | **Adopt selectively.** Retain TypeScript and React hooks checks, but replace `eslint-config-next`/`@next` rules with Vite/React equivalents. Do not blindly downgrade hook dependency warnings that protect real effects. |
| Zod + Pydantic contract discipline | **Adopt strongly.** This is the highest-value configuration/process asset. Enforce schemas at middleware ingress and browser response boundary. |
| Local pre-commit | **Adopt, rewrite.** Run local formatting/lint/type/unit checks and a local ignored-file/secrets check. It must not require GitHub status, remote parity, branch/PR state, or push. |
| `requirements.txt` SDK family pin | **Adapt.** Forge-OH pins all four OpenHands packages at 1.40.0. OH-GUI must pin the compatible 1.41.0 SDK family together and run a discovery/probe pass for changed REST, event, hooks, skill, and workspace surfaces. |

### Do **not** bring across

| Donor item | Reason |
|---|---|
| `next.config.ts`, App Router, `next-auth`, Next image/router-specific config | OH-GUI is Vite/React and single-user. |
| Root `Dockerfile` | Next frontend Dockerfile assumes `.next/standalone` while `next.config.ts` does not set `output: 'standalone'`; its health probe expects `/api/health`, a route the donor itself marks deferred/missing. It is not a safe base. |
| `docker-compose.yml` topology | Couples BFF to host agent-server, Qdrant, shared Kosmos DozerDB, externally managed model containers, and brittle host ports. OH-GUI should start as one loopback-local Python service plus Vite dev server. |
| `docker-compose.dev.yml` / `docker-compose.test.yml` | Drifted: overrides refer to `frontend`, `redis`, and `caddy` services absent from the current base Compose; it also contains NextAuth/CI assumptions. Do not reuse. |
| `Caddyfile` | Public `:80`, domain/TLS comments, proxy topology, and NextAuth paths are unnecessary for a local-only system. |
| GitHub workflows (`.github/workflows/ci.yml`, `pr-checks.yml`, `release.yml`) and ADR-016 parity enforcement | Explicitly prohibited by OH-GUI constraints. |
| `pnpm-workspace.yaml` | The donor has no meaningful workspace package list—only `allowBuilds`; take only the package-manager policy if needed. |
| Mutable `vllm/vllm-openai:latest` | Exact donor debug history proves version rotation changed behavior/cold starts. Use an image digest/version after OH-GUI benchmark validation. |

### Config traps worth recording in OH-GUI’s debug log before they recur

- BFF must launch as `app_with_sio` if Socket.IO remains in OH-GUI; bare `app` produces `/socket.io` 404/403.
- Do not use `--reload` for long-running smoke/integration tests.
- Do not import `.env` at module import time; test defaults should clear related env vars.
- One manager must own each port/process; record its PID and command signature.
- A healthy model API requires a completion probe, not only `/v1/models`.
- Do not encode fixed ports/model IDs in benchmark harnesses; capture resolved endpoint, served model, context limit, quantization, and seed in the manifest.

---

## 6. `.agents/`, `.openhands/`, and hooks

### What to take from `.agents/`

The seven Forge-specific skills encode useful engineering contracts:

- **`bff-fe-contract-sync`**: router → Zod schema → endpoint registry three-file update; camelCase/browser envelope consistency.
- **`bff-router-authoring`**: explicit request/response models, error mapping, route registration, and tests.
- **`forge-oh-event-normalizer`**: one kind-to-wire-type map, raw fallback, normalizer/schema/renderer/test/log update procedure.
- **`forge-oh-repo-navigation`**: find an existing pattern and governing ADR before inventing a location.
- **`openhands-agent-server-proxy`**: one outbound client, bounded timeout/error mapping, test isolation, and startup coordination.
- **`playwright-forge-oh`**: production-like browser verification, semantic selectors, visual waits. **Drop** its Next `:3100`, GitHub screenshot, and production-build-only particulars; retain the verification discipline.
- **`socketio-events-tracing`**: event names, rooms, structured payloads, relay debugging, wrapper ASGI entrypoint.

The `misc/user-scope-skills` set is a staging area of generally good practices (benchmarking, debug-first, environment/secrets, router authoring, local LLMs, testing, shell hygiene, skill authoring). Treat it as reference material, not an OH-GUI dependency. The most relevant reusable rules are: deterministic benchmarks, one virtual environment per project, quote numeric YAML triggers, inspect library source for SDK drift, mock at boundaries, and keep shell process ownership explicit.

### `.openhands/` decisions/instructions to preserve

- Preserve `AGENTS.md`/context as always-on repository instructions and the no-direct-OpenHands/BFF boundary.
- Preserve strict schema, CSS-token, router/service separation, and explicit ASGI-entrypoint conventions—but translate all Next conventions to Vite.
- Discard context’s Rigpa-LMS/RBAC/Next API-proxy and GitHub branch/PR rules.
- Treat duplicated `.openhands/context/decisions/*` files as historical/context injection material, not the sole ADR authority; the files themselves flag stale copies.

### `hooks.json` mechanism — precise behavior

`/.openhands/hooks.json` is a declarative hook configuration consumed by the OpenHands runtime. It has two hook phases, each with a wildcard matcher:

```json
{
  "pre_tool_use": [{
    "matcher": "*",
    "hooks": [{
      "type": "command",
      "name": "forge-oh-gpu-thermal",
      "command": "python -m openhands_tools_ext.gpu.hook",
      "timeout": 5
    }]
  }],
  "stop": [{
    "matcher": "*",
    "hooks": [
      {"type": "command", "name": "forge-oh-verify", "command": "python -m openhands_tools_ext.verify.hook", "timeout": 120},
      {"type": "command", "name": "forge-oh-trajectory", "command": "python -m openhands_tools_ext.trajectory.hook", "timeout": 60}
    ]
  }]
}
```

- `matcher: "*"` means the listed command hooks apply to every matching tool/stop event, rather than a named tool subset.
- `pre_tool_use` invokes the GPU thermal command before each tool invocation and gives it five seconds.
- `stop` invokes verification first (120 seconds) then trajectory persistence (60 seconds) when the agent is about to stop. Donor ADR-007/008 deliberately use the STOP boundary so verification writes before trajectory case capture.
- The commands run as Python modules in the runtime environment; therefore `PYTHONPATH`, package installation, working directory, exit semantics, and timeouts are runtime contracts, not documentation decoration.
- **OH-GUI recommendation:** do not copy these hooks until SDK 1.41’s hook loader/config schema is verified. If adopted, start with a bounded, fail-visible pre-tool safety check and a post-run verification summary. Do not make trajectory/memory writes silently best-effort where they are presented as a safety guarantee.

---

## Recommended donor extraction order for OH-GUI

1. **First:** BFF boundary, Pydantic/Zod contracts, domain vocabulary, response envelopes, event normalization, stream cursor reset, local process/port discipline, and append-only logs.
2. **Second:** local model registry/role policy with a fresh 5090 benchmark and one-runtime GPU residency; approval/risk capability only after SDK 1.41 surface verification.
3. **Third:** workspace/commit snapshot and restart-from-here safety; isolated evaluator only when there is a concrete test/eval use case.
4. **Last/defer:** Serena/RepoGraph, graph/vector memory, SearXNG, self-eval systemd service, code-execution tools, browser/VNC integration.

