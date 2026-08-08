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
