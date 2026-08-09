# OH-GUI Porting Ledger

Every vendored or ported component is logged here **before** it is wrapped behind
an OH-GUI port. Vendoring a verified permissively-licensed OSS component is
always preferred over hand-building anything already solved upstream.

Entry format:

```
## <component name>
- Sub-problem:
- Source URL:
- Commit SHA:
- SPDX license:
- Vendored to:
- Wrapped behind port:
- Modification notes:
- Logged: YYYY-MM-DD HH:MM EDT
```

---

## Primary donor - OpenHands Agent Canvas (ADR-001)

Per [ADR-001](adrs/ADR-001-integration-boundary.md), Agent Canvas is a **donor source**,
not a base to extend. Vendor selectively, attribute, log here.

> **CORRECTED 2026-08-08 (ADR-001 Amendment #2).** This section previously said Agent Canvas
> "is MIT-licensed and was archived 2026-07-27, which makes it a frozen, stable donor with no
> upgrade treadmill." That conflated two repositories and was false about both.
>
> - `github.com/OpenHands/agent-canvas` is archived, but is a **README-only stub with no LICENSE
>   file**. It is **not** MIT and there is nothing in it to vendor. **Never vendor from it.**
> - The real donor is **`github.com/OpenHands/OpenHands`** — MIT, `LICENSE` at root, root
>   `package.json` named `@openhands/agent-canvas`. It is **not archived** (pushed 2026-08-08), so
>   the "no upgrade treadmill" premise was wrong; that is exactly why it is pinned.

| Field | Value |
|---|---|
| Donor repo | `https://github.com/OpenHands/OpenHands` |
| Pin | tag `v1.12.0` = commit `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364` (verified 2026-08-08) |
| SPDX | `MIT` (verified: `LICENSE` at root of the pinned tree) |
| Reference checkout | `~/dev/oh-gui-ref/agent-canvas/v1.12.0/`, read-only, outside the repo |
| Provisioned by | `scripts/provision-reference-checkout.sh` |

| Surface | Donor path | Status |
|---|---|---|
| Conversation / terminal / files / settings / browser panes | `src/components/*` | Not ported - survey first |
| Planner surface | `src/routes/planner-tab.tsx` | Not ported - donor for the Phase 3 Plan workbench |
| Changes surface | `src/routes/changes-tab.tsx` | Not ported - donor for the Phase 2 review workbench |
| Commits surface | `src/routes/commits-tab.tsx` | Not ported |
| Task list surface | `src/routes/task-list-tab.tsx` | Not ported |

All donor paths above were verified to exist at the pinned commit on 2026-08-08.

Attribution requirement: every vendored file carries an SPDX header and a source
comment naming the upstream repo, path, and commit SHA it came from — concretely
`OpenHands/OpenHands`, the path, and `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364`.

## Runtime dependencies (pinned, NOT ports)

Recorded here so they are never mistaken for vendored code.

**Pinned 2026-08-08.** Authoritative values, digests and re-verification procedure live in
[`docs/UPSTREAM_PINS.md`](docs/UPSTREAM_PINS.md). The table below is a summary only; on any conflict
that file wins.

| Artifact | Pin | Notes |
|---|---|---|
| `ghcr.io/openhands/agent-server` | `sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520` | index digest; tag `ca46719-python` = `refs/tags/v1.41.0`, provenance only. Exposes **8000 + 8002**, not 8001 (ADR-001 Amdt #1) |
| `openhands-sdk`, `openhands-tools`, `openhands-workspace`, `openhands-agent-server` | **1.41.0** (all four) | `requires_python >=3.12`. Middleware-side; owns the policy plane |
| `@openhands/typescript-client` | **1.37.0** | MIT. **Four minor versions behind the server**, no compat matrix. Ships a working `LocalConversation` and a hard `@openrouter/sdk` dependency — both must be gated out of the frontend (ADR-001 Amdt #1) |

### 2026-08-08 20:52 EDT — middleware scaffold dependencies (Phase 1 slice 1)

pip dependencies of `services/middleware`, declared in `services/middleware/pyproject.toml`.
**No code was vendored in this slice**, so there is no port entry to make. Recorded here only so
the distinction stays explicit.

| Artifact | Pin | License | Notes |
|---|---|---|---|
| `fastapi` | `0.121.2` | MIT | Loopback IPC surface. Same framework the pinned `openhands-agent-server` uses, so no second HTTP stack enters the tree |
| `uvicorn` | `0.41.0` | BSD-3-Clause | ASGI server, loopback-bound |
| `pydantic` | `2.13.2` | MIT | Wire types for the hook envelope |
| `hatchling` | `>=1.27` | MIT | Build backend |
| `pytest` / `pytest-asyncio` / `httpx` / `ruff` | `9.0.1` / `1.3.0` / `0.29.2` / `0.15.1` | MIT · Apache-2.0 · BSD-3-Clause · MIT | Dev extra only |

All permissive. Nothing GPL/AGPL/BUSL/SSPL entered the tree.

**Donor hook files remain excluded** per ADR-014 clause 8: Forge-OH `verify/hook.py` and
`trajectory` are stop hooks with a defect certified by their own tests; `gpu/hook.py` is a seam
reference only. None were read into this slice, which contains no hook.

## Pre-identified port candidates (not yet ported)

From `docs/specs/12-portable-components.md`. These are **candidates only** - no
entry below counts as ported until it has a full entry in the section above with
a pinned commit SHA and verified SPDX license.

| Sub-problem | Candidate source | Status |
|---|---|---|
| Diff virtualization | Zhang-JiahangH/react-virtualized-diff | Not ported - benchmark against Monaco first (spec 6.3) |
| Terminal pane | Qovery/react-xtermjs | Not ported |
| Command palette | cmdk / react-cmdk | Not ported |
| Rewind/fork UX + DAG graph | microsoft/agdebugger | Not ported - lift graph component (spec 5.5.1) |
| Authorization card UX | agentkitai/agentgate | Not ported - reference only, read dashboard source |
| "Needs you" inbox UX | langchain-ai/agent-inbox | Not ported - reference only |
| Motion stack | motion (`motion/react`) | Not vendored - npm dependency, not a port |
| Glassmorphism / UI material | Aceternity UI, Magic UI | Not vendored - copy-paste source into `components/ui/`, never npm-installed |

## First-party SDK primitives - wire directly, do NOT port or rebuild

Recorded here so no future session mistakes these for port candidates. **All are Python
and run in the OH-GUI middleware, never in the browser** (ADR-001).

- `StuckDetector` (openhands-sdk)
- `conversation.ask_agent()` (openhands-sdk)
- `state.block_action()` / `state.block_message()` (openhands-sdk)
- `switch_llm` built-in tool (openhands-sdk)
- Confirmation policies: `AlwaysConfirm()`, `NeverConfirm()`, `ConfirmRisky()`
- Security analyzers: `Pattern`, `PolicyRail`, `LLM`, `GraySwan`, `Ensemble`

## Confirmed new-build work - no upstream equivalent

- The durable Plan object (`docs/specs/05-plan-model.md`)
- Drift detection
- Capability manifest
- Compare-mode merge logic
- The multi-backend GPU/accelerator telemetry adapter
  (`nvidia-smi` / `rocm-smi` / `powermetrics` / `/sys/class/thermal`)


## Secondary donor - Forge-OH (own prior work)

Forge-OH is the operator's own earlier agent-operations console, solving the same problem one
architecture generation earlier. It is a donor source on the same terms as ADR-001 applies to
OpenHands: vendor selectively, attribute, log here. Being our own repo does not exempt a port from
the ledger.

| Field | Value |
|---|---|
| Donor repo | `https://github.com/rmholston420/Forge-OH` |
| Pin | commit `df73ebed` (pushed 2026-08-06, verified 2026-08-08) |
| SPDX | `MIT` (verified: `LICENSE` at root, GitHub license API reports `mit`) |
| Local checkout | `~/dev/forge-oh` (working tree, not pinned - pin before vendoring) |
| Survey | `docs/forge-oh-port-survey.md` (2026-08-08) |

| Surface | Donor path | Status |
|---|---|---|
| GPU thermal monitor | `bff/services/gpu_monitor.py` | Not ported - Tier 1 candidate |
| GPU PRE-tool hook | `openhands_tools_ext/gpu/hook.py` | Not ported - Tier 1 candidate |
| Loop / repetition detector | `bff/services/loop_guard.py` | Not ported - Tier 1, recommended first port |
| Inference backend protocol + adapters | `bff/services/inference_backends/` | Not ported - Tier 1 candidate |
| Event normalization | `bff/services/event_normalize.py` | Not ported - Tier 1, needs SDK 1.41 re-verification |
| Role-based model router | `bff/services/model_router.py` | Not ported - Tier 2 |
| Idempotency ledger | `bff/services/idempotency_ledger.py` | Not ported - Tier 2 |
| Per-run git worktree isolation | `bff/services/worktree.py` | Not ported - Tier 2 |
| Memory subsystem (DozerDB/Qdrant) | `openhands_tools_ext/memory/` | **Excluded** - Kosmos domain; DozerDB is GPLv3 |
| Next.js frontend | `src/` | **Excluded** - App Router does not port to the Vite shell |
| GitHub Actions workflows | `.github/` | **Excluded** - project constraints forbid GitHub-native CI |

Every adoption above still requires its own entry in the standard format, an adapter behind a
formal port, and a contract test. Listing a surface here is not a port.


### 2026-08-08 19:05 EDT — candidate statuses revised after the full code review

The table above was written from a docstring-level survey. `docs/forge-oh-code-review.md` replaces
its judgements. Revisions:

| Surface | Revised status |
|---|---|
| `bff/services/loop_guard.py` | **Concept only.** Not the recommended first port. Never wired to an event source; no run scoping; produces no evidence a card could render. Rewrite the detector |
| `openhands_tools_ext/gpu/hook.py` | **Reference only.** The only true pre-tool hook, but it discards stdin (`:179-185`) and cannot inspect tool arguments. Take the seam, not the file |
| `bff/services/event_normalize.py` | Still port-early as a behavioral reference. No 1.41 mapping update needed — `openhands/sdk/event/` is byte-identical across 1.40.0/1.41.0. Its gaps are unhandled event kinds |
| `bff/services/idempotency_ledger.py` | **Design input only.** Not exactly-once; check → execute → mark has a crash window |
| `bff/services/model_router.py` | **Excluded.** Dual-port topology and F.18/F.19 history that are not ours |
| `bff/services/inference_backends/` | Port-later. The Protocol is clean only for health inventory; `_common.count_models` raises on list JSON |
| `bff/services/worktree.py` | Port-later, unchanged. Path-traversal guard is good; requires a `.git` dir so it rejects bare repos |
| `bff/services/sidecar_producers.py`, `run_compare.py`, `conflict_checker.py`, `mcp_bootstrap.py`, `trajectory_drain.py`, `sidecar.py` | **Excluded.** O(n²) with event loss at 5000; path traversal at `run_compare.py:118-123`; the rest topology-coupled |
| `bff/routers/bash.py`, `mcp.py`, `plugins.py`, `debug.py` | **Excluded.** Raw execution, arbitrary process/remote registration, arbitrary source install, synthetic event injection |
| `openhands_tools_ext/selfeval`, `tool_invocation/code_execute` | **Excluded.** Systemd launcher with a live `TypeError` at `harness.py:318-330`; arbitrary Python execution |
| `bench/_common/nvml_sampler.py` | **New: port-early.** Wire to our 45/80/83 °C gates; change missing-NVML from no-op to fail-closed |
| `scripts/e2e-run.ts`, `scripts/debug-frontend.ts`, `scripts/forge-status.sh` | **New: port-early.** Playwright instrumentation and read-only local process observability |
| `src/components/navigation/GpuStrip.tsx`, `GpuChipPopover.tsx`, `src/styles/tokens.css` | **New: port-early** (narrow exception to the `src/` exclusion). React/CSS/Recharts only; tokens need an undefined-variable repair pass first |
| `scripts/forge-screenshots.sh` | **Excluded.** Commits and pushes to GitHub |

---

## 2026-08-08 19:40 EDT — ADR-015: `Native basis` is now a required entry field

Per [ADR-015](adrs/ADR-015-native-fidelity-boundary.md) clause 8, every entry for a component that
carries OpenHands (or NVML / Ollama / agent-server) data must record, per exposed field, the
artifact and the path + line or schema location it was verified against. **Documentation is not
verification; the shipped code is.** Entries above that carry such data are owed a backfill before
their port proceeds.

Additional status changes from ADR-015:

| Surface | Status |
|---|---|
| `bff/services/agent_presets.py` + any preset UI | **Excluded.** `maxCost`, `toolAllowlist`, `loopGuard`, `systemPrompt`, `maxSteps` are declared and never applied (tools hard-coded `runs.py:430-435`) — the canonical no-input-without-a-consumer violation |
| `openhands_tools_ext/trajectory/hook.py` | **Excluded by rule.** Manufactures `SUCCESS` for a verdict-less stop (`:157-196`) |
| `bff/services/event_normalize.py` | Port-early as reference, now requiring a native round-trip test per event kind and explicit surfacing of the five unhandled kinds |
| Hand-written agent-server DTOs in the donor routers | **Excluded.** Regenerate from the upstream OpenAPI document |

## 2026-08-08 19:40 EDT — ADR-013: three items promoted to port-early for Phase 0

The review filed these under Phase-1-facing work. [ADR-013](adrs/ADR-013-benchmark-discrimination-floor.md)
makes them Phase 0 blockers instead, because Phase 0 cannot exit without a benchmark capable of
reaching significance.

| Surface | Donor path | Status |
|---|---|---|
| Paired mid-p McNemar test | `bench/lib/mcnemar.py` | **Port-early** (was port-later). MIT. Suite executed 6/6 during review. Inherit and state its two limits: drops `resolved=None`; one outcome per task, so it does not consume repetitions |
| NVML background sampler | `bench/_common/nvml_sampler.py` | **Port-early.** Modifications required before use: missing-NVML must **fail closed** rather than degrade to a silent no-op returning zeros (ADR-013 clause 5, ADR-015 clause 3 — unmeasured is `null`, not `0.0`); wire the 45 C cold / 80 C warn / 83 C stop gates; keep native NVML field names |
| Immutable per-trial manifest | SWE Path A design | **Port-early as design.** Every replicate retained; the donor's final-of-three retention is the specific defect being avoided; fold rule pre-registered in the manifest |

## 2026-08-08 21:15 EDT — ADR-021: DTO generation

#### datamodel-code-generator — PLANNED
- **Source:** https://github.com/koxudaxi/datamodel-code-generator
- **Commit / Version:** to be pinned at first use
- **License:** MIT
- **Kosmos location:** n/a — OH-GUI: build-time tool; output lands in
  `services/middleware/src/ohgui_middleware/upstream/_generated/`
- **Port(s):** none — it is a generator, not a runtime dependency, and nothing imports it
- **Native basis:** the pinned agent-server OpenAPI document, served by
  `ghcr.io/openhands/agent-server@sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520`
  (tag `ca46719-python`, v1.41.0). Generated output *is* the native basis, which is the point:
  a generated DTO cannot drift from upstream without the diff showing it.
- **Modifications:** none planned. Generated files are committed and reviewed as a diff, never
  edited by hand — an edited generated file is a hand-written DTO wearing a disguise.
- **ADR:** [ADR-021](adrs/ADR-021-dto-generation-boundary.md)
- **Logged:** 2026-08-08 21:15 EDT

Rejected alternative: hand-writing Agent Server DTOs. The donor already did this and
`PORTING_LEDGER.md` above excludes the result. `ipc/schema.py:AuthorizeRequest` is the same
mistake in this repo, caught before a hook was wired to it and now marked
`PROVISIONAL — UNVERIFIED` under ADR-014 verification item 5.

## 2026-08-08 23:30 EDT — ADR-023: blast radius (DERIVED, not a port)

#### Blast-radius projection table — DERIVED, hand-built by rule

- **Source:** none. This is not a port. ADR-015 clause 7 forbids re-implementing upstream semantics
  for display, and every candidate library for this job (shell parsers, diff-header parsers,
  command-intent classifiers) would be exactly that: a second source of truth for what an OpenHands
  action touches. **Vendoring was considered and rejected on the rule, not on quality.**
- **Commit / Version:** n/a
- **License:** n/a
- **Kosmos location:** `apps/gui/src/features/authorization/blast-radius.ts`
- **Port(s):** none — frontend projection over the ADR-021 DTO surface. No new port.
- **Modifications:** n/a
- **ADR:** ADR-023 (Ratified, option B)
- **Native basis** (ADR-015 clause 8; all verified in the pinned agent-server image and diffed
  against the pinned sdists, `docs/evidence/tool-action-fields.json`):

  | Native field | Declared formula |
  |---|---|
  | `FileEditorAction.path`, `.command` | identity → one path, native `command` literal beside it |
  | `PlanningFileEditorAction.path`, `.command` | identity → one path |
  | `EditAction.file_path` | identity → one path |
  | `WriteFileAction.file_path` | identity → one path |
  | `ReadFileAction.file_path` | identity → one path |
  | `ListDirectoryAction.dir_path`, `.recursive` | identity → one path + native recursive flag |
  | `GlobAction.path`, `.pattern` | identity → search root + pattern; **never** a resolved match set |
  | `GrepAction.path`, `.pattern`, `.include` | identity → search root + pattern; **never** a match set |
  | `BrowserNavigateAction.url` | WHATWG `new URL(url).host`; `null` on parse failure |

  Every formula is an identity or a single standard-library parse. Nothing infers, expands a glob,
  resolves a symlink, or interprets shell.

- **Explicitly NOT derived** (ADR-023 decisions 2, 2a, 2b): `TerminalAction`, `ApplyPatchAction`,
  `TaskAction`, `DelegateAction`, `WorkflowAction`, `ConsultTomAction`, `MCPToolAction`, the five
  SDK builtin actions, and the fifteen non-navigate browser actions. These render their native
  inputs verbatim under a no-analysis heading, never under a blast-radius heading.
- **Drift guard:** `apps/gui/src/__tests__/blast-radius-coverage.test.ts` reads
  `docs/evidence/tool-action-fields.json` and fails if the pinned suite contains an `Action` class
  with no recorded decision. A new upstream tool cannot silently inherit `null`.
- **Logged:** 2026-08-08 23:30 EDT

#### `openhands.agent_server.canvas_extensions` — REJECTED (deferred)
- **Source:** https://github.com/OpenHands/software-agent-sdk (`openhands-agent-server` 1.41.0)
- **Commit / Version:** 1.41.0 · sdist sha256 `a4c6456af759a43a92f9f0e9a620835519c0061763cc8e70d19aff2fb128eb6e`
- **License:** MIT (permissive — not the reason for rejection)
- **Kosmos location:** none
- **Port(s):** none
- **Modifications:** n/a
- **ADR:** ADR-024
- **Logged:** 2026-08-08 23:45 EDT

New in 1.41.0: installable UI bundles contributing pages via a `canvas-extension.json` manifest,
with path-traversal and symlink-escape containment. Deferred, not rejected on merit: the module is
two days old, has zero upstream consumers, and Agent Canvas 1.12.0 has no awareness of it. Building
against an interface with no shipped implementation gives ADR-015's "source beats docs" rule nothing
to check a reading against. Revisit triggers are recorded in ADR-024.


## 2026-08-09 00:20 EDT — ADR-025: first source-level canvas port (spec 04 §4.2 agent account)

The first port executed under [ADR-025](adrs/ADR-025-canvas-is-a-primary-donor-reused-at-source-level.md).
Recovery worked as ADR-025 predicted: the published tarball ships `sourcesContent` in its sourcemaps,
so this is the donor's original TypeScript, not decompiled output.

#### Agent thought / reasoning rendering — VENDORED (adapted)

- **Source:** `@openhands/agent-canvas` 1.12.0, `src/components/conversation-events/chat/event-thought-helpers.ts`, recovered from `dist/**/*.map` `sourcesContent`
- **Commit / Version:** npm 1.12.0 · `gitHead` `4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364` · tarball sha256 `fa110b20f400efe74d8888122e9db1c91e4b892776d2e248c40074113acf39ab`
- **License:** MIT
- **Kosmos location:** `apps/gui/src/features/authorization/agent-account.ts` (logic), `AgentAccountSection.tsx` (presentation)
- **Port(s):** none — this is GUI-local projection over already-fetched `ActionEvent` fields. No port contract is crossed, so no adapter is owed.
- **Not ported from the donor:** `splitInlineThink` (inline `<think>` scraping — a model-specific workaround with no §4.2 mandate) and `getThoughtSourceAction` (needs canvas's event-store shape).

**Modifications — three donor defects, each fixed and each covered by a killed mutant:**

| # | Donor behaviour | Why it is wrong | Ours |
|---|---|---|---|
| 1 | `thought.filter(t => t.type === 'text')` | `TextContent.type` is **optional** (`type?: 'text'`), so any block omitting it is silently dropped and real thought text is lost | Absent `type` counts as text |
| 2 | `thinking_blocks.filter(b => b.type === 'thinking')` | `ThinkingBlock.type` is also optional, so untyped thinking is dropped — and a *discriminator* is made load-bearing for keeping redacted payloads off screen | Structural selection: a block contributes only if `thinking` is a string, so `RedactedThinkingBlock.data` cannot leak even when mislabelled |
| 3 | `event.action.kind === 'ThinkAction'` | All **34** members of the wire `Action` union carry mangled kinds (`openhands__sdk__tool__builtins__think__ThinkAction-Output__1`); only the standalone declaration is bare. The comparison never matches — the donor's exclusion is dead code | `normalizeActionKind()` first (ADR-023) |

**Native basis (ADR-015 clause 8) —** verified against `@openhands/typescript-client` 1.37.0 `src/generated/agent-server-schema.d.ts`, cross-checked against SDK source in `openhands_sdk-1.41.0` (`sdk/event/llm_convertible/action.py`):

| Exposed field | Verified at | Note |
|---|---|---|
| `summary` | `agent-server-schema.d.ts` · `ActionEvent.summary` | LLM-authored ~10-word string. A *claim*, never rendered as a finding |
| `thought` | `ActionEvent.thought: TextContent[]` | Required in the SDK; `TextContent.type` optional |
| `reasoning_content` | `ActionEvent.reasoning_content` | Defaults `None` in SDK |
| `thinking_blocks` | `ActionEvent.thinking_blocks` | Read only to detect withheld reasoning |
| `responses_reasoning_item` | `ActionEvent.responses_reasoning_item` | **Deliberately unread.** `ReasoningItemModel` docstring: "Do not log or render `encrypted_content`." Exposing it is a separate specced decision |
| `critic_result` | `ActionEvent.critic_result` | Out of §4.2 scope; donor's `critic-result-display.tsx` extracted but not ported |

Display order follows upstream `ActionEvent.visualize` (Summary → Reasoning → Thought), except that Thought
precedes Reasoning here: `thought` is the agent's stated reason and `reasoning_content` its intermediate
chain, and §4.2 is about the account, so the conclusion leads.

---

#### LangGraph — REJECTED
- **Source:** https://github.com/langchain-ai/langgraph
- **Considered for:** orchestration / graph layer of the swappable stack
- **License:** MIT (not the reason for refusal)
- **Rejected because:** ADR-027 clause 4. LangGraph's purpose is to run the loop — nodes, edges,
  and a checkpointed execution graph. OpenHands already owns the plan-act-observe loop and its own
  event store and checkpointing (`sdk/conversation/`). Adopting LangGraph means a second harness
  inside the first, which is the Forge-OH failure mode restated.
- **Concurring evidence:** `docs/donor-specs/forge-oh/05-improvements-model-council-synthesis.md:122`
  — "Do NOT build … a custom plan-and-execute harness (Axis 3.1)".
- **ADR:** ADR-027
- **Reversal:** ADR only.
- **Logged:** 2026-08-09 01:36 EDT

#### CrewAI — REJECTED
- **Source:** https://github.com/crewAIInc/crewAI
- **Considered for:** orchestration / multi-agent layer
- **License:** MIT (not the reason for refusal)
- **Rejected because:** ADR-027 clause 4 — owns agent turn orchestration. OpenHands carries
  multi-agent work natively via `sdk/subagent/`, which is additionally the only tier with hard
  `max_iteration_per_run` and `max_budget_per_run` caps.
- **ADR:** ADR-027
- **Reversal:** ADR only.
- **Logged:** 2026-08-09 01:36 EDT

#### AutoGen — REJECTED
- **Source:** https://github.com/microsoft/autogen
- **Considered for:** orchestration / multi-agent conversation layer
- **License:** MIT (not the reason for refusal)
- **Rejected because:** ADR-027 clause 4 — owns the conversation loop and agent dispatch.
- **ADR:** ADR-027
- **Reversal:** ADR only.
- **Logged:** 2026-08-09 01:36 EDT

#### Podman — REJECTED
- **Source:** https://github.com/containers/podman
- **Considered for:** container / sandbox layer
- **License:** Apache-2.0 (not the reason for refusal)
- **Rejected because:** Docker plus the NVIDIA Container Toolkit is already the specced sandbox
  (`docs/donor-specs/forge-oh/01-integrated-design-and-development-spec.md:41`). Podman's rootless
  model is its main advantage and this is a single-user workstation, so it buys little; running two
  container runtimes doubles the sandbox-escape surface for no capability gain.
- **ADR:** — (recorded in `docs/specs/16-stack-layers.md`)
- **Reversal:** ADR, if the Docker daemon becomes an obstacle.
- **Logged:** 2026-08-09 01:36 EDT

#### GSAP — REJECTED
- **Source:** https://github.com/greensock/GSAP
- **Considered for:** frontend animation
- **License:** GSAP standard "no charge" license — **not** an SPDX permissive license, and a second
  reason to refuse independent of the overlap below.
- **Rejected because:** Framer Motion is already adopted and shipping in three files. Two animation
  runtimes means two idioms for one job and avoidable bundle weight.
- **ADR:** — (recorded in `docs/specs/16-stack-layers.md`)
- **Reversal:** ADR, and would require a licence review.
- **Logged:** 2026-08-09 01:36 EDT

# Canvas conversation-event rendering — PORTED

- **Source URL:** https://www.npmjs.com/package/@openhands/agent-canvas/v/1.12.0
- **Canonical upstream:** https://github.com/OpenHands/OpenHands
- **npm version:** `@openhands/agent-canvas` 1.12.0
- **Tarball SHA-256:** `fa110b20f400efe74d8888122e9db1c91e4b892776d2e248c40074113acf39ab` (`/tmp/canvas112/c.tgz`)
- **SPDX license:** MIT
- **Kosmos location:** `apps/gui/src/features/events/`
- **Ports crossed:** none — GUI-local projection
- **ADR basis:** ADR-015, ADR-023, ADR-025, ADR-026 D1.3
- **Recovery:** `/tmp/extract_canvas_sources.py` read each `dist/**/*.js.map` `sourcesContent` entry into `/tmp/canvas-src/` before adaptation. The GUI source does not import from the donor tree.
- **Logged:** 2026-08-09 03:19 EDT

## Donor sources read

| Donor source | OH-GUI target |
|---|---|
| `components/conversation-events/chat/event-content-helpers/should-render-event.ts` | `event-content-helpers/should-render-event.ts` |
| `components/conversation-events/chat/event-content-helpers/get-action-event-title.ts` | `event-content-helpers/get-action-event-title.ts` |
| `components/conversation-events/chat/event-content-helpers/get-action-content.ts` | `event-content-helpers/get-action-content.ts` |
| `components/conversation-events/chat/event-content-helpers/get-observation-content.ts` | `event-content-helpers/get-observation-content.ts` |
| `components/conversation-events/chat/group-events.ts` | `chat/group-events.ts` |
| `components/conversation-events/chat/event-message-components/error-event-message.tsx` | `event-message-components/error-event-message.tsx` |
| `components/conversation-events/chat/event-message-components/finish-event-message.tsx` | `event-message-components/finish-event-message.tsx` |
| `components/conversation-events/chat/event-message-components/collapsible-thinking.tsx` | `event-message-components/collapsible-thinking.tsx` |

## Modifications

| Area | Source-level adaptation |
|---|---|
| Wire projection | Added `event-types.ts`: read-only structural checks only, with ADR-023 `normalizeActionKind` before every event/action/observation kind comparison. |
| Visibility | Preserves every event bearing a native discriminator. Only an absent discriminator returns `false`; unknown kinds are deliberately available to an UNHANDLED renderer. |
| Action title/content | Uses only `ActionEvent.summary`, `action`, and `tool_name`; handles native `action: null`; uses exact `FinishAction.message` / `ThinkAction.thought`; known non-special actions preserve their raw native JSON. |
| Observation content | Uses native observation JSON or exact user-rejection reason. Does not synthesize success, no-output, or error text. Unknown observation classes receive an UNHANDLED marker and raw JSON. |
| Event grouping | Replaced Canvas's UI-normalized consecutive-card collapse with durable-log pairing by `ObservationEvent.action_id` / `UserRejectObservation.action_id`; duplicates, reverse-order, and orphans remain independent. |
| Message components | Replaced Canvas-owned ChatMessage/ErrorMessage/Markdown dependencies with local React primitives; raw text is rendered in a preformatted text element. The finish card reads only the verified finish message and error card only the verified error string. |
| Dependency posture | No import from `/tmp/canvas112`, `/tmp/canvas-src`, or `@openhands/agent-canvas`; donor remains evidence only as ADR-026 D1.3 requires. |
| Tests | Added 27 real-object Vitest assertions and eight deliberate source mutants (M1–M8), all killed. |

## Native basis (SDK source is authoritative)

| Rendering surface / field | SDK source basis |
|---|---|
| Event discriminator and `id` for record identity/pairing | `openhands/sdk/utils/models.py:197-200` (`kind` computed discriminator); `openhands/sdk/event/base.py:20-32` (`Event`, `id`, `source`) |
| `ActionEvent.action`, including native non-executable `null`; `tool_name` | `openhands/sdk/event/llm_convertible/action.py:24-46` |
| `ActionEvent.summary` | `openhands/sdk/event/llm_convertible/action.py:77-88` |
| `ActionEvent.reasoning_content` / thinking blocks, supplied by caller to CollapsibleThinking | `openhands/sdk/event/llm_convertible/action.py:29-36` |
| `FinishAction.message` | `openhands/sdk/tool/builtins/finish.py:21-22` |
| `ThinkAction.thought` | `openhands/sdk/tool/builtins/think.py:21-24` |
| `ObservationEvent.observation` and `action_id` | `openhands/sdk/event/llm_convertible/observation.py:32-45` |
| `UserRejectObservation.rejection_reason`, `rejection_source`, and `action_id` | `openhands/sdk/event/llm_convertible/observation.py:86-107` |
| `AgentErrorEvent.error` | `openhands/sdk/event/llm_convertible/observation.py:138-150` |
| Generic observation payload stays structurally opaque/raw rather than reading unverified tool-specific fields | `openhands/sdk/tool/schema.py:357-372` |

## Donor defects found

| Defect | Donor evidence | Disposition |
|---|---|---|
| Bare `kind` equality/switches are dead against mangled wire discriminators. | Requested helpers compare raw `event.action.kind` or `event.observation.kind`: `should-render-event.ts:65-84,96`; `get-action-event-title.ts:37-145`; `get-action-content.ts:160-267`; `get-observation-content.ts:359-435`; `group-events.ts:23-38`. Related renderer/helper paths do likewise: `event-thought-helpers.ts:98,107`; `event-message.tsx:218,230`. | **Fixed in port:** every relevant comparison calls `normalizeWireKind`, which delegates to ADR-023 `normalizeActionKind`. |
| Nullable native `ActionEvent.action` is dereferenced and/or rejected, silently losing a valid non-executable event. | `should-render-event.ts:63-69`; `get-action-event-title.ts:37`; `get-action-content.ts:218-220`; `group-events.ts:23-25`. SDK confirms `Action | None` at `action.py:40-43`. | **Fixed in port:** visibility preserves the event; title describes native non-executable state; content stays `null`. |
| Optional wire discriminators cause silent content loss when donors filter only `type === "text"` or `type === "thinking"`. | Requested `should-render-event.ts:28-36`; requested `get-observation-content.ts:34-40,70-73` and other filters; related `event-thought-helpers.ts:15-19,33-37`. Installed generated client declares `TextContent.type?`, `ThinkingBlock.type?`, and `RedactedThinkingBlock.type?` at `agent-server-schema.d.ts:11411,11514,9183`. | **Fixed by adaptation:** the port does not discriminate individual content blocks. It preserves the verified opaque native action/observation payload as JSON. The unrelated donor thought helper was not ported. |
| Missing native outcome is converted to fabricated success. | `get-observation-result.ts:37-45` returns `success` when terminal exit/error state is absent, and `:67-68` defaults every unrecognised observation to `success`. | **Not ported:** no result-status helper or fallback success state was copied; missing native signal returns `null` and unknown kinds are UNHANDLED. |

#### Paired mid-p McNemar test — VENDORED
- **Source:** https://github.com/rmholston420/Forge-OH/blob/df73ebed2d6d9df9397f7e95dd1eb66bd3dd98b2/bench/lib/mcnemar.py
- **Commit / Version:** `df73ebed2d6d9df9397f7e95dd1eb66bd3dd98b2`
- **License:** MIT
- **OH-GUI location:** `bench/lib/mcnemar.py`
- **Port(s):** paired mid-p McNemar comparison for tool-call benchmark outcomes
- **Modifications:** retained the donor algorithm; added vendoring provenance and an ADR-013 limits notice to the module docstring. The notice documents that `resolved=None` records are excluded before pairing and that repetitions must be folded outside the test.
- **ADR:** [ADR-013](adrs/ADR-013-benchmark-discrimination-floor.md)
- **Logged:** 2026-08-09 03:45 EDT
