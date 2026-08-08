# Forge-OH `openhands_tools_ext` donor review

**Scope reviewed:** Forge-OH commit `df73ebed2d6d9df9397f7e95dd1eb66bd3dd98b2`; 69 non-test files / 11,282 source lines in `openhands_tools_ext`. Forge-OH pins `openhands-sdk`, `openhands-tools`, `openhands-agent-server`, and `openhands-workspace` to **1.40.0** (`requirements.txt:6-9`). I also unpacked the 1.40.0 and 1.41.0 SDK wheels and compared `openhands/sdk/hooks`; the hook-package diff is empty.

## Review confidence and limits

- **Fully read:** every non-test source/config file in the requested package, including all small package export files. The file/read receipt is retained at `/home/user/workspace/review_tools_ext_read_receipt.txt`.
- **Line-level substantive review:** the three hooks, common executor, memory ports/composition/Dozer adapter/curation, RepoGraph index/store, SearXNG adapter and tool, self-eval harness, all tool-invocation modules, trajectory hook/writer/store/schema interfaces, verify hook/loop/runner/selector/schema, and `write_note`.
- **Read but not reconstructed line-by-line in this report:** RepoGraph parser, real Dozer/Qdrant/Ollama transport backends, semantic-memory helper, embedding/retrieval details, self-eval CLI/proposer/manifest, and package `__init__` re-export files. Their public APIs, imports, service dependencies, and tests were catalogued; no conclusion below depends on an unverified claim about their internal algorithm.
- **Tests:** 36 test files / 5,389 lines were inventoried and skimmed for assertions and missing integration boundaries. I did not run the donor suite, because its pinned SDK/runtime/services are not installed in this review environment. The central hook contract was checked against the actual 1.40/1.41 SDK source instead.

## Decision

**Do not port this extension wholesale.** The valuable donor evidence is the OpenHands command-hook seam and several clean local interfaces. The present wiring is not an authorization plane: only GPU is a pre-tool hook; verify and trajectory are stop hooks; verify’s claimed block signal is ignored by the SDK; and the system has no approval, capability, mutation, or fail-closed timeout semantics.

| Candidate | Verdict | Why |
|---|---|---|
| Pre-tool hook contract as a reference implementation | **port-early** | It is the relevant SDK seam for authorization, once wrapped in a new local policy service and protected by regression tests. |
| `gpu/hook.py` thermal guard | **port-later** | Correct use of `exit 2`/`deny`, but it is a hardware availability guard, not authorization, and deliberately fails open. |
| Memory **ports** and typed DTOs | **port-later** | Good dependency boundaries and provenance/confidence validation; needs a real quarantine/approval policy. |
| DozerDB-backed memory and RepoGraph Neo4j store | **exclude-with-reason** | DozerDB is GPLv3; it also introduces a running graph service. Do not pull it into OH-GUI’s authorization slice. |
| SearXNG search port/tool | **port-later** | Useful local-search abstraction, but it needs a running SearXNG service and an untrusted-content quarantine path first. |
| RepoGraph parser/index | **port-later** | Useful local static-analysis unit, independent of SDK; its current name-only call resolution is intentionally approximate. |
| Progressive-disclosure tools | **port-later** | Small, readable SDK-registry helpers; attach capability classification before exposing schemas. |
| `code_execute` | **exclude-with-reason** | Intentionally accepts arbitrary Python in the agent-server boundary; this must be a high-risk, explicit authorization capability, not a donor import. |
| Verify and trajectory **libraries** | **port-later** | Selective components are useful, but their hook wiring has material correctness defects. |
| Verify/trajectory **hooks** as shipped | **leave** | They are stop lifecycle hooks, not tool interception; verify does not actually block, and trajectory can record false success. |
| Self-eval harness/proposer | **leave** | It assumes Forge-OH BFF routes and has a concrete constructor bug. |
| Idempotency mixin and `write_note` sample | **leave** | Fine demonstration code, but not authorization infrastructure; the mixin cannot guarantee exactly-once across a crash. |

---

## Central question: exact SDK hook mechanism

### What is actually registered

Forge-OH’s BFF injects a plain `hook_config` object into every conversation-create request (`bff/services/hook_config.py:1-5`, `47-88`):

| Forge module | SDK event | Matcher / command | Timeout | What it really intercepts |
|---|---|---|---:|---|
| `gpu.hook` | `pre_tool_use` | `matcher: "*"`; `python -m openhands_tools_ext.gpu.hook` | 5 s | **Every pending tool action** |
| `verify.hook` | `stop` | `matcher: "*"`; `python -m openhands_tools_ext.verify.hook` | 120 s | An agent stop attempt, **not a pending tool call** |
| `trajectory.hook` | `stop` | `matcher: "*"`; `python -m openhands_tools_ext.trajectory.hook` | 60 s | An agent stop attempt, **not a pending tool call** |

All three are SDK `HookType.COMMAND` subprocess hooks (`bff/services/hook_config.py:18-21`, `56-87`). `matcher: "*"` is a `HookMatcher` tool-name matcher for `PreToolUse`; it has no meaningful per-tool payload on `Stop`.

### SDK classes, callback chain, and registration

The exact 1.40 mechanism is:

1. Agent-server accepts the conversation `hook_config`, validates it as `HookConfig` containing `HookMatcher` and `HookDefinition` (`openhands/sdk/hooks/config.py:39-99`, `113-206`).
2. `HookEventProcessor` is installed around the conversation callback. When it receives an `ActionEvent`, it invokes `HookManager.run_pre_tool_use(...)` before the original callback (`openhands/sdk/hooks/conversation_hooks.py:110-177`).
3. The processor passes:
   - `tool_name = event.tool_name`;
   - `tool_input = event.action.model_dump()`;
   - the conversation/session id and working directory.

   This is important: the hook sees the serialized **action model**, not the complete `ActionEvent`. It does **not** receive the event ID, LLM thought/reasoning, security risk, tool-call ID, or an authorization/capability object unless those happen to be fields of that action model (`conversation_hooks.py:128-149`).
4. `HookManager.run_pre_tool_use` selects all matching `PRE_TOOL_USE` hooks, creates a `HookEvent`, and calls `HookExecutor.execute_all(..., stop_on_block=True)` (`openhands/sdk/hooks/manager.py:70-99`).
5. `HookExecutor` runs a configured command synchronously with `subprocess.run(..., shell=True)`, JSON `HookEvent` on stdin, and `OPENHANDS_PROJECT_DIR`, `OPENHANDS_SESSION_ID`, `OPENHANDS_EVENT_TYPE`, and `OPENHANDS_TOOL_NAME` in its sanitized environment (`hooks/executor.py:390-472`).
6. For a denial, the processor records hook execution events and calls `conversation_state.block_action(event.id, reason)` (`hooks/conversation_hooks.py:151-176`). The SDK then refuses that action rather than executing it.

The command’s stdin JSON is the SDK `HookEvent` model:

```json
{
  "event_type": "PreToolUse",
  "tool_name": "<registered tool name>",
  "tool_input": { "<serialized Action fields>": "..." },
  "tool_response": null,
  "message": null,
  "session_id": "<conversation id>",
  "working_dir": "<workspace>",
  "metadata": {}
}
```

Those are the model’s fields (`hooks/types.py:20-32`), subject to omitted `null` values during serialization. It is suitable for policy evaluation over tool identity and normalized action arguments, but not a complete audit record by itself.

### What a command hook can do

| Operation | Result |
|---|---|
| Inspect tool name / arguments | **Yes** for `PreToolUse`; `tool_name` plus `action.model_dump()` are sent to stdin. |
| Block the pending action | **Yes.** Return process exit code **2**, JSON `{"decision":"deny","reason":"..."}`, or JSON `{"continue":false}`. `HookResult.should_continue` blocks for exit 2 or decision `deny` (`hooks/executor.py:28-66`, `475-510`). |
| Add diagnostic context | **Partly.** The executor recognizes camel-case `additionalContext` in the result JSON (`hooks/executor.py:483-510`). |
| Modify/replace the action or its arguments | **No.** `HookResult` has no action-replacement/mutation field, and the processor forwards the original `ActionEvent`; this is allow/block, not a transform middleware. |
| Present an SDK-native “ask” approval state | **No.** The decision parser recognizes allow/deny; `ASK` is only a future/commented concept in the type enum (`hooks/types.py:35-45`). |
| Fail closed on hook transport failure or timeout | **No.** Exit code 1, exception, malformed output, and timeout create an error result rather than a block; only exit code 2 blocks (`hooks/executor.py:28-45`, `449-510`). |
| Stop an already-running tool | **No.** Pre-tool hooks run before action execution. A later emergency-stop state can block later actions, but does not cancel an in-flight child process. |

**Consequence for OH-GUI authorization:** use one deliberately designed `PreToolUse` wildcard command hook as the immediate enforcement seam. Its local policy endpoint/process must make a durable decision from `tool_name`, `tool_input`, run/session ID, and policy revision; return `deny` or exit 2 for denial; and append an audit record before replying. Never make the authorization hook fail open on policy-service errors or timeout. A short-lived command-hook protocol is insufficient for approval cards by itself: it can synchronously wait on localhost IPC for a front-end decision, but the timeout/connection failure must deny and the UX must explicitly handle expired requests. Capability manifest, trust dial, approval state, cancellation, and content quarantine must be owned by OH-GUI middleware/BFF, not inferred from this hook.

### The three donor hooks

#### `gpu/hook.py`: actual pre-tool guard

- **Registration:** wildcard `pre_tool_use` command hook (`bff/services/hook_config.py:56-67`).
- **Payload consumption:** it reads and discards stdin rather than parsing the `HookEvent` (`gpu/hook.py:179-185`). It therefore cannot inspect the pending tool name or arguments.
- **Policy:** fetches BFF GPU telemetry from `FORGE_BFF_URL` and evaluates temperature, VRAM, utilization, and optional power thresholds; threshold breaches emit `{"decision":"deny", ...}` and exit **2** (`gpu/hook.py:71-93`, `164-172`, `248-298`).
- **Blocking/modification:** it blocks correctly; it cannot modify the action. It intentionally allows when the BFF poller is unreachable or unavailable (`gpu/hook.py:189-199`), which is rational for availability but unacceptable for an authorization gate.

#### `verify/hook.py`: stop hook, and currently non-enforcing

- **Registration:** `stop`, not `pre_tool_use` (`bff/services/hook_config.py:69-87`).
- **Payload consumption:** parses the event only to require `event_type == "Stop"` and optionally looks for `metadata.edited_files` (`verify/hook.py:92-136`). SDK `HookManager.run_stop` creates a Stop event with only session id and `metadata={"reason": reason}`; it does not supply edited files, action/tool data, or a run ID (`hooks/manager.py:177-196`).
- **Claimed behavior:** `VerifyLoop` returns `block=True` after a failed verification under the retry cap (`verify/loop.py:162-175`).
- **Actual output:** `VerifyDecision.to_hook_json()` writes `{"decision":"block"}` (`verify/loop.py:57-69`), then `verify/hook.py` exits **0** (`verify/hook.py:151-155`).
- **Actual SDK result:** the SDK recognizes `decision == "deny"`, not `"block"` (`hooks/executor.py:483-510`). Therefore the hook’s advertised retry block is ignored and Stop continues. This is a confirmed defect, not a compatibility hypothesis.

#### `trajectory/hook.py`: stop-side persistence only

- **Registration:** `stop`, not `pre_tool_use` (`bff/services/hook_config.py:69-87`).
- **Payload consumption:** requires only Stop/session/workspace, reads `.forge-oh/verify-state.json` and `.forge-oh/trajectory-sidecar.json`, then uses `event.get("run_id") or session_id` (`trajectory/hook.py:265-313`).
- **Blocking/modification:** it always returns 0 after a successful write; it cannot block or modify a pending action.
- **Status correctness:** it defaults a stop event without an explicit verdict to `SUCCESS` (`trajectory/hook.py:157-196`), on the stated premise that Stop means `execution_status == FINISHED` (`170-176`). The SDK Stop event has no `execution_status` field and is invoked for a generic stop attempt with a `reason` field (`hooks/manager.py:177-196`). This can falsely label aborted/error runs as successful when no sidecar overrides the status.

### Stop-hook ordering defect

Forge-OH documents that stop hooks “do NOT short-circuit” so verify and trajectory “always execute” (`bff/services/hook_config.py:23-27`). The actual SDK calls `execute_all(..., stop_on_block=True)` for Stop (`hooks/manager.py:180-196`), and `execute_all` stops at the first blocked result (`hooks/executor.py:536-553`).

At present verify does not block due to the `"block"`/`"deny"` defect, so trajectory happens to run. If verify is corrected to deny, a failed verification will prevent the later trajectory hook from running. This makes the documented guarantee false and requires an intentional design choice: persist verification/trajectory data inside the verifier before denial, or use one orchestrator hook.

### Version assessment: 1.40 versus 1.41

The hook source directory in the unpacked 1.40.0 and 1.41.0 wheels is byte-for-byte unchanged. Thus the mechanics above are valid for OH-GUI’s 1.41.0 target. The donor is nevertheless 1.40-pinned and relies on semi-private behavior such as `ActionEvent.action.model_dump()`, `ConversationState.block_action`, environment variables, import-time registry registration, and a synchronous `ToolExecutor.__call__`. Pin 1.41 in OH-GUI and add SDK-contract tests for the exact payload and `deny` behavior rather than treating the donor’s 1.40 assumptions as a stable public policy API.

---

## Per-subpackage review

### `common/idempotent_executor.py`

- **Purpose / API:** `IdempotentToolExecutor` wraps SDK `ToolExecutor`; `_check_completed` and `_mark_completed` call a local BFF ledger, keyed by conversation ID, leaf event ID, tool name, and action arguments (`common/idempotent_executor.py:115-205`, `207-323`).
- **SDK coupling:** inherits `openhands.sdk.tool.tool.ToolExecutor`; discovers conversation/state attributes dynamically, including `leaf_event_id`.
- **Dependencies:** local BFF at `FORGE_BFF_URL` (default loopback) and `httpx`.
- **Quality:** compact, typed, and clearly designed for a sample side effect. It explicitly strips the SDK `kind` discriminator (`252-270`).
- **Defects:** it executes the side effect before marking completion (`313-322`). A crash or BFF failure between those operations repeats the effect on retry, so it is **not exactly once** across a crash. It also bypasses the ledger entirely when it cannot resolve a conversation ID (`287-293`). Those are reasonable best-effort tradeoffs, but not an authorization/audit primitive.
- **Verdict:** **leave**.

### `gpu`

- **Purpose / API:** a command-hook executable with `main()`, GPU snapshot fetching, peak calculation, and deny JSON emission (`gpu/hook.py:63-317`).
- **SDK coupling:** only the 1.40 command-hook stdin/exit convention; registered as `pre_tool_use` wildcard.
- **Dependencies:** local BFF `GET /api/gpu`; no GPU library in this process.
- **Quality:** strong unit coverage of thresholds and failure-open paths (18 tests in `tests/gpu/test_hook.py`).
- **Defects:** it discards the event, cannot apply per-tool policy, and fails open on BFF outage (`179-199`).
- **Verdict:** **port-later**.

### `memory`

- **Purpose / APIs:** well-separated `MemoryPort`, `EmbeddingsPort`, and `VectorPort`; typed `MemoryEventId`, `MemoryHit`, `MemoryEventRecord`; `DozerDbMemoryAdapter`; `OllamaEmbeddingsAdapter`; `QdrantVectorAdapter`/`RealQdrantBackend`; `curated_write`; and SDK `ConsultMemoryTool` (`memory/ports/memory.py:41-280`, `memory/adapters/dozerdb/adapter.py:69-151`, `memory/curation/ace_cycle.py:66-274`, `memory/tools/consult_memory.py:103-338`).
- **SDK coupling:** only `consult_memory`, which uses `Action`, `Observation`, `ToolDefinition`, `ToolExecutor`, and import-time `register_tool`; ports/adapters are SDK-independent.
- **Dependencies:** DozerDB/Neo4j Bolt service, Ollama embedding service, and Qdrant service. Composition defaults to local DozerDB on `bolt://localhost:7687`, Ollama on `:11434`, and Qdrant on `:6333` (`memory/composition.py:9-33`, `83-128`). **DozerDB is GPLv3**; do not vendor or ship it in OH-GUI. Qdrant and Ollama are optional in code but require their services to be running for semantic memory.
- **Quality:** the port boundary and pure zero-trust checks are useful: non-empty provenance and numeric confidence in `[0,1]` are enforced before backend I/O (`memory/ports/memory.py:105-143`). Curation is deterministic and does not silently swallow that validation (`memory/curation/ace_cycle.py:209-274`).
- **Defects / limitations:**
  - The production composition explicitly installs `NoOpAmgPolicy` (`memory/composition.py:27-33`, `112-127`), whose evaluator always returns `allow` (`memory/adapters/dozerdb/adapter.py:95-99`). The quarantine/block classes are test doubles, not active untrusted-content enforcement.
  - A memory write spans graph, temporal, embedding, and vector operations. The code describes a staged path rather than one cross-store transaction (`adapter.py:16-28`); partial success is therefore possible if a later lane fails.
  - `curated_write` calls semantic search before write, but the “merge” action still persists the candidate rather than merging it (`ace_cycle.py:187-203`, `256-274`).
- **Test quality:** only `consult_memory` has a dedicated tool test in this package. No test files cover the DozerDB, Qdrant, Ollama, composition, curation, or port implementations; the in-memory protocol doubles do not substitute for service integration coverage.
- **Verdict:** **port-later** for ports/DTOs and possibly curation; **exclude-with-reason** for the DozerDB composition/adapter because of GPLv3 and the external graph daemon.

### `repograph`

- **Purpose / APIs:** `extract_tags`/`language_for_path`, `build_index`, `iter_source_files`, immutable index DTOs, and `Neo4jStore` with `replace_repo`, search, callers/callees, context bundle, and graph projection (`repograph/parser.py:49-627`, `repograph/index.py:116-437`, `repograph/store.py:57-462`).
- **SDK coupling:** none.
- **Dependencies:** `tree-sitter` and `tree-sitter-language-pack` for parsing; `neo4j` driver plus a running Neo4j/DozerDB-compatible service only for `Neo4jStore` (`bff/requirements.txt:27-37`); `git` is optionally invoked for file discovery (`repograph/index.py:116-144`).
- **Quality:** indexer and store have substantial pure-unit coverage (40 tests across index/parser/store). `replace_repo` correctly does delete and rebuild inside a transaction (`repograph/store.py:73-211`).
- **Defects / limitations:** reference resolution is name-only, preferring same-file then linking every global same-name match (`repograph/index.py:232-273`), so over-approximation is designed in; PageRank assigns every symbol in a caller file the file-level call edge (`315-346`). Good for navigation, not proof of semantic call relationships.
- **Verdict:** **port-later** for parser/index; **exclude-with-reason** for the Neo4j/DozerDB store in this OH-GUI slice.

### `search`

- **Purpose / APIs:** `SearchPort`, `SearxngAdapter`, `get_searxng_adapter`, and SDK `SearchWebTool` / `SearchWebExecutor` (`search/ports/search.py:23-88`, `search/adapters/searxng/adapter.py:113-234`, `search/tools/search_web.py:95-346`).
- **SDK coupling:** the tool synchronously calls `asyncio.run` from `ToolExecutor.__call__`, emits best-effort timeline telemetry over BFF HTTP, and import-registers `search_web` (`search/tools/search_web.py:238-346`).
- **Dependencies:** `httpx` plus a **running SearXNG service**, default `http://127.0.0.1:18888` (`search/adapters/searxng/adapter.py:40-42`). It can reach public URLs through SearXNG; that content is untrusted.
- **Quality:** clean port/adapter/tool separation, 14 tool tests and 5 adapter-contract tests. Backend failure intentionally becomes a provenance-bearing empty response (`180-208`).
- **Defects / limitations:** the empty-result-on-any-exception behavior loses the distinction between “no results” and “service failure.” More importantly, result snippets are passed to the agent with no content-risk label or quarantine handoff, while the tool is annotated `openWorldHint=True` (`search_web.py:291-338`).
- **Verdict:** **port-later**.

### `selfeval`

- **Purpose / APIs:** TOML manifest selection, sequential BFF run orchestration, local trajectory scoring, proposer output, and CLI (`selfeval/manifest.py:33-178`, `selfeval/harness.py:42-363`, `selfeval/proposer.py:66-245`, `selfeval/cli.py:52-222`).
- **SDK coupling:** no direct SDK import; hard-coupled to Forge-OH BFF routes (`/api/agent-presets`, `/api/runs`) and local trajectory DB.
- **Dependencies:** BFF service, agent-server, manifest, and trajectory SQLite store; optional planner endpoint in proposer.
- **Quality:** manifest and harness have good mocked HTTP coverage (about 36 tests), and tasks deliberately run serially for a single local agent loop (`harness.py:283-305`).
- **Confirmed defect:** if resolving the default preset fails, `run_selfeval` constructs `TaskOutcome(..., bff_status=None, ...)` (`selfeval/harness.py:318-330`), but `TaskOutcome` has no `bff_status` field (`42-74`). That error path raises `TypeError` instead of producing the documented error verdict.
- **Verdict:** **leave**.

### `tool_invocation`

- **Purpose / APIs:** `should_use_code_execution`, `CodeExecuteAction`/`Executor`/`Tool`, and progressive `ListToolStubsTool` + `GetToolSchemaTool` (`tool_invocation/router.py:44-101`, `code_exec_mode.py:101-262`, `progressive_disclosure.py:100-279`).
- **SDK coupling:** all tools use `Action`, `Observation`, `ToolDefinition`, `ToolExecutor`, and import-time `register_tool`; progressive disclosure directly calls global registry APIs `list_registered_tools` and `resolve_tool`.
- **Dependencies:** no service dependency for progressive disclosure. `code_execute` starts `python3 -c` under the agent-server environment (`code_exec_mode.py:154-200`).
- **Quality:** all three modules have focused unit tests. `code_execute` correctly avoids shell interpolation by passing fixed argv (`148-151`, `163-177`).
- **Risk:** “no shell” does not make it safe: `python_code` is unconstrained arbitrary Python, inherits the agent-server environment and working directory, and is marked destructive/open-world (`101-117`, `251-257`). It can also invoke other registered tools internally, reducing audit granularity to one high-risk action.
- **Verdict:** **port-later** for progressive-disclosure and router; **exclude-with-reason** for `code_execute` until a trust-dial capability and explicit approval/audit design exist.

### `trajectory`

- **Purpose / APIs:** Pydantic trajectory schema, local SQLite `TrajectoryStore`, optional embedder/retriever, `RunSummary`, `TrajectoryWriter`, `TrajectoryIndexer`, and a Stop command hook (`trajectory/schema.py:38-142`, `store.py:83-306`, `writer.py:49-183`, `hook.py:265-330`).
- **SDK coupling:** only `trajectory/hook.py`, through Stop command-hook stdin/environment behavior. The rest is SDK-independent.
- **Dependencies:** local SQLite; optional sentence-transformer-like encoder for embeddings. It reads producer sidecars that are not created by this package’s verify hook.
- **Quality:** extensive pure test coverage (roughly 100 tests across schema/store/writer/embedder/retriever/hook) and useful separation of persistent record from retrieval.
- **Defects:**
  - False-success assumption described above: Stop does not imply SDK “finished.”
  - The hook looks for an event `run_id`, but `HookEvent` has no such field, so it always falls back to session ID unless an external non-SDK producer adds it (`trajectory/hook.py:297-302`).
  - `verify_iterations` are read only from trajectory sidecar (`245-247`), while verify hook writes only `last_verdict`/`last_reason`/edited paths (`verify/hook.py:138-148`); the normal pair does not persist verification history.
  - “Upsert” is a separate get, delete, insert (`trajectory/writer.py:105-118`), not an atomic SQLite upsert. A crash between delete and insert loses the record; concurrent stop hooks can race.
- **Verdict:** **port-later** for schema/store/retriever after correction; **leave** for its current Stop hook.

### `verify`

- **Purpose / APIs:** runner detection/target selection, subprocess verification, typed `VerificationStep`, `VerifyLoop`, optional breakpoint inspector, and Stop hook (`verify/selector.py:47-234`, `runner.py:47-202`, `schema.py:23-112`, `loop.py:48-189`, `hook.py:92-159`).
- **SDK coupling:** only `verify/hook.py` and its Stop command-hook contract; other components are local Python.
- **Dependencies:** project’s local test tooling (`pytest`, Vitest/Jest/npm), project workspace, and subprocess execution. `breakpoint.inspector` executes a target script through `runpy`, so it is itself code execution (`verify/breakpoint/inspector.py:84-171`).
- **Quality:** broad unit coverage (about 55 tests), good runner detection and output bounding. Unit tests correctly express the intended `VerifyDecision.block` behavior.
- **Confirmed defects:**
  - The hook emits unsupported `decision:"block"` with exit 0 rather than SDK `deny`/exit 2, so retry enforcement is absent (`verify/loop.py:57-69`; `verify/hook.py:151-155`; SDK `hooks/executor.py:483-510`).
  - Its docstring says it reads a sidecar, but `_hook_event_edited_files` only reads `event.metadata.edited_files` (`verify/hook.py:76-89`). SDK Stop metadata contains only reason, so edited-file selection is normally empty and often skips verification.
  - `_save_state` is a read-modify-write of one shared JSON file with no lock or atomic replace (`61-73`); concurrent sessions can lose state or leave malformed JSON.
- **Verdict:** **leave** for the hook; **port-later** for selector/runner/schema after a separate authorization-safe command-execution policy.

### `write`

- **Purpose / APIs:** `WriteNoteAction`, `WriteNoteExecutor`, and import-registered `WriteNoteTool`; deterministic filename and `os.replace` file write (`write/tools/write_note.py:73-233`).
- **SDK coupling:** standard SDK tool classes and `IdempotentToolExecutor`.
- **Dependencies:** local filesystem plus BFF idempotency ledger when conversation metadata is available.
- **Quality:** its atomic replacement write is sound for a single file (`122-148`), and 7 focused tests cover ledger hit/fail-open behavior.
- **Defects / limitations:** inherits the best-effort/crash-window idempotency flaw. The default relative `data/notes` path is controlled by agent-server working directory, not an explicit approved workspace root (`56-65`, `122-125`).
- **Verdict:** **leave**.

---

## Test-coverage judgment

The donor has strong pure-unit coverage around thresholds, parsers, typed records, stores, selectors, and simple tool registration. It lacks the tests that matter most for an authorization donor:

1. No integration test instantiates SDK `HookConfig`/`HookEventProcessor`/`HookExecutor` and proves that `gpu` blocks and `verify` blocks a real action/stop.
2. `tests/verify/test_loop.py:136-142` and `tests/verify/test_hook.py:115-145` assert the donor’s `"block"` JSON, thereby codifying an invalid SDK assumption instead of testing the SDK’s accepted `"deny"` contract.
3. No test proves Stop hook ordering or the short-circuit behavior; this misses the false BFF documentation claim.
4. No service integration coverage for DozerDB, Qdrant, Ollama, or SearXNG, and no memory adapter/curation test files in this extension package.
5. No authorization-state tests: no capability manifest, trust tiers, approval pending/expired/denied cases, audit durability, emergency-stop behavior, or prompt/content quarantine.

## Minimal OH-GUI adoption boundary

For the next authorization slice, take **the SDK seam, not the Forge-OH hook implementations**:

1. Inject a single `pre_tool_use` wildcard `HookType.COMMAND` definition when creating the OpenHands conversation.
2. Its local executable reads the SDK `HookEvent`, creates an immutable audit record, derives a capability from `(tool_name, action arguments)`, checks trust dial and emergency-stop state, and returns exit 2 / `{"decision":"deny","reason":"..."}` for deny.
3. For approval-required capabilities, the policy executable uses localhost-only IPC to create/wait for an approval record tied to session plus an action fingerprint. Expired, unavailable, malformed, or duplicate requests must deny.
4. Keep the audit/approval/control-plane state in thin OH-GUI Python middleware, not an SDK hook stdout convention. The hook itself cannot rewrite a pending action, does not provide `ASK`, and cannot cancel in-flight work.
5. Treat search/MCP/tool output as untrusted before it enters memory or privileged tool arguments. Forge-OH’s memory provenance fields are useful metadata, but its production `NoOpAmgPolicy` is not a quarantine implementation.
6. Add direct SDK-1.41 regression tests for payload shape, deny behavior, hook timeout/error behavior, ordered hooks, approved/denied/expired action paths, and emergency-stop behavior before adding any risky tool.

