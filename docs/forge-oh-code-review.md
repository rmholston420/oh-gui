# Forge-OH Full Code Review

**Reviewed:** 2026-08-08 EDT
**Donor:** `https://github.com/rmholston420/Forge-OH` — public, MIT
**Pin:** `df73ebed2d6d9df9397f7e95dd1eb66bd3dd98b2`
**Size read:** 976 blobs / ~116k lines. Six parallel reviewers, ~27.5k words of findings.
**Detail:** `docs/forge-oh-review/01..06`. This file is the consolidated verdict; the numbered
files carry the line-level evidence and are the authority where they disagree with a summary here.

**This review supersedes `docs/forge-oh-port-survey.md`** wherever the two conflict. The survey was
a docstring-level structural pass and got several load-bearing things wrong (§7).

## Coverage

| File | Area | Depth |
|---|---|---|
| `forge-oh-review/01-bff-routers.md` | `bff/` except `services/` — 22 routers, `main.py`, `settings.py`, `deps/`, Dockerfile, tests tree | every non-services file read |
| `forge-oh-review/02-bff-services.md` | all 38 `bff/services/` files | read in full |
| `forge-oh-review/03-tools-ext.md` | `openhands_tools_ext/`, 69 files + SDK 1.40/1.41 wheel diff | read in full |
| `forge-oh-review/04-frontend.md` | `src/`, 476 files | shell/lib/core/relevant domain read in full; remaining features inventoried |
| `forge-oh-review/05-bench-ops-scripts.md` | `bench/` 73, `ops/` 9, `scripts/` 37 | all 36 `.sh`, 24 `.py`, 6 `.ts` read in full; two suites executed |
| `forge-oh-review/06-docs-config.md` | docs, ADRs 003–029, `.agents/`, `.openhands/`, root config | ADRs + DEBUG_LOG (2,324 lines) read in full |

Nothing in the donor was modified. Nothing here is a port: each adoption still needs its own
`PORTING_LEDGER.md` entry, an adapter behind a formal port, and a contract test.

## 1. The headline

**Do not adopt Forge-OH as a foundation.** It is a broad SDK-1.40-specific REST façade with, by
measurement, essentially **no authorization**: no auth dependency or middleware anywhere in the BFF,
a server defaulting to `0.0.0.0` with wildcard CORS, and `maxCost`, `toolAllowlist`, `loopGuard`,
`systemPrompt`, `maxSteps` all **declared in `AgentPreset` and never applied** — the tool set is
hard-coded at `runs.py:430-435`. Approval installation **fails open** (`runs.py:518-560`), and
`/approve` / `/reject` carry **no action ID**, so a stale card can decide a different pending action
(`runs.py:1164-1213`).

That is the finding that matters: Forge-OH is the right **problem statement** for OH-GUI Phase 1
and the wrong **implementation** of it. Its value to us is (a) the exact SDK seam, mapped precisely,
(b) a large body of recorded operational failure, and (c) a handful of genuinely portable
local-first utilities.

## 2. The authorization seam — build against this

From reading the SDK wheels directly, not the donor's claims about them. **The hook package and
`openhands/sdk/event/` are byte-identical between 1.40.0 and 1.41.0**, so this is valid for our
1.41 target.

Inject one `pre_tool_use` wildcard `HookType.COMMAND`. It receives JSON on stdin with `event_type`,
`tool_name`, `tool_input` (= `action.model_dump()`), `session_id`, `working_dir`, `metadata`.

| Operation | Available |
|---|---|
| Inspect tool name / arguments | **Yes** |
| Block the pending action | **Yes** — exit 2, or `{"decision":"deny"}`, or `{"continue":false}` (`hooks/executor.py:28-66`, `475-510`) |
| Attach diagnostic context | Partly — camel-case `additionalContext` is recognized |
| Modify or replace the action | **No.** `HookResult` has no mutation field. Allow/block only, not transform middleware |
| Native "ask" approval state | **No.** `ASK` is a commented future concept (`hooks/types.py:35-45`) |
| Fail closed on hook error/timeout | **No.** Exit 1, exception, malformed output and timeout all produce an error result, not a block |
| Cancel in-flight work | **No.** Pre-tool runs before execution; it cannot kill a running child process |

Consequences for our Phase 1 design: the ASK state, expiry, the audit ledger and the emergency stop
must all live in **our** middleware, reached from the hook over localhost IPC. The hook is a
synchronous deny gate, nothing more. Fail-closed has to be implemented by us, because the SDK's
default is fail-open.

Only **`gpu/hook.py`** is a pre-tool hook. `verify/hook.py` and `trajectory/hook.py` are **stop**
hooks. Two confirmed defects there, worth knowing before trusting any donor hook code:

- `verify` emits `{"decision":"block"}` and exits 0. The SDK recognizes `"deny"` / exit 2. **Its
  retry enforcement has never worked**, and `tests/verify/test_loop.py:136-142` codifies the
  invalid string as expected.
- Stop hooks run with `stop_on_block=True` (`hooks/manager.py:180-196`), contradicting the donor's
  own comment that they "do NOT short-circuit". Fixing verify to deny would silently stop trajectory
  persistence from running.
- `trajectory/hook.py:157-196` defaults a verdict-less stop to `SUCCESS`, so aborted runs can be
  recorded as successful.

## 3. Port verdicts

Four terms: **port-early** (useful for the authorization MWS), **port-later** (after the spine
exists), **leave** (reference only), **exclude-with-reason** (would import unsafe topology).

### port-early

| Item | Caveat |
|---|---|
| `bff/services/event_normalize.py` as behavioral reference | Rewrite as a typed OH-GUI event adapter. Bootstrap and live relay **must** share one normalizer — the donor's asymmetry here is a logged bug. Its real gap is missing event kinds (`InterruptEvent`, `HookExecutionEvent`, `StreamingDeltaEvent`, `ACPToolCallEvent`, `UserRejectObservation`), not a 1.40→1.41 delta |
| `bff/services/gpu_monitor.py` polling idea | Take the local `nvidia-smi` poll and the `unavailable=True` rather than crash behavior; drop the global singleton. **GPU polling cannot produce tok/s** — that needs a separate inference-rate meter |
| `bff/routers/gpu.py` contract (43 LOC, 2 routes) | Snapshot + bounded history is the right shape for the spec-08 strip |
| `components/navigation/GpuStrip.tsx` + `GpuChipPopover.tsx` | Strongest concrete frontend donor. React/CSS/Recharts only. Rewrite the API adapter and env; keep the "telemetry unavailable" state. Does not carry tok/s, context pressure, or run attribution |
| `bench/_common/nvml_sampler.py` | Small reusable telemetry primitive. Wire to our 45 °C cold / 80 °C warn / 83 °C stop gates and change missing-NVML from no-op to **fail closed** |
| Immutable per-trial manifest design (SWE Path A) | Right direction; expand metadata and keep every replicate, not final-only |
| `scripts/e2e-run.ts` instrumentation | Best fit for our mandatory Playwright checks. Fix heuristic selectors (`data-testid`), correlate the run id from the create response instead of "newest of five", fail explicitly on non-terminal timeout, redact captured payloads |
| `scripts/debug-frontend.ts` | Compact read-only browser/network/screenshot diagnostic |
| `scripts/forge-status.sh` | Read-only, verifies listener **and** pidfile **and** process parentage rather than trusting a port |
| Vitest + Testing Library + MSW foundation, `tsconfig` strictness, `ruff.toml`, `playwright.config.ts` | Adopt with Next bits stripped and CI-conditioned branches removed |
| `styles/tokens.css` | Cleanest visual artifact. Repair first: several referenced variables (`--color-accent-emphasis`, `--color-text-on-accent`, `--font-size-caption`) are undefined, and the appearance settings UI writes names the tokens do not consume |

### port-later

`worktree.py` (path-traversal guard is good; requires `.git` dir so it rejects bare repos),
`event_commit_ledger.py`, `restart.py`, `run_metadata_store.py`, `run_metrics.py`,
`metrics_aggregation.py`, `action_reconstruction.py`, `file_diff_reconstruction.py`,
`trace_reconstruction.py`, `event_fetch.py`, `event_relay.py`, `search_events.py` (behind
quarantine), `context_loader.py` (behind quarantine), `hook_config.py`, `episodic_memory.py`,
`repograph_registry.py`, `inference_backends/` (the Protocol is clean only for health inventory;
`_common.count_models` raises on list JSON, violating "health must not raise"), the routers
`agent_presets`, `git`, `idempotency`, `metrics`, `observability`, `repograph`, `runs`; the
`memory` ports/DTOs and RepoGraph parser; progressive-disclosure tools; verify selector/runner/
schema; trajectory schema/store/retriever; `bench/lib/mcnemar.py`; manual scoring bundles; SWE
Path A oracle evaluator; `compare_tokens.py`; vLLM supervisor **design**; systemd self-eval
pattern; `forge-up.sh`, `forge-doctor.sh`, `forge-test.sh`; `e2e-approval.ts`, `e2e-stage6.ts`;
stage worktree/crash-resume probes; `pre_commit_drift_check.sh`.

### exclude-with-reason

| Item | Reason |
|---|---|
| `bff/routers/bash.py`, `features/terminal`, `LiveBashPanel` | Raw command execution. Global upstream event state mislabeled as per-run — `DELETE /events` wipes it for everyone. Cannot support run-bound audit |
| `bff/routers/mcp.py` | Registers arbitrary stdio/HTTP/SSE servers incl. command + env |
| `bff/routers/plugins.py` | Arbitrary plugin source/marketplace install |
| `bff/routers/debug.py` | Injects synthetic timeline events |
| `model_router.py` | 556 lines carrying F.18/F.19 history and a dual-port topology that is not ours |
| `conflict_checker.py`, `mcp_bootstrap.py`, `trajectory_drain.py`, `sidecar.py` | Topology-coupled |
| `sidecar_producers.py` | O(n²); silently drops events past 5000 |
| `run_compare.py` | Path traversal at `:118-123` |
| `openhands_tools_ext/selfeval` | Systemd launcher assuming Forge BFF routes; real `TypeError` at `harness.py:318-330` |
| `tool_invocation/code_execute` | Accepts arbitrary Python at the agent-server boundary |
| DozerDB-backed memory, RepoGraph Neo4j store | **DozerDB is GPLv3.** Adapter is MIT over Bolt so no linking issue, but it is a non-permissive operational dependency — needs its own ADR if ever considered |
| `src/app/**`, `middleware.ts`, `src/app/api/**` | Next App Router; OH-GUI is Vite |
| `styles/legacy-globals.css` | A second, untyped styling system (it is not Tailwind; the file says so) |
| `.github/workflows/*`, `forge-screenshots.sh`, ADR-016 parity | GitHub-native CI is forbidden by project constraints. `forge-screenshots.sh` deletes screenshots, branches, commits and **pushes** |
| `Dockerfile`, all three Compose files, `Caddyfile` | Public ingress, shared Kosmos DozerDB, drifted service references |
| `ops/vllm_supervisor.sh` as-is, `vllm_launch_*.sh`, legacy `vllm_*` scripts | Fail-open on absent `nvidia-smi`, `fuser -k PORT/tcp` and global `pkill -9`, `:latest` image called "pinned", published on all interfaces, no lock, no thermal gate |
| `e2e-stage7.ts` | Destructive broad API verifier with almost no browser coverage |

## 4. Frontend — what actually transfers

The donor pins **Next 16.2.10** (not 15), React 19, TanStack Query v5, Zustand v5, Zod 4,
Socket.IO, Monaco/xterm, Recharts. Routing, error boundaries, API route handlers and `middleware.ts`
are all App Router-bound and do not come across.

What does: the **state layering** (Query for server truth, small Zustand stores for UI state, Zod at
every protocol boundary), the CSS-module core primitives (`Button`, `Badge`, `Banner`, `Input`,
`Panel`, `Skeleton`, one `Table` — there are two duplicate Table implementations), and the testing
habits (MSW route fixtures, exact mutation-body assertions, destructive-action confirmation tests;
`run-fork-from-here.spec.ts:267-397` asserts the canonical wire field including negative aliases,
which is the habit to copy).

What must be rebuilt rather than ported:

- **`ApprovalBanner.tsx` takes four props**: `context?: string`, `onApprove`, `onReject`, `loading?`.
  No approval id, action identity, capability, resource, diff, risk rationale, provenance, budget,
  policy match, expiry, scope choice, reject reason, or audit confirmation. Approval is a **boolean**
  in the store (`ui-store.ts:34-40`). A boolean cannot carry an authorization decision.
- Two approval entry points exist (banner + `RunDetailHeader`), both run-wide, neither identified.
- `features/security/RiskBadge.tsx` renders **no badge at all** for `UNKNOWN`/missing risk, and the
  run page's "auto-collapse low-risk actions" actually hides **UNKNOWN or absent** risk while keeping
  LOW/MEDIUM/HIGH (`page.tsx:203-212`). The label and the behavior disagree, and the E2E tests
  encode it. That is a security-UX regression written down as expected behavior — do not inherit it.
- Emergency stop is a bare header button: no confirmation, no scope, no audit, no representation of
  what was interrupted. `RestartFromHereButton:138-150` has the confirmation-copy pattern to borrow.
- `Modal`/`Drawer` lack focus trapping and restoration; Drawer uses `role="complementary"`. Do not
  use them for consequential decisions. Rebuild one accessible dialog.

Two things worth keeping as **conventions**: `lib/schemas/secret.ts:3-10` treats raw secret values
as not read-side data (write-only inputs in `RunSecretsModal`), and `RunModelSwitchModal:20-33`
states that model routing is preset-only with credentials server-side.

There is no donor implementation of Vibe/Pro semantic zoom. Build both lenses over one
`AuthorizationRequest` record sharing id, endpoint, audit event and reducer — not a separate "Vibe
authorization mechanism."

## 5. Measurement — the donor does not solve our n=1 problem

Every harness (F.19, Path E, Path F) runs a warm-up plus three calls but **retains only the last
output**. The three calls measure latency, not quality variance — no reviewer can audit an
individual draw. No seed, `temperature=0.7`, and manifests missing dataset revision, sampling
profile, image/driver identity, prompt hash and repo hash.

`bench/lib/mcnemar.py` is genuinely correct and tested (mid-p exact under 25 discordant pairs,
continuity-corrected chi-square above; six standalone tests pass, executed during review). It is
the right paired test for a binary outcome. **It does not fix n=1**: no repetitions, no seed
capture, still binary terminal pass/fail, and it silently drops tasks missing from either run — an
OOM that selectively removes hard tasks biases the analysis. On saturating tasks it returns "no
discordant pairs; test not applicable", which is not discrimination.

What we actually need, and should build rather than port: an immutable trial record per
`candidate × difficult task × replicate` with seed/sampling/runtime/build hashes and all traces;
a **weighted partial score** (UI-state assertions, diff correctness, approval-policy behavior,
time-to-terminal) plus latency and energy; paired bootstrap CIs or a paired permutation test on
per-task aggregate score; McNemar only as a secondary predeclared binary check, with replicates
clustered per task before testing.

SWE-bench Path A is an **oracle-retrieval code-editing** metric — it uses the ground-truth patch to
select the relevant files, deliberately removing retrieval difficulty. It cannot validate our
UI/agent workflow. It also needs Docker images, GitHub clones and an unpinned HF dataset fetch, all
of which conflict with the current boundary. Its `gpu_seconds_total` probes keys the sampler never
emits and silently falls back to wall-time while labelling it a GPU source — do not quote it.

## 6. GPU safety practices to adopt now

1. Keep our gates as authority: no launch above **45 °C** cold-start, warn **80 °C**, abort **83 °C**.
   Persist temperature, VRAM, power, utilization beside every result.
2. Stop only an **explicitly owned** competing service; require measured free VRAM. Never `pkill -9`
   or `fuser -k` as a control plane.
3. `flock` every GPU role switch and bench launch.
4. **Fail closed** when NVML/`nvidia-smi` cannot verify the GPU.
5. Pin image digest, model artifact hash, driver/CUDA/vLLM version, flags and max active sequences
   in the manifest. Never call `:latest` "pinned".
6. Enforce the tested concurrency. The donor's launchers do VRAM math at concurrency 1 and then set
   `--max-num-seqs 128`.
7. On readiness or thermal failure, tear down the just-started owned container; do not strand VRAM.
8. Bind to `127.0.0.1:PORT`, not the Docker default of all interfaces.

## 7. Corrections to `docs/forge-oh-port-survey.md`

The survey was docstring-level. The full read contradicts it on five points:

| Survey claim | Corrected |
|---|---|
| `loop_guard.py` is the recommended first port — "40 lines, trivially contract-testable" | **Wrong.** 44 lines, **never wired to any event source**, unguarded invalid configs, ambiguous colon-joined fingerprints, no run scoping, and it produces no evidence a card could render. Port the concept; rewrite the detector |
| `openhands_tools_ext/gpu/hook.py` is "the interception point the Phase 1 authorization plane needs" | Half right. It is the only true pre-tool hook, but it **reads and discards stdin** (`:179-185`), so it cannot see the tool name or arguments, and it intentionally allows when the BFF is unreachable. The seam is right; this implementation is a hardware guard, not a gate |
| `event_normalize.py` mapping "needs re-verification against SDK 1.41 event classes" | **Wrong premise.** `openhands/sdk/event/` is byte-identical between the 1.40.0 and 1.41.0 sdists. Its real gaps are unhandled event kinds |
| `idempotency_ledger.py` is an "exactly-once ledger" | **Not exactly-once.** check → execute → mark has a crash window; the extension's `INSERT OR IGNORE` claim is false. Its SDK probe finding *is* verified correct (no `task_id`/`step_index` reaches a `ToolExecutor`; `leaf_event_id` is real at `conversation/state.py:176-183`) |
| Frontend "Next.js 15" | Package pins **Next 16.2.10** and uses the Next 16 async-param pattern |

## 8. Recommended extraction order

1. **Our own event and audit records first.** Raw reference, trust/quarantine state, action
   proposal + fingerprint, approval, stop, budget, loop and diagnostic events. Fixture-test the
   rewritten event adapter before anything consumes it.
2. **The action ledger and policy gate.** Atomic proposed → approved → executing → terminal
   transitions, explicit fail-closed rules, audit receipts, a concrete interrupt path. Inject the
   single `pre_tool_use` hook against this.
3. **Local telemetry.** GPU sampling with freshness plus a separate tok/s meter. Render both in the
   strip; do not let a GPU threshold substitute for stop enforcement.
4. **Loop detection.** Structured fingerprints, persisted evidence, pause for the card.
5. **Evidence projections last.** Diffs, commands, plans, traces — consuming the typed audit stream,
   never raw event dictionaries.

Defer indefinitely: Serena/RepoGraph, graph and vector memory, SearXNG, self-eval systemd,
code-execution tools, browser/VNC.

## 9. Minimum authorization tests before Phase 1 closes

1. One requested action renders the same `authorizationRequest.id` in Vibe and Pro.
2. Only the matching pending request can be decided.
3. A stale, resolved or replayed decision is rejected by middleware.
4. Deny/stop is enforced even when a caller bypasses the UI.
5. Each decision produces exactly one immutable audit event.
6. Unknown/untrusted provenance is visible and cannot be silently collapsed.
7. Capability-manifest mismatch denies **before** executor invocation.
8. Budget pre-check blocks and records its estimate and reason.
9. Malformed tool-call diagnostic shows a redacted payload plus repair/stop options.
10. A telemetry snapshot is frozen into every approval, denial and stop event.
11. Hook timeout and hook error **deny**, not allow.

## Sources

- Donor tree at `https://github.com/rmholston420/Forge-OH` commit `df73ebed`
- OpenHands SDK sdists 1.40.0 and 1.41.0, unpacked and diffed during review
- Phase definitions: `docs/specs/11-dev-plan.md`, `docs/specs/04-authorization.md`, `docs/specs/08-telemetry.md`
