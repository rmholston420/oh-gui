# Forge-OH Port Survey

> **SUPERSEDED 2026-08-08 by `docs/forge-oh-code-review.md`.** This was a docstring-level
> structural pass. The full line-by-line review contradicts it on five load-bearing points —
> most importantly the "recommended first port" below (`loop_guard.py`) is **not** a clean first
> port. See §7 of the code review. Retained unedited as a record of what a survey-depth read
> got wrong.

**Surveyed:** 2026-08-08 18:37 EDT
**Donor:** `https://github.com/rmholston420/Forge-OH` — public, MIT (`LICENSE` at root, verified via GitHub API)
**Pin:** `df73ebed` ("Slice 8.0.5: closeout entry for SMOKE_100 populate", pushed 2026-08-06T22:59:50Z)
**Size:** 976 blobs, ~7.3 MB

## Scope and honesty boundary

This is a **structural survey at docstring level**, not a line-by-line read. Every file listed
below was seen in the pinned tree with its real size; the eight modules marked **(read)** had their
first ~30 lines read directly. Everything else is judged from path, size, and neighbours, and must
be read in full before any of it is vendored. No claim here should be treated as a review of
implementation quality.

Per the porting rule, nothing in this document constitutes a port. Each adoption still needs its
own `PORTING_LEDGER.md` entry, an adapter behind a formal port, and a contract test.

## What Forge-OH is

A FastAPI BFF (`bff/`, 129 files) plus a Next.js 15 App Router frontend (`src/`, 476 files),
wrapping the OpenHands SDK with an extension package (`openhands_tools_ext/`, 111 files) that hooks
tool invocation. It is the same problem OH-GUI is solving, one architecture generation earlier, and
with substantially more surface already built: 20 dashboard routes, 55 BFF tests, 160 frontend
test files.

The key structural difference: Forge-OH is Next.js + a Python BFF. OH-GUI is Vite/React
(`apps/gui`) with a thinner middleware layer (`services/middleware`). **Frontend code does not port
directly** — App Router pages, server components, and Next-specific data fetching have no
equivalent in the OH-GUI shell. Python BFF services and the tools extension port far more cleanly.

## Tier 1 — port early, high value, low coupling

| Module | Size | Why it matters to OH-GUI |
|---|---|---|
| `bff/services/gpu_monitor.py` **(read)** | 15.0K | Async `nvidia-smi` ring buffer, `FORGE_GPU_TEMP_CUTOFF_C` default 83 — the same 83 °C ceiling already used in the OH-GUI bench gates. Feeds spec 08's telemetry strip (VRAM used/total). Records `unavailable=True` rather than crashing when `nvidia-smi` is absent. |
| `openhands_tools_ext/gpu/hook.py` | 10.0K | PRE-tool hook that consults the monitor and can block a tool call on temperature. This is the **interception point** the Phase 1 authorization plane needs — the same seam a trust dial and authorization card hang off. |
| `bff/services/loop_guard.py` **(read)** | 1.6K | Fingerprints agent actions over a sliding window and flags repetition. Spec 04 Phase 1 exit criteria require "a synthetic stuck-loop scenario surfaces the intervention card." This is that detector, and it is 40 lines. |
| `bff/services/inference_backends/` **(read: protocol, registry)** | ~14K total | A `Protocol`-typed backend abstraction with adapters for Ollama, vLLM (coder/planner/legacy), llama.cpp and SGLang. Adapters are contractually forbidden from raising in `health()`. This is already port-shaped and drops almost unchanged behind an OH-GUI inference port. |
| `bff/services/event_normalize.py` **(read)** | 17.9K | Projects raw agent-server events to a UI-consumable shape, with an explicit "do not drop unrecognized fields" rule and handling for SDK v1.40 condensation events. OH-GUI is on SDK 1.41.0, so the mapping table needs re-verification against the newer event classes. |

## Tier 2 — port when the matching phase arrives

| Module | Size | Phase |
|---|---|---|
| `bff/services/model_router.py` **(read)** | 22.7K | Role-based routing (`route_by_role`), primary/fallback across Ollama and vLLM, dual-port topology. Pairs with ADR-012's default coder model. Carries Forge-OH-specific history (F.18/F.19 slices, removed legacy paths) that should be stripped on port. |
| `bff/services/idempotency_ledger.py` **(read)** | 9.1K | Exactly-once ledger for state-changing tool calls, keyed on `sha256(conversation_id|leaf_event_id|tool_name|args)`. Includes a documented SDK probe finding: the SDK exposes no `task_id`/`step_index` to a `ToolExecutor`. That finding alone is worth the read. |
| `bff/services/worktree.py` **(read)** | 14.3K | Per-run `git worktree` isolation with a path-traversal guard against crafted `run_id` values. Directly relevant to Phase 2 change review. |
| `bff/services/event_commit_ledger.py` | 8.1K | Event→commit correlation; feeds spec 04's audit log. |
| `bff/services/metrics_aggregation.py`, `run_metrics.py` | 15.5K | Telemetry aggregation for spec 08. |
| `bff/services/file_diff_reconstruction.py`, `action_reconstruction.py`, `trace_reconstruction.py` | 27.4K | Diff and trajectory reconstruction — Phase 2/3 workbenches. |
| `bff/services/restart.py`, `sidecar.py`, `sidecar_producers.py` | 42.3K | Process supervision. Large, and coupled to Forge-OH's compose topology. |
| `openhands_tools_ext/verify/` | ~37K | Verification loop, selector, runner, breakpoint inspector. |
| `openhands_tools_ext/tool_invocation/` | ~22K | `router.py`, `progressive_disclosure.py`, `code_exec_mode.py`. |

## Tier 3 — leave, or take only as reference

- **`openhands_tools_ext/memory/`** (~100K) — DozerDB, Qdrant, Ollama-embedding adapters and an ACE
  curation cycle. This is Kosmos' problem domain, not OH-GUI's, and OH-GUI has no memory port. Note
  also that **DozerDB is GPLv3**; the adapter code is MIT and talks to it over Bolt, so there is no
  linking issue, but do not let that dependency drift into OH-GUI without an ADR.
- **`openhands_tools_ext/repograph/`** (~53K) and **`selfeval/`** (~38K) — substantial subsystems
  with no current OH-GUI spec requirement.
- **`src/`** — mine for component ideas (`ApprovalBanner.tsx`, `features/security/RiskBadge.tsx`)
  but do not port Next.js code into the Vite shell.
- **`.github/`** — Forge-OH carries GitHub workflows. OH-GUI's project constraints forbid
  GitHub-native CI. **Do not port.**
- **`ops/vllm_supervisor.sh`, `vllm_launch_*.sh`** — useful reference for the vLLM path, but that
  path is not currently OH-GUI's; the ADR-012 default is an Ollama tag.

## Blocking constraint discovered this session

Forge-OH's containers (`forge-oh-bff:latest`, its SearXNG) ran under the **apt** Docker daemon,
which was masked on 2026-08-08 (see `DEBUG_LOG.md`, same date). Images live in `/var/lib/docker`,
which the surviving snap daemon cannot read.

- **Reading donor source is unaffected** — `~/dev/forge-oh` and the GitHub repo are both intact.
- **Running the Forge-OH stack for behavioural comparison requires a rebuild under the snap
  daemon.** As of 2026-08-08 19:40 EDT this is the *only* remaining option: `/var/lib/docker` was
  deleted to reclaim 154 GB, so `forge-oh-bff:latest` and the SearXNG image are gone and unmasking
  the apt daemon would no longer recover them. Consistent with the already-ratified source-only
  review decision; the cost is a rebuild, not a lost capability.

This matters because several Tier 1/2 modules are best verified by observing them running. Any port
that needs a live reference run must budget for a rebuild first.

## Recommended first port

`loop_guard.py` — smallest useful unit (1.6K), a Phase 1 exit criterion, no external dependencies,
and trivially contract-testable. It proves the port workflow end to end (ledger entry → adapter →
contract test) at near-zero risk before anything load-bearing moves.

## Sources

- Repo metadata and tree: `https://github.com/rmholston420/Forge-OH` at `df73ebed`
- Phase definitions: `docs/specs/11-dev-plan.md`, `docs/specs/04-authorization.md`, `docs/specs/08-telemetry.md`
