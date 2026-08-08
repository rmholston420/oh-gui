# Forge-OH BFF services donor review

**Donor:** Forge-OH MIT checkout `df73ebed2d6d9df9397f7e95dd1eb66bd3dd98b2`  
**Target:** OH-GUI — Vite/React plus thin Python middleware, OpenHands SDK 1.41.0, one local Linux workstation / RTX 5090.  
**Decision frame:** the immediate slice is authorization: trust dial, approval cards, audit log, emergency stop, untrusted-content quarantine, stuck-loop intervention, budget pre-check, malformed-tool-call diagnostic, and a tok/s + VRAM telemetry strip.

## Method and coverage

I read **every one of the 38 Python files** under `bff/services/` in full (7,227 source lines). No service file was skimmed. `__init__.py` is empty. The full-read list, with source line counts, is:

| Full read | Lines | Full read | Lines |
|---|---:|---|---:|
| `__init__.py` | 0 | `action_reconstruction.py` | 348 |
| `conflict_checker.py` | 88 | `context_loader.py` | 57 |
| `episodic_memory.py` | 128 | `event_commit_ledger.py` | 227 |
| `event_fetch.py` | 52 | `event_normalize.py` | 474 |
| `event_relay.py` | 302 | `file_diff_reconstruction.py` | 184 |
| `gpu_monitor.py` | 478 | `hook_config.py` | 88 |
| `idempotency_ledger.py` | 260 | `inference_backends/__init__.py` | 27 |
| `inference_backends/_common.py` | 105 | `inference_backends/adapter_llamacpp.py` | 38 |
| `inference_backends/adapter_ollama.py` | 33 | `inference_backends/adapter_sglang.py` | 38 |
| `inference_backends/adapter_vllm.py` | 99 | `inference_backends/protocol.py` | 33 |
| `inference_backends/registry.py` | 61 | `inference_backends/types.py` | 76 |
| `loop_guard.py` | 44 | `mcp_bootstrap.py` | 161 |
| `memory_events.py` | 151 | `metrics_aggregation.py` | 364 |
| `model_router.py` | 556 | `repograph_registry.py` | 54 |
| `restart.py` | 472 | `run_compare.py` | 206 |
| `run_metadata_store.py` | 101 | `run_metrics.py` | 95 |
| `search_events.py` | 154 | `sidecar.py` | 234 |
| `sidecar_producers.py` | 488 | `trace_reconstruction.py` | 268 |
| `trajectory_drain.py` | 286 | `worktree.py` | 397 |

I also inspected Forge-OH's `requirements.txt:6-9`, which pins all relevant OpenHands packages to `1.40.0`, and unpacked the `openhands-sdk` 1.40.0 and 1.41.0 sdists into `review/_sdk_src/`. The 20 Python files under `openhands/sdk/event/` have identical contents in those two sdists, and `openhands/sdk/conversation/state.py` is also byte-identical. The idempotency integration was checked against the donor extension at `openhands_tools_ext/common/idempotent_executor.py` and the SDK 1.40.0 `ToolExecutor` contract.

**Verdict terms**

- **port-early** — useful for the authorization minimum working system, but port the stated boundary rather than copying coupled donor code.
- **port-later** — sound idea or useful projection after the authorization spine exists; do not make it a dependency now.
- **leave** — no material target value now; retain only as a reference.
- **exclude-with-reason** — direct donor would import an inappropriate topology, policy, or unsafe behavior.

## Executive recommendation

Port early only three focused concepts:

1. **Event adapter / audit projector:** use `event_normalize.py` as the behavioral reference, but create a typed, test-fixture-driven OH-GUI adapter. It should own raw-event retention, security/trust mapping, malformed-tool-call diagnostics, quarantine provenance, approval/stop/loop/budget audit entries, and forward-compatible unknown-event handling.
2. **Local GPU telemetry:** take the `gpu_monitor.py` local `nvidia-smi` polling idea, not its global singleton/config mechanics. Add a separate inference-rate meter for tok/s; GPU polling cannot produce tok/s by itself.
3. **Loop intervention:** take only the minimal data-model idea from `loop_guard.py`; replace the string-count heuristic with a per-run detector returning evidence-rich findings that pause for an approval/intervention card.

Treat `idempotency_ledger.py` as a **design input**, not an exactly-once mechanism. Its SDK probe is substantially correct about the inputs available at a tool execution, but the implemented check → side effect → mark sequence is a post-completion duplicate cache, not exactly-once enforcement. An authorization action ledger needs atomic state transitions and audit receipts.

Do **not** port `model_router.py`, `mcp_bootstrap.py`, `conflict_checker.py`, the trajectory sidecar stack, or their compose/shell/Socket.IO topology into the thin OH-GUI middleware.

---

## Priority review

### `event_normalize.py` — **PORT-EARLY (rewrite behind an OH-GUI event-adapter port)**

- **What / public API:** Converts raw Agent Server event dictionaries to UI dictionaries. The public entry points are `normalize_event(event, *, sha_lookup=None)` at `:360` and `normalize_events(events, *, sha_lookup=None)` at `:461`. Supporting rules include `_KIND_TO_TYPE` (`:19-58`), textual/action summaries, Serena tool mapping (`:155-193`), and risk extraction (`:337-357`).
- **Coupling:** Input is the Forge/OpenHands Agent Server JSON envelope, while output is a Forge-OH frontend shape with `type`, `summary`, `raw`, and optional commit SHA. It has no compose or file-system dependency, which makes it the strongest donor candidate.
- **Quality:** Good defensive posture: unknown kinds remain visible as `kind.lower()` and raw event data is retained (`:390-392`); optional SHA decoration is injected rather than globally resolved (`:438-456`). The small helper decomposition is testable.
- **Substantiated defects / gaps:**
  - The mapping omits SDK event kinds including `InterruptEvent`, `HookExecutionEvent`, `StreamingDeltaEvent`, `ACPToolCallEvent`, and `UserRejectObservation`; these fall through to generic output despite being defined in the inspected SDK event source. This is a current coverage gap, not a 1.41-only regression.
  - `normalize_events` silently drops non-dictionary values (`:470-474`), which is acceptable only if the caller receives a diagnostic/counter elsewhere.
  - The stream path calls `normalize_event(ev)` without the SHA lookup (`event_relay.py:222-226`), so live data and HTTP-reloaded data are not actually byte-identical despite the relay's intent.
  - The current security mapping is restricted to four literal levels (`:337-357`); unknown upstream risk values collapse to the default rather than being preserved as an explicit unrecognized state.
- **SDK 1.40.0 → 1.41.0 exact change required:** **none in this module solely because of the SDK version bump.** The installed-source comparison found no Python-source differences in `openhands/sdk/event/` (20 files) or `conversation/state.py`; every event class/field used by this normalizer is unchanged. Do not manufacture a mapping change for 1.41.
  - Still add contract tests against the **Agent Server 1.41 wire JSON**, because this BFF consumes HTTP dictionaries, not SDK event instances. Extend the mapping for the omitted event kinds above; fixture all recognized kinds, unknown kinds, malformed payloads, and approval/interrupt flows. That is coverage work, not a demonstrated 1.40→1.41 source delta.
- **OH-GUI port work:** Define an injected `EventAdapter` that yields a typed `AuditEvent` plus a sanitized raw reference. Give it explicit `ToolCallProposed`, `ToolCallMalformed`, `ApprovalRequested/Resolved`, `EmergencyStop`, `QuarantineEntered/Released`, `LoopDetected`, and `BudgetRejected` records. Preserve unknown raw kinds, but quarantine untrusted external content before rendering or prompt reuse. Keep React DTO shaping outside the adapter.

### `gpu_monitor.py` — **PORT-EARLY (local provider, not direct copy)**

- **What / public API:** Local `nvidia-smi` polling with environment-backed thresholds and a ring buffer. Public surfaces are `GpuSample` (`:167`), `GpuMonitor` (`:208`) with `snapshot()` (`:301`), `history()` (`:332`), and peak helpers (`:343+`), `_parse_csv()` (`:395`), and singleton helpers `get_monitor()`, `start()`, `stop()` (`:465-478`).
- **Coupling:** Entirely local and appropriate for Colossus: subprocess execution of `nvidia-smi`; environment variables configure path, polling and thresholds (`:64-163`). No cloud or multi-user dependency. The global singleton is FastAPI/lifespan shaped rather than a clean middleware dependency.
- **Quality:** Sensible sample model and bounded history; CSV parsing isolates process output; explicit warning/critical/cutoff concepts map well to the trust dial and telemetry strip.
- **Substantiated defects / fragile assumptions:**
  - Ring capacity is `int(history_seconds / poll_seconds)` (`:219`), i.e. floor, although the documentation promises ceiling behavior; a 61-second history at 2 seconds retains only 60 seconds.
  - Timeout handling kills the process but does not await/reap it (`:280-282`).
  - No immediate poll is performed on startup, so `snapshot()` can be empty until the loop first runs.
  - The executable path is captured at construction (`:218`), unlike dynamically read thresholds; later PATH/override changes are ignored.
  - Threshold ordering is not validated, so warning can exceed critical/cutoff and produce contradictory policy state.
  - The advisory cutoff is only a value in telemetry. It is not an emergency stop and must not be treated as one.
  - The monitor has no source for tok/s. `nvidia-smi` reports utilization and memory, not model-token throughput.
- **OH-GUI port work:** Create an injected `LocalGpuTelemetryProvider` started and stopped by the thin middleware lifespan, with monotonic timestamp, sample freshness/TTL, validated threshold ordering, an immediate sample, and a process cleanup path. Feed **VRAM** into the telemetry strip. Feed **tok/s** from an independent inference request/event meter (tokens divided by generation elapsed time). An emergency stop should call a concrete SDK/run interruption path and log an audit event; it must not merely react to a stale poll sample. Prefer NVML as an optional later backend, with `nvidia-smi` as the zero-dependency baseline.

### `loop_guard.py` — **PORT-EARLY (rewrite the detector contract)**

- **What / public API:** Pure in-memory repeated-fingerprint counter. `ActionFingerprint` is at `:8`; `LoopGuard` begins at `:14`; `fingerprint()` is `:19`, `is_looping()` `:24`, `suggest_escalation()` `:35`, and `reset()` `:43`.
- **Coupling:** None to FastAPI, OpenHands, or topology. This is a small reusable seed.
- **Quality:** Very readable and trivially testable for a narrow repeat-within-window policy.
- **Substantiated defects / limitations:**
  - It is never wired to action events or tools; callers must manually invent `operation_class`, `target`, and `approach`, so it does not detect a stuck agent by itself.
  - Invalid configurations are unguarded: `threshold <= 0` loops immediately; `window < threshold` can never loop; `window == 0` stores nothing.
  - Colon concatenation allows ambiguous fingerprints when fields contain colons.
  - It counts repeats but does not detect alternating cycles, carries no action IDs/timestamps/evidence for a card, has no per-run boundary, and has no persistence/cooldown.
- **OH-GUI port work:** Build a run-scoped `LoopDetector` that accepts normalized tool/action records, validates config, hashes a structured canonical fingerprint with redacted arguments, detects both repeats and short cycles, and returns a `LoopFinding` containing action IDs, count/window, examples, and recommended disposition. Persist the finding to the audit log, pause the run, and render the stuck-loop intervention card. Reset/resume must be explicit and auditable; never use the donor's hard-coded escalation text as an execution policy.

### `idempotency_ledger.py` — **PORT-EARLY AS AN ACTION-LEDGER DESIGN, NOT AS A DIRECT PORT**

- **What / public API:** FastAPI-app-state SQLite store. Lifecycle is `init_db()` (`:73`) and `close_db()` (`:100`); key helpers are `_canonical_args_json()` (`:123`), `compute_argument_hash()` (`:134`), `compute_idempotency_key()` (`:139`); operations are `has_completed()` (`:161`), `get_cached_result()` (`:172`), `mark_completed()` (`:204`), and `clear_conversation()` (`:247`).
- **Coupling:** A cwd-relative `data/idempotency_ledger.db` (`:63`), one shared `aiosqlite` connection on `FastAPI.app.state`, and a separate extension-to-BFF HTTP protocol. The actual consumer is `openhands_tools_ext/common/idempotent_executor.py:207-323`, which calls BFF `/api/idempotency/check` before `_execute` and `/mark` after it; network failure deliberately fails open (`:115-200`).
- **SDK probe verification:** The documentation's key SDK claim at `:13-35` is **correct in scope**. SDK 1.40.0 defines `ToolExecutor.__call__(action, conversation: LocalConversation | None = None)` at `openhands/sdk/tool/tool.py:133-155`, and `Tool.execute()` invokes it with the conversation at `:369-373`. `ConversationState.leaf_event_id` is a real field at `openhands/sdk/conversation/state.py:176-183`. A source search found no `task_id` or `step_index` in `openhands/sdk/`. The extension's use of `conversation.id` and `conversation.state.leaf_event_id` is therefore grounded in the SDK contract. The type annotation in the extension is broader (`BaseConversation`) than the SDK's actual executor contract (`LocalConversation`), but that does not invalidate the accessed attributes.
- **Quality:** Key material includes conversation, branch leaf, tool and normalized argument hash (`:139-153`), which is a useful replay/cache identity. The explicit root sentinel is sensible (`:65`, `:150`).
- **Critical defects / incorrect claim:**
  - This does **not** provide exactly-once side effects. Both workers can execute `has_completed()` (`:161-169`) before either invokes the side effect, then both call `mark_completed()`. `INSERT OR IGNORE` (`:217-244`) only suppresses the second database row after both effects may have occurred. A crash after `_execute()` and before `_mark_completed()` in the extension (`idempotent_executor.py:313-322`) also replays the effect. The extension's statement that an `INSERT OR IGNORE` protects that crash (`:18-23`) is false.
  - BFF check/mark failures are fail-open (`idempotent_executor.py:123-153`, `:170-200`), so availability failure intentionally disables deduplication. That may be reasonable for tool availability, but it cannot be called enforcement.
  - The `default=str` claim of stable representation (`idempotency_ledger.py:126-129`) is too broad: arbitrary values can stringify with process-specific addresses or noncanonical forms.
  - `result_json` is unbounded (`:225`); only its summary is capped. There is no expiration/pruning policy.
- **OH-GUI port work:** Implement a local authorization **action ledger** with an explicit action UUID/fingerprint and atomic conditional transitions: `proposed → approval_pending → approved → executing → succeeded|failed|interrupted`. Include trust disposition, decision reason, timestamps, and immutable audit receipts. Use a SQLite transaction/unique claim or a lease before executing; tool-specific idempotency keys or a transactional outbox are still required for true external side-effect semantics. Make fail-open vs fail-closed a per-risk policy, not an accidental HTTP behavior. The middleware must pass an explicit action envelope into the executor; do not hide enforcement in an extension calling a second local HTTP service.

### `inference_backends/` — **PORT-LATER; the Protocol is clean only for health inventory**

The package is a reasonable small health-discovery layer, but not a clean inference abstraction. `InferenceBackend` at `protocol.py:15-33` requires static identity, URL, streaming flag, role hint, `health()` and `meta()` only. It lacks invocation/streaming methods, model selection, capability negotiation (tool calls/JSON schema), authentication headers, lifecycle control, request configuration, metrics/tok/s, and a shared error domain. `@runtime_checkable` verifies only attribute presence, not a useful semantic contract. `BackendMeta.id` is a restrictive `BackendKind`, while the Protocol says `id: str` (`types.py:14-21`, `:49-75`; `protocol.py:19`), another indication that this is an inventory model rather than an abstraction boundary.

| Module | What / API | Coupling, quality, defects | Verdict and concrete port work |
|---|---|---|---|
| `inference_backends/__init__.py` | Re-exports backend types/registry (`:15-27`). | Packaging only. | **leave.** Import names can be redesigned with the new port. |
| `inference_backends/protocol.py` | `InferenceBackend` Protocol (`:15`). | Minimal and readable, but health-only as described above. | **port-later.** Replace with a target-owned `InferenceRuntime`/provider interface: `health`, `models`, `capabilities`, optional `metrics`, and a separate request client; do not claim a universal invocation protocol until needed. |
| `inference_backends/types.py` | `BackendKind`, `HealthState`, frozen `BackendHealth` and `BackendMeta`, `as_dict()` (`:14-75`). | Useful immutable result DTOs. Hard-coded kinds/role hints will age badly. | **port-later.** Retain the result-object pattern, make IDs extensible and expose capabilities/error/freshness. |
| `inference_backends/_common.py` | OpenAI-v1 and Ollama health probes; `_probe()` (`:28-105`). | Centralizes HTTP probing. Doc says it uses `asyncio.wait_for`, but implementation uses only `httpx` timeout (`:54-105`). `count_models(body)` assumes object JSON; list JSON raises, violating the Protocol's “health must not raise” intention and causing registry gathering to fail. | **port-later.** Make probe parsing total, return structured errors instead of raising, reuse one injected client, and collect endpoint latency. |
| `adapter_ollama.py` | `OllamaBackend` (`:11`) with native tags health; env URL (`:17-20`). | Appropriate local runtime; URL freezes at instance creation. It offers no request or token-rate API. | **port-later.** Implement an Ollama runtime adapter only after defining target metrics/capability requirements; inject endpoint/config. |
| `adapter_llamacpp.py` | `LlamaCppBackend` (`:16`). | OpenAI-compatible health only; fixed default endpoint/config snapshot. | **leave for now.** Add only if OH-GUI actually supports llama.cpp. |
| `adapter_sglang.py` | `SGLangBackend` (`:16`). | Same health-only, fixed-endpoint pattern. | **leave for now.** Add only when SGLang is an intentional local runtime. |
| `adapter_vllm.py` | `VLLMBackend` (`:25`), `vllm_coder`, `vllm_planner`, `vllm_legacy` factories (`:72-99`). | Unlike other adapters, base URL is dynamically read (`:54`), an inconsistent configuration lifetime. Roles duplicate `model_router.py` policy. | **port-later.** Keep a single target vLLM endpoint provider with actual served-model verification and throughput instrumentation. |
| `registry.py` | Global `BACKEND_REGISTRY` (`:40`), `get_backend()` (`:43`), `list_backends()` (`:49`). | Concurrent health checks are useful, but global objects freeze three adapter configs; `asyncio.gather` propagates an adapter exception. The model router does not use this registry for routing. | **port-later.** Use injected app-owned registry with isolated exceptions, no module globals, no compose assumptions. |

**Implication for the authorization slice:** use the GPU provider plus a lightweight model-request meter for the telemetry strip. Do not block authorization on this package, and do not use `model_router.py` as the backend-selection implementation.

---

## Per-module review

### `__init__.py` — **LEAVE**

- **What / API:** Empty package marker (0 lines).
- **Coupling / quality:** None.
- **Port work:** None. Create a target package layout independently.

### `action_reconstruction.py` — **PORT-LATER**

- **What / API:** Pure projections from events to command, artifact, plan, and browser-frame cards: `build_commands()` (`:119`), `build_artifacts()` (`:184`), `build_plan()` (`:272`), and `build_browser_frames()` (`:314`); supporting action/observation pairing starts at `:53`.
- **Coupling / quality:** No I/O; tool buckets are hard-coded to Forge/OpenHands kinds (`:30-33`, `:311`). Useful audit-view donor after normalization.
- **Defects / assumptions:** Pairing retains the last observation for an action ID (`:53-62`); plan ordering compares timestamps as strings (`:292-295`); browser reconstruction assumes mapping-shaped action arguments/observations and can throw on malformed raw data.
- **Port work:** Consume typed target audit events, preserve ordered IDs rather than positional inference, add schema guards/redaction, and use it later for approval-card evidence and audit panels.

### `conflict_checker.py` — **EXCLUDE-WITH-REASON**

- **What / API:** `ConflictReport` (`:15`) and `ConflictChecker` (`:24`) use `git merge-tree --write-tree`; its public `check_merge()` is at `:28` and `format_pr_description()` at `:73` support a PR workflow.
- **Coupling / quality:** Directly assumes Git branches, `main`, PR descriptions and a claimed “auto-resolve” pathway. That is outside single-user OH-GUI authorization and drifts toward GitHub workflow.
- **Defects:** “Auto-resolved” is never populated; `_parse_conflicts()` uses the last whitespace token and a set, losing reliable filenames/order (`:64-71`). `merge-tree --write-tree` is not a strictly read-only operation because it writes Git objects.
- **Port work:** None now. If later needed, build local Git conflict inspection against an explicit repository boundary, not a PR integration.

### `context_loader.py` — **PORT-LATER, ONLY BEHIND QUARANTINE**

- **What / API:** `ContextDoc` (`:15`) and `ContextLoader` (`:21`) recursively load `.openhands/context`, rank word overlap (`_score()`, `:37-41`), select context with `get_relevant_context()` (`:43`) and build a preamble with `build_context_preamble()` (`:49`).
- **Coupling / quality:** Local file system only. The implementation is compact and fault-tolerant.
- **Defects / authorization issue:** It sends whole selected repository documents directly to the prompt (`:49-57`) with no provenance, size/token cap, trust check, or user approval. Untrusted workspace content can therefore influence the agent. Ranking is naive whitespace overlap and all-zero ties are arbitrary.
- **Port work:** If adopted, classify sources as trusted/untrusted, require quarantine/release semantics, cap input and show provenance in the trust/audit UI. Otherwise leave it out of the first slice.

### `episodic_memory.py` — **PORT-LATER**

- **What / API:** FastAPI-state `aiosqlite` store with `init_db()` (`:28`), `close_db()` (`:50`), `record_event()` (`:68`), `get_recent_events()` (`:88`), and `clear_run_memory()` (`:120`).
- **Coupling / quality:** Cwd-relative `data/episodic_memory.db` and one connection on `app.state` (`:25-58`). Simple local persistence; not directly an authorization component.
- **Defects:** Corrupt `metadata` JSON raises during reads (`:113`); no limit validation; shared connection serializes requests and the path is deployment-cwd sensitive.
- **Port work:** Fold only curated/redacted episodic material into the later audit/memory store, with migrations, path ownership, retention, and quarantine provenance.

### `event_commit_ledger.py` — **PORT-LATER**

- **What / API:** Maps event IDs to workspace SHA: `init_db()` (`:72`), `record_sha()` (`:118`), `get_sha()` (`:161`), `bulk_get_shas()` (`:180`), and `delete_run()` (`:213`).
- **Coupling / quality:** FastAPI-state SQLite and restart/worktree semantics. Its write API includes `run_id`; that is the correct intended identity.
- **Defects:** Schema primary key is `(run_id, event_id)`, but reads ignore `run_id` (`:161-205`), relying on globally unique IDs despite the schema allowing collisions. `INSERT OR REPLACE` makes the purported history mutable. Cwd DB path again.
- **Port work:** Use an immutable audit/checkpoint record keyed by run and event, if restart/checkpointing is later approved. Do not make commit SHA mapping a prerequisite for authorization.

### `event_fetch.py` — **PORT-LATER**

- **What / API:** `fetch_all_events()` at `:17` pages the Agent Server events endpoint with a hard 200-page cap.
- **Coupling / quality:** Direct `bff.openhands_client` and FastAPI `HTTPException`; a useful convenience wrapper only for the existing BFF HTTP topology.
- **Defects:** It maps all client errors to run-not-found (`:36-40`), concealing authentication, malformed request, rate, and server errors. The cap can truncate without an explicit partial-result flag; response-shape handling is heuristic.
- **Port work:** Put agent-server access behind a target SDK/client port with typed error classes, cursor semantics, and visible partial/truncation status.

### `event_relay.py` — **PORT-LATER**

- **What / API:** Global Socket.IO relay; `set_sio()` (`:53`), private polling loop (`:134`), `start_relay()` (`:281`), `stop_relay()` (`:288`), and `shutdown_all()` (`:294`). It polls conversation state and pages events, emits normalized UI events and a special approval-required message (`:172-192`, `:222-249`).
- **Coupling / quality:** Strong dependency on direct Agent Server HTTP, Socket.IO rooms, module globals, polling cadence, and Forge sidecar producers. Good attempt at a single event route, but it is not thin middleware.
- **Defects:** Cursor state is in-memory and restart replays history; there is no event-ID deduplication. A transient page fetch error produces an empty page and keeps retrying without backoff (`:123-125`). Sidecar work is awaited for every event, so a slow producer serially delays relay progression. Live normalization omits SHA lookup, differing from HTTP reload.
- **Port work:** Later, make an injected run stream manager using the SDK's best available stream/transport, persistent cursor+event-ID dedupe, backoff, and an internal audit broadcaster. Authorization cards should be generated from policy records, not a Socket.IO special case.

### `file_diff_reconstruction.py` — **PORT-LATER**

- **What / API:** Reconstructs file contents/diffs from file-editor observations: `_guess_language()` (`:58`), `_line_stats()` (`:74`), `reconstruct()` (`:145`), `build_summaries()` (`:167`), `build_file_diff()` (`:174`).
- **Coupling / quality:** Pure projection; event-kind/field-dependent. Valuable approval/audit evidence after a trusted event adapter exists.
- **Defects:** Event order is not sorted despite documentation (`:145-150`); deletion is unsupported; create/overwrite and `prev_exist` cases can misclassify original/new content; raw file content can expose secrets to UI/audit without redaction.
- **Port work:** Use ordered typed mutations, represent deletes and binary/large content, contain paths, cap/redact diffs, and tie each diff to a tool action/approval record.

### `hook_config.py` — **PORT-LATER**

- **What / API:** `_hook_python()` (`:42`) and `build_hook_config()` (`:47`) generate OpenHands pre-tool/stop hook command configuration.
- **Coupling / quality:** Depends directly on `openhands_tools_ext.gpu.hook`, a particular interpreter, `OPENHANDS_PROJECT_DIR`, and the donor extension installation. Its hook ordering concept is useful.
- **Defects:** Python command strings are unquoted (`:47+`), so paths containing spaces break. It has no policy decision or audit logic itself.
- **Port work:** After defining OH-GUI's policy port, translate decisions to SDK-supported hook/config APIs with verified package availability and structured command arguments. Prefer the middleware action envelope to shell command hooks for approval enforcement.

### `mcp_bootstrap.py` — **EXCLUDE-WITH-REASON**

- **What / API:** Builds/installs a Serena MCP configuration: `_build_serena_upstream_server()` (`:47`), `_mcp_config_from_settings()` (`:78`), `register_serena_if_missing()` (`:87`).
- **Coupling / quality:** Calls Agent Server settings endpoints and uses an `uvx --from git+...` command; global workspace default is configuration-driven. Broad exception handling is appropriate for optional startup but masks reason detail.
- **Reason to exclude:** Runtime retrieval from a Git source and dynamic Agent Server settings mutation do not belong in the local authorization slice and violate the no GitHub-native runtime dependency direction.
- **Port work:** None. Evaluate a pinned local MCP package separately, with explicit user approval and provenance.

### `memory_events.py` — **LEAVE (REFERENCE ONLY)**

- **What / API:** Defines `MEMORY_CONSULTATION_KIND`, event factory `build_memory_consultation_event()` (`:43`) and Socket.IO emitter `emit_memory_consultation()` (`:115`).
- **Coupling / quality:** Custom Forge event plus Socket.IO relay. Input/query text is copied into an event.
- **Defects:** Emitter swallows all exceptions (`:147-150`), unsuitable for a durable audit trail; raw query can be sensitive.
- **Port work:** If a memory slice follows, send redacted, provenance-tagged records through the new audit service rather than direct Socket.IO.

### `metrics_aggregation.py` — **LEAVE FOR AUTHORIZATION; PORT-LATER FOR LOCAL ANALYTICS**

- **What / API:** Agent Server conversation aggregation: `summary()` (`:211`), `daily()` (`:264`), `models()` (`:312`), `workspaces()` (`:343`) backed by a private paged fetcher.
- **Coupling / quality:** Direct Agent Server search API. Clear aggregations, but not live local telemetry.
- **Defects:** Network errors turn into apparently valid partial metrics (`:66-74`); response and numeric fields are weakly validated; `period=all` still makes a 30-day daily series (`:268`); elapsed time includes idle wall time. It does not supply tok/s or VRAM.
- **Port work:** Build later from OH-GUI's own audit/run store with explicit partial/error status. Do not use as telemetry-strip source.

### `model_router.py` — **EXCLUDE-WITH-REASON (reuse only architectural lessons)**

- **What / API:** Role catalog/routing and vLLM supervisor orchestration: `ModelUnavailableError` (`:174`), `RoleRoute` (`:179`), `RoleCatalog` (`:224`), compatibility/canonical routing (`:269`, `:282`), health (`:288`, `:302`, `:330`), supervisor startup (`:347`), configuration (`:416`, `:425`), and `route_by_role()` (`:434`).
- **Coupling / quality:** Import-time `.env` load/cwd config (`:50-61`), fixed local ports/model policy, shell `ops/vllm_supervisor.sh` (`:134-157`), and an assumption that exactly one vLLM role is resident. This is an operational topology, not a reusable BFF service.
- **Defects:** Role catalog ignores environment overrides (`:246-266`). On supervisor timeout, the subprocess is left running and the lock is released (`:404-410`), enabling duplicate launch attempts and pipe lifecycle leaks. Readiness accepts any nonempty served-model list rather than the intended model. `context_length` is unused (`:452-454`).
- **Port work:** Do not copy. Later, if needed, design a target-owned single-GPU runtime controller with explicit model identity validation, cancellation/timeout process ownership, and a policy for resident model swaps. Budget pre-check belongs in authorization policy and must estimate context/token/memory before routing.

### `repograph_registry.py` — **LEAVE / PORT-LATER**

- **What / API:** `WorkspaceEntry` (`:23`) and global registry functions `register()` (`:32`), `lookup()` (`:41`), `list_entries()` (`:46`), `clear()` (`:51`).
- **Coupling / quality:** Pure local in-memory registry, simple lock. It deliberately loses state on restart.
- **Defects:** Registering any caller-supplied path has no approved-root/ownership check; that conflicts with a workspace trust boundary.
- **Port work:** Only if repo graph support is added later: persist approved workspace roots and enforce containment/quarantine state.

### `restart.py` — **PORT-LATER**

- **What / API:** Restart/fork from an event: `RestartError` (`:58`), `RestartResult` (`:89`), `_extract_message_text()` (`:105`), `_mint_run_id()` (`:158`), `restart_from_here()` (`:163`), and `_fetch_event()` (`:399`).
- **Coupling / quality:** Direct Agent Server schema/API, event-commit ledger, and worktree lifecycle. It attempts useful cleanup/compensation when seeding fails.
- **Defects:** `_fetch_event()` hard-stops after ten 100-item pages (`:399-472`) and reports a real old anchor as not found. `_extract_message_text()` returns only the first text chunk (`:130-139`). A worktree is provisioned under minted `new_run_id`, while Agent Server returns `new_cid` (`:257-266`), making later ownership/cleanup inconsistent. Seed failure removes worktree but leaves an orphan conversation.
- **Port work:** After the audit/run model is stable, create restart as an explicit immutable checkpoint/fork workflow with consistent IDs, event lookup by id/cursor, full content handling, and audited compensation.

### `run_compare.py` — **EXCLUDE-WITH-REASON UNTIL A SNAPSHOT MODEL EXISTS**

- **What / API:** `compare_runs()` (`:150`) combines reconstructed artifacts with current worktree file reads.
- **Coupling / quality:** Depends on donor worktree paths and event reconstructions; useful UX concept, inaccurate implementation.
- **Defects:** Classification treats “touched by one run” as added/deleted, not a content diff (`:150+`). It reads present files rather than recorded snapshots, so comparison drifts. `_read_text_safe()` joins an event-supplied relative path without checking resolved containment (`:118-123`), allowing `../../` traversal outside the root.
- **Port work:** Do not port now. Later use Git/object snapshots and enforce resolved-root containment before any local read.

### `run_metadata_store.py` — **PORT-LATER**

- **What / API:** `RunMetadata` (`:14`) and `RunMetadataStore` (`:21`) with `upsert()` (`:46`), `get()` (`:78`), and `get_title()` (`:99`).
- **Coupling / quality:** Local SQLite with new connection per operation; mutable metadata is separate from a true audit record.
- **Defects:** Read-then-write upsert has race/lost-update potential; no WAL/busy policy or path injection; no list/delete/migration interface.
- **Port work:** Fold a small metadata table into the target run/audit database later, using atomic UPSERT and schema migrations. It is not sufficient for authorization history.

### `run_metrics.py` — **PORT-LATER**

- **What / API:** Pure `build_run_metrics()` (`:30`) returns token/tool/file aggregate metrics from normalized events.
- **Coupling / quality:** Event-shape dependent; useful starting point for historical summary.
- **Defects:** `or` token fallback ignores legitimate zero values (`:76`), and events can be double-counted if completion and token events both represent one generation. The declared time series is always empty (`:90`), so it cannot report tok/s. `_pair_observations` is imported but unused (`:15`, `:95`).
- **Port work:** Build target metrics from explicit generation start/end/token records and GPU samples; expose rates/freshness, not just totals.

### `search_events.py` — **PORT-LATER, WITH QUARANTINE**

- **What / API:** Custom web-search event factory `build_web_search_event()` (`:41`) and Socket.IO emitter `emit_web_search()` (`:116`).
- **Coupling / quality:** Forge custom kind plus relay. It captures search query/provenance but not a real trust policy.
- **Defects / authorization issue:** The emitter swallows failure (`:150-153`). Search content/provenance is external, but no untrusted-content classification or release path exists.
- **Port work:** When web tools are enabled, emit audited source records with trust status, sanitized snippets, provenance, and explicit quarantine/release before content reaches prompting or action proposals.

### `sidecar.py` — **EXCLUDE-WITH-REASON**

- **What / API:** Linux file-backed trajectory sidecar: `sidecar_path()` (`:70`), locked RMW helper (`:93`), `seed_sidecar()` (`:132`), `update_sidecar()` (`:180`).
- **Coupling / quality:** Depends on `.forge-oh/trajectory-sidecar.json`, fcntl locking, and `openhands_tools_ext.trajectory.hook`. Its temp+replace sequence is a good local atomic-write pattern.
- **Defects:** A parse failure returns `{}` and the next update overwrites the corrupt file without backup; content/task text has no size, schema, or sensitivity controls.
- **Reason to exclude:** It is a private extension-hook file contract, not authorization infrastructure.
- **Port work:** None now. If later needed, use a declared versioned schema, bounded/redacted fields, and target-owned storage.

### `sidecar_producers.py` — **EXCLUDE-WITH-REASON**

- **What / API:** Accumulates raw events per conversation and regenerates trajectory sidecar data. `reset_accumulator()` is `:86`; `update_from_event()` is `:414`; it imports action/file reconstruction and sidecar persistence.
- **Coupling / quality:** Strong coupling to the sidecar file contract, global in-memory accumulators, and event relay thread calls.
- **Defects:** Each event recomputes multiple projections over the full accumulated history and writes the file (`:437-468`): O(n²) work plus I/O over a run. At 5,000 events it silently discards the earliest evidence, corrupting future reconstruction; there is no dedupe, lock, provenance, or sensitive-data control.
- **Port work:** Do not port. Reuse individual pure projections only after the target event adapter/audit store exists.

### `trace_reconstruction.py` — **PORT-LATER**

- **What / API:** Reconstructs trace spans: `_kind_for()` (`:75`), `_duration()` (`:83`), `_tool_span()` (`:114`), `_llm_usage()` (`:157`), `build_spans()` (`:168`), `build_trace_summary()` (`:235`).
- **Coupling / quality:** Pure event projection and potentially useful for audit/diagnostics.
- **Defects:** `_kind_for()` returns `verify` (`:71-80`) but the documented frontend union omits it (`:14`), a schema mismatch. LLM duration is often zero rather than generation duration; empty action IDs can collide; repeated action IDs overwrite pairing; numeric usage fields are insufficiently validated before aggregation.
- **Port work:** Later produce target telemetry/audit spans with validated IDs, elapsed generation timing, and a declared UI schema.

### `trajectory_drain.py` — **EXCLUDE-WITH-REASON**

- **What / API:** Scheduled draining to an external trajectory/index store: `DrainMetrics` (`:106`), `TrajectoryDrainScheduler` (`:124`), `get_scheduler()` (`:256`), `start_scheduler()` (`:261`), and `stop_scheduler()` (`:280`).
- **Coupling / quality:** Depends on `openhands_tools_ext.trajectory` storage/writer and environment settings; unrelated to the authorization minimum.
- **Defects:** Cancelling the asyncio task does not cancel an in-flight `asyncio.to_thread()` index operation; global getter returns the existing scheduler even if a different store is supplied.
- **Port work:** None in this phase. Avoid background embedding/index work competing for the local GPU.

### `worktree.py` — **PORT-LATER**

- **What / API:** Local Git worktree lifecycle. `get_worktree_root()` (`:51`), `get_worktree_path()` (`:103`), `worktree_exists()` (`:114`), `provision_worktree()` (`:127`), `remove_worktree()` (`:204`), `head_sha()` (`:290`), `list_worktrees()` (`:332`), plus path validation helpers (`:345+`).
- **Coupling / quality:** Git executable, local source repo, environment-configured root; contains strong run-ID validation and resolved-root checks. A useful future local isolation primitive.
- **Defects:** Source-repo validation requires a `.git` directory (`:155`), rejecting bare-repository setups. Cleanup's fallback `subprocess.run()` is outside the main exception normalization and can leak raw process errors (`:275-282`). Forced removal is destructive and needs an authorization/audit decision.
- **Port work:** Later adapt as an approved-workspace isolation service: canonical root allowlist, consistent run/worktree IDs, audited confirmation before forced removal/reset, robust subprocess errors/timeouts, and bare-repo support if required.

---

## Authorization-slice implementation order suggested by this review

1. **Define target-owned event and audit records.** Include raw reference, trust/quarantine state, action proposal/fingerprint, approval, stop, budget, loop and diagnostic events. Implement and fixture-test the rewritten `EventAdapter` first.
2. **Implement the action ledger/policy gate.** Use atomic proposed/approved/executing/terminal transitions, explicit fail-open/fail-closed risk rules, audit receipts, and a concrete interrupt path.
3. **Add local telemetry.** Port the GPU sampling concept with freshness and safe process management. Add a separate inference-token rate meter. Render VRAM/tok/s in the strip without making GPU thresholds a substitute for stop enforcement.
4. **Add loop detection and intervention.** Normalize tool actions into structured fingerprints; persist evidence and pause for the card.
5. **Add evidence projections only as needed.** File diffs, commands, plans and traces must consume the typed/sanitized audit stream, not raw untrusted event dictionaries.

This preserves the valuable local-first parts of Forge-OH while rejecting its deployment-specific orchestrators and its unsupported exactly-once claim.
