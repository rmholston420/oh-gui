# Forge-OH BFF donor review — routers

**Review target:** Forge-OH commit `df73ebe` (requested `df73ebed`; checkout resolves to the same abbreviated commit).  
**Scope completed:** every non-`services/` file under `bff/`: `main.py`, `openhands_client.py`, `settings.py`, `deps/*`, all 22 substantive router modules plus the two empty router/dependency `__init__.py` files, requirements files, Dockerfile, and README. I did **not** read any `bff/services/` implementation, as requested. Where a router depends on a service, that dependency is named but its behavior is not asserted beyond the router call site.

**Test review:** I skimmed the entire `bff/tests/` tree (60 files; 432 tests collected before import failures) and read the policy plus representative MCP/plugin/observability router tests. I did not read every test body. `pytest --collect-only -q bff/tests` in the current shell collected 432 tests but stopped with 22 import errors because this shell lacks `pydantic_settings`, `aiosqlite`, and `openhands`; it also reports unknown `pytest.mark.asyncio` because `pytest-asyncio` is not installed. That is an environment result, not a claim that the suite fails in Forge-OH's intended virtual environment. The README, however, tells the reader to install only `requirements.txt` and then run tests, while the listed test dependencies are in the separate `requirements-dev.txt` (README lines 30–36, 57–65; requirements-dev.txt lines 1–5).

## Executive donor decision

**Do not port this BFF as a foundation.** It is a broad, 1.40-specific REST façade over a separately running agent-server, with many unprotected destructive or code-executing endpoints. OH-GUI's authorization slice should instead be a narrow, local middleware kernel which: owns the approval state machine and audit ledger; validates a capability manifest before dispatch; emits structured quarantine/diagnostic records; and invokes the OpenHands 1.41 SDK through a tested adapter.

There are useful patterns to port selectively:

1. **Approval wire concepts:** `ConfirmRisky` / `AlwaysConfirm` policy construction and the upstream approve/reject calls (`runs.py:144–166`, `1164–1213`). They must be made fail-closed and tied to an immutable proposed action ID.
2. **Emergency stop primitive:** the upstream interrupt call behind `stop_run` (`runs.py:1135–1161`). It is a per-run stop only, not a persistent global emergency stop.
3. **Telemetry contract seed:** GPU snapshot/history routes (`gpu.py:20–43`) for VRAM/utilization display. `tok/s` is not exposed in this router.
4. **Event-derived observability:** run events, plans, artifacts, commands, traces and metrics are useful source material, but are not authorization audit records (`runs.py:800–929`; `observability.py:29–60`).
5. **Validation examples:** `selfeval._safe_child` has a correct filename regex plus resolved-path containment check (`selfeval.py:66–78`). Use that pattern for any filesystem-facing OH-GUI endpoint.

### Hard-constraint conflicts

* **No cloud control plane:** most of the core runtime is local, but the BFF deliberately supports arbitrary remote MCP HTTP/SSE servers (`mcp.py:97–162`), arbitrary plugin sources/marketplaces (`plugins.py:130–204`), and exposes a GitHub source label in Docker (`Dockerfile:41`). Remote MCP and plugin installation must not enter the authorization slice without an explicit local allow/approval design.
* **No multi-user assumptions:** code is actually *single-process, single-user* in several places: in-memory secrets/MCP/plugin/preset/settings/notification state, Socket.IO rooms without identity, and Docker's intentional `--workers 1` (`main.py:12–14`, `Dockerfile:50–56`). That aligns with a local workstation, but it is not an access-control model.
* **Local-first safety:** the server defaults to `0.0.0.0` (`settings.py:29–35`) and uses wildcard CORS when `FRONTEND_ORIGIN` is unset (`main.py:133–148`). Docker trusts forwarded headers from all IPs (`Dockerfile:52–57`). With no authentication on the BFF, a LAN-exposed port is a serious authorization bypass.
* **No GitHub-native CI:** no router requires GitHub-native CI. The README and Docker image label reference GitHub only as project metadata. The plugin source/marketplace surface could fetch remote/git sources and should be treated as untrusted installation, not CI.

## Authorization-slice coverage matrix

| Needed OH-GUI slice element | Donor coverage | Donor decision |
|---|---|---|
| Trust dial | `requireApproval` selects only two upstream confirmation policies; no graduated local trust state (`runs.py:104–106`, `144–166`) | Re-design; do not port verbatim |
| Approval/authorization cards | Per-run `/approve` and `/reject`, but no proposed-action ID, expiration, actor, or card model (`runs.py:1164–1213`) | Port concepts later behind a new state machine |
| Audit log | Event stream, trace reconstruction, idempotency and commit-sha ledgers exist, but no authorization-decision audit record | New subsystem |
| Capability manifest | Preset `toolAllowlist` exists but is never applied; tools are hard-coded on create (`agent_presets.py:59`, `runs.py:430–435`) | New subsystem; do not reuse preset as enforcement |
| Emergency stop | Per-conversation interrupt only (`runs.py:1135–1161`) | Port early as an adapter primitive; add global latched stop |
| Untrusted-content quarantine | No general BFF quarantine. Memory calls a dependency whose tests cover quarantine elsewhere, but BFF only exposes read/event bridges (`memory.py:1–12`, `80–129`) | New subsystem |
| Stuck-loop intervention | `loopGuard` is persisted in presets but never consumed by run creation (`agent_presets.py:37–40`, `59–60`, `102–161`; `runs.py:403–444`) | New subsystem |
| Budget pre-check | `maxCost` exists in preset schema but is never applied; no preflight/cost reservation | New subsystem |
| Malformed-tool-call diagnostic | No structured diagnostic endpoint or event; upstream errors are often truncated text | New subsystem |
| Telemetry strip (tok/s, VRAM) | GPU snapshot/history is useful for VRAM; metrics are event aggregation; no token-per-second contract | Port GPU contract early; design token sampling separately |

## Cross-cutting defects and smells

1. **Authorization is absent where it matters.** There are no FastAPI dependencies or middleware performing caller identity, capability checks, or approval checks. `agent_presets.py` comments that writes “require 'write' role,” but all write handlers are plain functions with no role dependency (`agent_presets.py:183–245`). The secrets router explicitly says it has no Authorization enforcement (`secrets.py:17–23`).
2. **Approval installation fails open.** `create_run` catches and only logs both `PatternSecurityAnalyzer` attach failure (`runs.py:518–535`) and confirmation-policy failure (`runs.py:545–560`), then starts the run (`runs.py:615–625`). For an authorization product, inability to install the gate must fail closed before the agent loop starts.
3. **Approval is race-prone and unaudited.** `/approve` and `/reject` act on whichever upstream confirmation is currently pending; their request contains no action/event/approval ID (`runs.py:1164–1213`). A stale card can decide a different pending action. No actor, policy version, decision time, reason (for approval), or action fingerprint is persisted by this BFF.
4. **The run “presets” are largely cosmetic.** Create-run consults only `backendId` and possibly `role` from `_PRESETS` (`runs.py:303–316`); it ignores `systemPrompt`, `maxSteps`, `maxCost`, `temperature`, `topP`, `toolAllowlist`, and `loopGuard` declared in `AgentPreset` (`agent_presets.py:43–63`). The actual tool set is unconditionally terminal/file editor/task tracker/browser (`runs.py:430–435`).
5. **Explicit invalid role silently degrades.** `CreateRunRequest.role` is free text (`runs.py:96–99`) and `_resolve_role` silently falls back to task complexity/default coder unless it is exactly `coder` or `planner` (`runs.py:169–175`). An authorization or routing request should reject an invalid declared role, not change its meaning.
6. **Run list pagination is not pagination.** `list_runs` accepts `page` but never sends it or a cursor upstream; it returns only the received page and reports `total=len(runs)` (`runs.py:260–287`). This misstates totals and ignores requested page selection.
7. **Unknown workspaces are accepted.** `create_run` begins with a fallback `workspace/runs/pending` and continues if the provided `workspaceId` is not found or lookup fails (`runs.py:349–364`). It should reject an unknown workspace; accepting it can point an agent at an unintended relative location.
8. **Delete can report success after an upstream delete failure.** Once the initial GET succeeds, `delete_run` catches a general exception from the DELETE, logs it, and still returns 204 (`runs.py:754–792`). That is incorrect for a destructive lifecycle operation.
9. **The global command terminal is incorrectly namespaced as per-run.** Bash documentation and code state the upstream event history is global, while the BFF accepts cosmetic `run_id`; every command endpoint and `DELETE /events` affect the shared upstream state (`bash.py:4–22`, `78–146`). This cannot support run-bound authorization/audit.
10. **Several filesystem endpoints lack containment.** `git.py` lets the caller give arbitrary paths and sends them upstream (`git.py:65–115`). `workspaces.create_workspace` accepts an arbitrary path then calls `Path(path).mkdir(...)` (`workspaces.py:155–165`). `repograph_index` accepts any existing absolute directory (`repograph.py:251–284`). These need a canonical allowed-workspace-root check before porting.
11. **Memory config has an internal contradiction.** `Settings` reads `.env.neo4j` with Pydantic (`settings.py:18–27`), but `get_memory_port()` tests only process `os.getenv("NEO4J_PASSWORD")` (`deps/memory_port.py:48–58`). Values loaded exclusively by Pydantic from `.env.neo4j` do not populate `os.environ`, so the memory port may stay unavailable despite the advertised configuration.
12. **The docs and reproducibility story are materially inconsistent.** README declares OpenHands SDK 1.29.3 (`README.md:9–17`), runtime requirements pin 1.40.0 (`requirements.txt:11–15`), and the lock includes SDK 1.40.0 but not the three other pinned OpenHands packages (`requirements.lock:72`). README tells users to start `bff.main:app` (`README.md:38–55`), directly contradicting `main.py` and Docker which require `app_with_sio` for Socket.IO (`main.py:6–14`, `223–225`; `Dockerfile:45–57`). Docker installs the non-locked requirements file, whose `httpx`, Socket.IO, aiohttp, Neo4j, tree-sitter and Qdrant constraints are deliberately non-exact (`Dockerfile:23–25`; `requirements.txt:17–37`); it does not use `requirements.lock`.
13. **The lock/runtime constraints conflict:** `requirements.txt` requires `aiohttp>=3.13.3` (`requirements.txt:20–22`) while the lock pins `aiohttp==3.11.10` (`requirements.lock:4`).
14. **Tests are not a sufficient authorization safety net.** The only confirmation-policy tests are pure-dictionary checks for the 1.40 wire shape (`tests/test_confirmation_policy.py:1–56`). Representative MCP/plugin/observability tests accept broad success-or-error statuses and use the configured live upstream rather than a controlled contract fake (`tests/test_mcp_router.py:26–53`, `tests/test_plugins_router.py:30–64`, `tests/test_observability_router.py:26–42`). There is no dedicated `test_agent_presets_router.py`, `test_secrets_router.py`, or `test_workspaces_router.py`.

## SDK 1.40 → OH-GUI 1.41 boundary

The donor pins four OpenHands packages to 1.40.0 (`requirements.txt:11–15`) and repeatedly documents fields/endpoints as verified against 1.40.0. The highest-risk couplings are:

* HTTP routes and event shapes: conversations, event search, `run`, `pause`, `interrupt`, confirmation response, `fork`, `switch_llm`, workspace, bash, Git, settings, MCP, plugins and secrets across `runs.py`, `bash.py`, `git.py`, `mcp.py`, `plugins.py`, `secrets.py`, and `workspaces.py`.
* Confirmation policy discriminated-union JSON: `_build_confirmation_policy()` says its exact `kind`, `threshold`, and `confirm_unknown` representation is verified for 1.40 (`runs.py:144–166`).
* Direct 1.40 SDK imports: `PatternSecurityAnalyzer` in `create_run` (`runs.py:518–535`) and `openhands.sdk.skills.skill.load_user_skills/load_project_skills`, `Skill.to_skill_info()` in `skills.py:75–102`, `114–157`.
* SDK hook and restart/worktree protocol inputs assembled by imported donor services; those services were intentionally outside this review.

I found no evidence in the reviewed code or test suite that these contracts were executed against 1.41. **Do not claim 1.41 compatibility from this donor.** For every candidate port, pin 1.41 and write an adapter-contract test against a local OpenHands runtime before accepting its wire shape. Prefer the 1.41 Python SDK surface in OH-GUI over retaining this HTTP proxy layer.

## Router-by-router assessment

Verdicts use the requested vocabulary. **Port early** means a small useful contract may be copied now, not that the donor implementation is safe unchanged. **Port later** means retain only after the new authorization kernel exists. **Leave** means no donor value for this phase. **Exclude-with-reason** means the current shape conflicts with the hard constraints/security model.

### `agent_presets` — 245 LOC, 7 routes — **port-later**

**Depends on:** FastAPI/Pydantic; module-global `_PRESETS`; the runs router imports `_PRESETS` directly (`agent_presets.py:106–162`; `runs.py:303–316`). State is process-local and resets on restart.

| Method/path | Purpose |
|---|---|
| GET `/api/agent-presets` | List in-memory presets |
| GET `/api/agent-presets/{preset_id}` | Read one preset |
| POST `/api/agent-presets` | Create preset |
| PATCH `/api/agent-presets/{preset_id}` | Merge-update preset |
| DELETE `/api/agent-presets/{preset_id}` | Delete non-default preset |
| POST `/api/agent-presets/{preset_id}/duplicate` | Clone preset |
| POST `/api/agent-presets/{preset_id}/set-default` | Mark one default |

Useful as a UI configuration schema only. It has no authorization despite the “write role” comment (`agent_presets.py:165–245`), no persistence, mutable list defaults (`toolAllowlist` at lines 59/77), and its key policy/budget/loop fields are not enforced by `create_run`. Rebuild as a persisted local profile plus versioned capability/budget policy, not as `_PRESETS`.

### `bash` — 250 LOC, 5 routes — **exclude-with-reason**

**Depends on:** `get_client()` and upstream 1.40 global bash API; SSE polling via `asyncio` (`bash.py:27–38`, `164–250`).

| Method/path | Purpose |
|---|---|
| POST `/api/runs/{run_id}/bash` | Start upstream command asynchronously |
| POST `/api/runs/{run_id}/bash/execute` | Execute command synchronously |
| GET `/api/runs/{run_id}/bash/events` | List global command events |
| DELETE `/api/runs/{run_id}/bash/events` | Clear **all** global command events |
| GET `/api/runs/{run_id}/bash/stream` | Poll and relay global events as SSE |

It is raw command execution with no caller authorization, approval gate, capability manifest, workspace containment or meaningful `run_id`. Its global history and global clear operation are explicitly admitted (`bash.py:4–22`, `139–146`). Do not carry it into OH-GUI; expose command effects only through a run-bound tool dispatcher that emits a proposed action, authorization decision, immutable audit entry and output event.

### `debug` — 118 LOC, 1 route — **exclude-with-reason**

**Depends on:** environment flag, event normalizer and relay services (`debug.py:35–44`, `105–116`).

| Method/path | Purpose |
|---|---|
| POST `/api/_debug/inject-event` | Inject arbitrary synthetic timeline event when env flag is enabled |

This is E2E-only infrastructure. When enabled it has no caller control and `extra` overrides stamped defaults (`debug.py:81–103`), so it must never be an authorization/audit path. Its 404-off feature-gate behavior is a reasonable test-only pattern.

### `git` — 115 LOC, 2 routes — **port-later**

**Depends on:** `get_client()`, upstream 1.40 Git endpoints, URL encoding (`git.py:24–32`, `56–62`).

| Method/path | Purpose |
|---|---|
| GET `/api/runs/{run_id}/git/changes?workspace_path=` | List changed files |
| GET `/api/runs/{run_id}/git/diff?file_path=&workspace_path=` | Read original/modified sides |

Useful for a diff panel, but `run_id` is cosmetic and both arbitrary path inputs are passed upstream (`git.py:13–19`, `65–115`). Port only after workspace-root canonicalization and per-run workspace binding; keep it read-only and label returned content untrusted.

### `gpu` — 43 LOC, 2 routes — **port-early (contract only)**

**Depends on:** unreviewed singleton `bff.services.gpu_monitor` started/stopped by main lifespan (`gpu.py:13–43`; `main.py:93–102`, `117`).

| Method/path | Purpose |
|---|---|
| GET `/api/gpu` | Latest GPU samples/advisory cutoff |
| GET `/api/gpu/history?window_sec=` | Bounded history by GPU index |

This directly supports the VRAM/utilization half of the telemetry strip and has a small read-only surface. Port the endpoint/data contract only after independently reviewing or replacing the monitor for Colossus; this review intentionally did not inspect its service implementation. It does **not** provide tok/s.

### `idempotency` — 95 LOC, 2 routes — **port-later**

**Depends on:** request app state and unreviewed SQLite `idempotency_ledger` (`idempotency.py:24–29`, `51–95`; `main.py:69–72`).

| Method/path | Purpose |
|---|---|
| POST `/api/idempotency/check` | Return computed key and cached result |
| POST `/api/idempotency/mark` | Mark a proposed tool side effect complete |

The durable exactly-once concept is useful, but exposing `/mark` without authentication lets any caller manufacture a completed key for a tool invocation (`idempotency.py:70–95`). In OH-GUI, retain this as a private dispatcher/ledger API, keyed by authorization-decision/action IDs, never as browser-callable public routes.

### `inference_backends` — 43 LOC, 1 route — **port-later**

**Depends on:** unreviewed `bff.services.inference_backends.list_backends` (`inference_backends.py:11–15`, `18–43`).

| Method/path | Purpose |
|---|---|
| GET `/api/inference-backends` | List configured local backend metadata plus health |

It is small, local-oriented and read-only, so useful after OH-GUI owns its model adapter. The response reports latency/model count but no token rate. Do not inherit a six-backend registry merely for the authorization slice.

### `mcp` — 274 LOC, 5 routes — **exclude-with-reason**

**Depends on:** upstream settings and MCP test HTTP APIs; process-local ping cache (`mcp.py:3–28`, `43–47`, `114–162`).

| Method/path | Purpose |
|---|---|
| GET `/api/mcp` | List registered MCP servers |
| POST `/api/mcp` | Register stdio/HTTP/SSE MCP server, including command/env/headers |
| DELETE `/api/mcp/{server_id}` | Remove server |
| POST `/api/mcp/{server_id}/toggle` | Toggle enabled state |
| POST `/api/mcp/{server_id}/ping` | Run upstream connection/tool discovery probe |

This is a direct path to arbitrary local process launch or remote network connection; `RegisterMcpRequest` accepts `command`, `args`, `env`, `url`, and `headers` with no local-policy checks (`mcp.py:97–162`). It cannot be imported before capability manifest, trust dial, quarantine and per-action authorization exist. The exact agent-server settings schema is also 1.40-coupled.

### `memory` — 129 LOC, 2 routes — **leave**

**Depends on:** `MemoryPort`, Neo4j/DozerDB composition, unreviewed memory-events service, Socket.IO relay (`memory.py:18–24`, `80–129`).

| Method/path | Purpose |
|---|---|
| POST `/api/memory/emit-consultation` | Emit a memory-consultation timeline event |
| GET `/api/memory/recent-writes?limit=` | Inspect recent memory writes |

No BFF write API exists by design (`memory.py:1–12`), and no generic quarantine is implemented. The port should be deferred until OH-GUI has an explicit untrusted-content data model. The donor’s env-file bug in `deps/memory_port.py:48–58` is another reason not to bring it in.

### `metrics` — 98 LOC, 8 routes — **port-later**

**Depends on:** unreviewed `metrics_aggregation` and run-events metric builder (`metrics.py:23–25`, `40–98`; `runs.py:864–871`).

| Method/path | Purpose |
|---|---|
| GET `/api/metrics/summary?period=` | Aggregate run summary |
| GET `/api/metrics/daily?period=` | Daily series |
| GET `/api/metrics/models?period=` | Per-model breakdown |
| GET `/api/metrics/workspaces?period=` | Per-workspace breakdown |
| GET `/api/metrics` | Legacy 7-day summary |
| GET `/api/metrics/runs/{run_id}` | Legacy hard-coded zero stub |
| GET `/api/metrics/workspaces/{workspace_id}` | Legacy workspace summary |
| GET `/api/metrics/cost` | All-time cost total |

The dashboard aggregation is not a preflight budget guard and the per-run legacy route literally returns `0.0`/`0` (`metrics.py:75–80`). Reuse later for read-only history, not as a policy or telemetry source.

### `notifications` — 74 LOC, 4 routes — **leave**

**Depends on:** module-global `_NOTIFICATIONS` only (`notifications.py:39–74`).

| Method/path | Purpose |
|---|---|
| GET `/api/notifications` | List notifications |
| POST `/api/notifications/{notification_id}/read` | Mark one read |
| POST `/api/notifications/read-all` | Mark all read |
| DELETE `/api/notifications/{notification_id}` | Dismiss one |

It starts empty and has no producers, persistence, authorization or event feed (`notifications.py:1–10`). OH-GUI’s approval/intervention cards should be backed by the authorization ledger, not this stub.

### `observability` — 60 LOC, 4 routes — **port-later**

**Depends on:** unreviewed event fetching and trace reconstruction (`observability.py:21–25`).

| Method/path | Purpose |
|---|---|
| GET `/api/observability/traces` | Return deliberately unsupported empty list |
| GET `/api/observability/runs/{run_id}/traces` | Build one trace summary from run events |
| GET `/api/observability/traces/{trace_id}` | Return trace and spans |
| GET `/api/observability/traces/{trace_id}/spans` | Return spans |

Event-derived traces are useful context for diagnostics, but not an authorization audit log. There is no persistence/subscriber and all reads depend on current upstream event availability (`observability.py:1–15`).

### `plugins` — 264 LOC, 8 routes — **exclude-with-reason**

**Depends on:** upstream plugin REST API and `get_client()` (`plugins.py:3–20`, `32–35`).

| Method/path | Purpose |
|---|---|
| GET `/api/plugins` | List installed plugins |
| GET `/api/plugins/marketplace` | List marketplace catalog |
| POST `/api/plugins` | Install plugin |
| POST `/api/plugins/install` | Install alias |
| DELETE `/api/plugins/{plugin_id}` | Uninstall plugin |
| POST `/api/plugins/{plugin_id}/enable` | Enable plugin |
| POST `/api/plugins/{plugin_id}/disable` | Disable plugin |
| POST `/api/plugins/{plugin_id}/ping` | Check installed/enabled state |

Arbitrary `source`, `ref`, and `repo_path` flow to upstream install with no provenance validation or approval (`plugins.py:130–204`). That violates untrusted-content and capability-manifest requirements. The local UI can eventually support signed/explicitly approved local extensions, but not this thin proxy.

### `repograph` — 510 LOC, 8 routes — **port-later**

**Depends on:** Neo4j driver dependency, settings, registry service, `openhands_tools_ext` index/store, local subprocess Git (`repograph.py:22–35`, `166–183`, `455–510`).

| Method/path | Purpose |
|---|---|
| GET `/api/repograph/health` | Report optional Neo4j availability |
| POST `/api/repograph/index` | Index an arbitrary existing workspace path |
| GET `/api/repograph/search` | Symbol-name search |
| GET `/api/repograph/callers` | Find callers |
| GET `/api/repograph/callees` | Find callees |
| GET `/api/repograph/co_changed` | Mine co-changing files from local Git history |
| GET `/api/repograph/graph` | Return PageRank-selected graph |
| POST `/api/repograph/context_bundle` | Return ranked context symbols |

It is sophisticated but unrelated to the next authorization slice. Indexing and Git history are local, not cloud-coupled; still, POST `/index` needs allowed-root and resource/budget controls. Its sync endpoints are comparatively complex and external-store-heavy.

### `runs` — 1,490 LOC / 61,044 bytes, 23 routes — **port-later**

**Depends on:** the 1.40 agent-server REST contract; model routing, event normalizing/relay/fetching/reconstruction, hooks, sidecar, worktree, restart, event commit ledger services; presets and workspaces routers (`runs.py:51–79`, `204–223`, `303–316`). This is by far the largest, highest-coupling router.

| Method/path | Purpose |
|---|---|
| GET `/api/runs` | List conversations |
| POST `/api/runs` | Create, configure, start and relay conversation |
| GET `/api/runs/compare?base=&fork=` | Compare two runs |
| GET `/api/runs/{run_id}` | Get run summary/start relay |
| DELETE `/api/runs/{run_id}` | Delete conversation/reap worktree/ledger |
| GET `/api/runs/{run_id}/events` | Fetch and normalize persisted events |
| GET `/api/runs/{run_id}/plan` | Derive task plan |
| GET `/api/runs/{run_id}/metrics` | Derive run KPIs |
| GET `/api/runs/{run_id}/files` | Derive file summaries |
| GET `/api/runs/{run_id}/files/{file_path}` | Derive one file diff |
| GET `/api/runs/{run_id}/artifacts` | Derive mutation artifacts |
| GET `/api/runs/{run_id}/commands` | Derive command pairs |
| GET `/api/runs/{run_id}/browser` | Derive browser frames |
| GET `/api/runs/{run_id}/traces` | Derive spans |
| POST `/api/runs/{run_id}/pause` | Pause upstream conversation |
| POST `/api/runs/{run_id}/resume` | Retry upstream `run` until resumable |
| POST `/api/runs/{run_id}/message` | Append user message; best-effort SHA capture |
| POST `/api/runs/{run_id}/stop` | Interrupt a running/waiting conversation |
| POST `/api/runs/{run_id}/approve` | Accept current upstream confirmation |
| POST `/api/runs/{run_id}/reject` | Reject current confirmation, then best-effort interrupt |
| POST `/api/runs/{run_id}/fork` | Fork conversation from optional event |
| POST `/api/runs/{run_id}/restart` | Restart into a SHA-anchored worktree |
| POST `/api/runs/{run_id}/model` | Change model through an approved preset |

**Authorization relevance:** this is the only donor router with real approval/confirmation behavior. The default is `ConfirmRisky(MEDIUM, confirm_unknown=True)` and per-run `requireApproval=true` gives `AlwaysConfirm` (`runs.py:144–166`, `537–560`). That is not a trust dial, persistent authorization policy, budget guard or audit log. Extract only the stop/approve/reject *upstream adapter calls* later, after OH-GUI’s own decision engine is authoritative. Do not port the orchestration wholesale: it contains hard-coded 1.40 endpoints/body shapes, best-effort security setup, unverified workspace fallback, ignored preset controls, misleading pagination, and delete-success masking described above.

Tests are strongest around pure policy construction, fork wire key, model-switch payload, restart, SHA capture and worktree cleanup. There are no dedicated endpoint contract tests for most lifecycle/read routes, including pause/resume/stop/approve/reject/message/events/files/plan/commands/browser/traces.

### `search` — 82 LOC, 1 route — **leave**

**Depends on:** env flags and unreviewed search-events service/Socket.IO (`search.py:19–29`, `32–82`).

| Method/path | Purpose |
|---|---|
| POST `/api/search/emit` | Bridge a search tool's result count/provenance/timing into timeline event |

This is only a display bridge. It neither performs search nor quarantines untrusted web results; `provenance` and query are caller-provided. Leave it out of the authorization slice.

### `secrets` — 200 LOC, 5 routes — **port-later**

**Depends on:** upstream 1.40 settings/conversation secrets APIs (`secrets.py:3–8`, `91–116`, `186–200`).

| Method/path | Purpose |
|---|---|
| GET `/api/secrets` | List masked secret metadata |
| POST `/api/secrets` | Create global secret |
| PUT `/api/secrets/{secret_id}/rotate` | Delete/recreate secret |
| DELETE `/api/secrets/{secret_id}` | Delete secret |
| POST `/api/runs/{run_id}/secrets` | Update conversation secret map |

The non-disclosure intent is good (`secrets.py:17–26`), but all mutation routes are unauthenticated. Rotation is non-atomic delete then create (`secrets.py:153–170`), so a failed recreate can lose a secret. Port later via a local secret-provider adapter with capability checks and an audit trail; do not expose raw `secrets` maps to arbitrary browser callers.

### `selfeval` — 299 LOC, 6 routes — **exclude-with-reason**

**Depends on:** local filesystem, module-global async lock/state, `systemctl --user` subprocess (`selfeval.py:22–57`, `86–103`, `207–299`).

| Method/path | Purpose |
|---|---|
| GET `/api/selfeval/cycles` | List local cycle JSON summaries |
| GET `/api/selfeval/cycles/{filename}` | Read one summary |
| GET `/api/selfeval/proposals` | List proposal files |
| GET `/api/selfeval/proposals/{filename}` | Read raw proposal Markdown |
| GET `/api/selfeval/status` | Read in-process launch status |
| POST `/api/selfeval/run` | Start configured user systemd service |

Its safe filename helper is a good reference, but exposing a systemd service launcher without authorization is not appropriate. It is unrelated to the phase and not portable to a thin OpenHands middleware.

### `settings` — 232 LOC, 4 routes — **port-later**

**Depends on:** module-global UI settings; unreviewed model-router health and role routing (`settings.py:17–35`, `131–232`).

| Method/path | Purpose |
|---|---|
| GET `/api/settings` | Read in-memory UI settings |
| PATCH `/api/settings` | Patch in-memory UI settings |
| POST `/api/settings/reset` | Reset defaults |
| GET `/api/settings/model-routing` | Probe backend/model health/routing |

This is UI configuration, not enforcement. `autoApprove` is merely a stored frontend field (`settings.py:62–83`) and is not connected to `create_run` policy. Defaults still name cloud `gpt-4o` (`settings.py:66`) despite the local-first goal. Recreate only the local UI preferences/telemetry view after the policy model is explicit.

### `skills` — 220 LOC, 3 routes — **port-later**

**Depends on:** direct OpenHands SDK 1.40 skill loader and the filesystem, not agent-server (`skills.py:75–102`, `114–157`).

| Method/path | Purpose |
|---|---|
| GET `/api/skills` | List user/project skills and 500-character body previews |
| GET `/api/skills/installed` | Alias to list skills |
| GET `/api/skills/marketplace` | Empty local marketplace list |

This is potentially useful input to a capability manifest, but it is not one: it enumerates loadable skills and returns content previews from `~/.agents/skills` and project disk (`skills.py:165–194`). Treat skill content as untrusted, do not display/expose it as authoritative capability data, and retest direct imports against SDK 1.41.

### `trajectories` — 225 LOC, 4 routes — **leave**

**Depends on:** `openhands_tools_ext` trajectory store/retriever/schema and unreviewed drain scheduler (`trajectories.py:25–38`, `179–211`).

| Method/path | Purpose |
|---|---|
| GET `/api/trajectories` | List trajectory records/filter by status/repo |
| GET `/api/trajectories/{trajectory_id}` | Read one record |
| POST `/api/trajectories/search` | Semantic/symbol-overlap retrieval |
| POST `/api/trajectories/drain` | Force embedding drain |

Not needed for the authorization slice. Also, when filters are supplied, `records` are filtered but `total=store.count()` is not (`trajectories.py:102–111`), so the response total can be misleading. The drain mutation would need operator authorization if revived.

### `workspaces` — 250 LOC, 6 routes — **port-later**

**Depends on:** upstream 1.40 workspace registry, filesystem mkdir/access checks (`workspaces.py:28–38`, `115–133`, `155–250`).

| Method/path | Purpose |
|---|---|
| GET `/api/workspaces` | List upstream registry entries |
| GET `/api/workspaces/{workspace_id}` | Read one registry entry |
| POST `/api/workspaces` | Create directory and register workspace |
| PATCH `/api/workspaces/{workspace_id}` | Delete/re-add registry entry |
| DELETE `/api/workspaces/{workspace_id}` | Remove registry entry |
| POST `/api/workspaces/{workspace_id}/test` | Check BFF read/write access to path |

Workspace lifecycle will matter, but this donor has no permitted-root policy: it creates any caller-supplied path (`workspaces.py:155–165`). Update is a non-transactional delete/re-add; if re-add fails, the registry entry is lost (`workspaces.py:186–220`). Build a strict Colossus-rooted workspace registry as part of a later authorization boundary.

## Non-router integration notes

* `main.py` is the coupling hub: it mounts all routers below `/api` except GPU, starts local SQLite/event/GPU/MCP/trajectory components, uses Socket.IO with `cors_allowed_origins="*"`, and accepts arbitrary query `conversationId`/`runId` room subscriptions with no identity check (`main.py:63–128`, `150–177`, `189–225`). Treat Socket.IO streaming as a separate transport adapter, not a security channel.
* `openhands_client.py` is a simple global `httpx.AsyncClient` to the configured agent-server (`openhands_client.py:18–60`). It is not the OpenHands SDK; it is a BFF-to-agent-server HTTP proxy. OH-GUI can avoid this entire deployment split by wrapping SDK 1.41 in-process where feasible.
* `deps/neo4j_driver.py` and `deps/trajectory_store.py` use module singletons; the first is optional but external DB coupled, the second couples to `openhands_tools_ext` (`neo4j_driver.py:31–98`; `trajectory_store.py:15–31`). Neither should be part of the authorization kernel.
* `Dockerfile` deliberately runs one worker because state is in-process and correctly uses `app_with_sio`; this is donor confirmation that module-global state is architectural, not incidental (`Dockerfile:45–57`). For OH-GUI, bind a local listener rather than exposing a single-worker unauthenticated BFF on all interfaces.

## Recommended extraction order

1. **New OH-GUI authorization kernel first:** local-only listener, trust dial policy object, capability manifest, action fingerprint, approval decision record, audit append log, persisted/latching emergency stop, structured denied/malformed/quarantined outcomes.
2. **SDK 1.41 adapter contract tests:** create run; subscribe events; enumerate a proposed tool action; approve/reject by event ID; interrupt; capture model token counters; collect GPU sample. Do not copy 1.40 JSON bodies until tests prove 1.41 equivalence.
3. **Port early only:** GPU read model and the narrow upstream interrupt adapter, both behind the new local authorization kernel.
4. **Then port later, selectively:** event/trace reconstruction for diagnostics, workspace/diff readers with path containment, inference health, and skill inventory transformed into a capability-manifest input.
5. **Exclude from this phase:** raw bash, MCP registration, plugin installation, systemd self-evaluation launcher, direct secret mutation, and browser-callable idempotency marking.
