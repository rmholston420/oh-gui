# Forge-OH bench, ops, and scripts review

**Target reviewed:** `/home/user/workspace/forge-oh` at `df73ebed2d6d9df9397f7e95dd1eb66bd3dd98b2` (reported pin `df73ebed`).  
**Scope:** `bench/` (73 files), `ops/` (9 files), `scripts/` (37 files). This is a review only; no Forge-OH source was changed.

## Reading coverage and method

- **Read in full:** all shell and Python source under the requested trees: **36 `.sh` files** and **24 `.py` files**. I also read all six scripts TypeScript drivers in full, because the request specifically requires a close Playwright assessment.
- **Read in full:** `ops/compose/searxng.yml` and `ops/systemd/forge-oh-selfeval.service`.
- **Bench artifacts/results skimmed, not read line-by-line:** retained JSON result trees, manifests, scoring bundles, prompt/result Markdown, and generated reports. I inspected the representative F.19/Path E/Path F scoring artifacts, manifests, measurement-related history, and the actual 14,477-line artifact inventory enough to corroborate storage and telemetry behavior.
- **Executed, without using Docker or a model:**
  - `python -m bench.lib.test_mcnemar` — all six standalone checks passed (the test file uses its own runner, not `unittest`).
  - `bash ops/test_supervisor.sh` — **21 passed, 0 failed**. This is an offline stubbed-unit test; it does not exercise Docker, a real GPU, or the `up`/readiness path.

Line ranges below refer to the pinned checkout.

---

## 1. `bench/`: harnesses, data, and measurement quality

### What exists

| Harness / utility | Definition of a cell/run | Stored result and metrics | Assessment |
|---|---|---|---|
| `bench/f19pre/bench_f19pre.py` | Eight named cells × three disk prompts; one warm-up then default three calls per cell/prompt (`:1-30`, `:75-145`). | One JSON per cell/prompt, `latency_min/med/max`; only the **last** generated response is retained. | Repeats measure latency only. Candidate quality remains one stochastic sample. |
| `bench/f19pre/pack_results.py` | Packs latest retained outputs into a manual judging packet (`:1-106`). | Markdown comparison rubric; human scores are separate Markdown. | Useful qualitative workflow, not a statistical benchmark. The observed raw manifest coverage is also incomplete relative to the packed report, so preservation is not audit-grade. |
| `bench/pathE_qwen36_27b/bench_pathE.py` | Named model/backend cells × prompt files; warm-up + default `--runs 3` (`:32-58`, `:175-281`). | Per-cell JSON and min/median/max latency. | Same quality-repetition defect: only final output is retained. |
| `bench/pathE_qwen36_27b/build_scoring_bundle.py` | Collects results by `(cell, task)`. | Manual rubric/gold blank scoring tables (`:54-176`). | It selects the newest JSON per key across run dirs, so a bundle can silently mix configs/runs instead of representing one immutable experiment. |
| `bench/pathF_instrumented/bench_pathF.py` | Path E-style warm-up + three calls. | Above plus NVML averages/maxima; JSON and manifest (`:1-24`, `:184-244`, `:316-328`). | Stronger performance/thermal observability, but still no quality replication, seed control, gates, or variance estimate. |
| `bench/_common/nvml_sampler.py` | Background GPU-0 sample loop at 0.5 s. | GPU utilization, VRAM used/total, temperature, and power; average/max (`:1-36`, `:96-210`). | Good reusable telemetry primitive. It fails open as a no-op when NVML is unavailable and does not enforce a thermal/cold-start gate. |
| `bench/pathF_swebench/bench_pathF_swebench.py` (Path A) | One direct-vLLM diff attempt per SWE task; smoke-30, smoke-100, or full set (`:62-149`, `:163-353`, `:794-831`). | One task JSON plus manifest, progress, summary, optional pair comparison (`:649-791`, `:873-974`). | The most mature measurement path, but its pass@1 is still a single stochastic attempt per task. |
| `bench/pathF_swebench/bench_pathB.py` (Path B) | One BFF → agent-server → vLLM trajectory per SWE task. | Run/task state, reconstructed patch, tool count, wall time, NVML, evaluator result. | Valuable system-vs-direct comparison; not repeat-aware and inherits Docker evaluator requirements. |
| `bench/pathF_swebench/compare_tokens.py` | Joins Path A/B task records. | Tokens, wall time, tools, resolved deltas and aggregate Markdown/JSON (`:45-238`, `:244-347`). | Good cost-attribution idea, but it fails to exclude `summary.json`/`progress.json`, so it can manufacture spurious pseudo-task rows; it also treats a zero token value as missing when calculating delta (`:48-57`, `:171-175`). |

### Cell/run semantics and result persistence

1. The early harnesses correctly distinguish **warm-up** from measured latency trials, but never preserve all generated outputs. F.19 stores `final_out` from the final scored call, and Path E/F do the same. Therefore no reviewer can calculate candidate output variance, judge stability, or audit an individual bad/good draw after the fact. The three calls are not three quality observations. (`bench/f19pre/bench_f19pre.py:75-145`; `bench/pathE_qwen36_27b/bench_pathE.py:175-229`; `bench/pathF_instrumented/bench_pathF.py:184-244`.)
2. There is no fixed sampling seed in the model calls; Path A SWE uses `temperature=0.7` and has no candidate-run replicate axis. A manifest records task IDs and some run context, but not enough to replay exactly: missing dataset revision, full sampling profile, server/runtime/image/driver/hardware identity, prompt hash, and checked-out repository hash. (`bench/pathF_swebench/bench_pathF_swebench.py:140-149`, `:873-917`.)
3. The Path F sampler provides measured GPU averages/maxima, not a safety controller. Existing bundles show the value of this data, but the harness never aborts at a temperature/VRAM threshold or demands a cold card before starting.
4. The Path E launcher checks that GPU use is not high, then waits ten seconds rather than failing closed. It is a convenient bench helper, not a safe shared-GPU scheduler. (`bench/pathE_qwen36_27b/vllm_launch.sh:42-55`, `:182-198`.)

### SWE-bench integration: what it measures and what it assumes

**Path A is a constrained code-editing measurement, not a full autonomous-agent or frontend measurement.** It clones the task repository, uses the ground-truth patch to select the exact relevant pre-patch files, asks the model for a unified diff, normalizes that diff, then calls the official evaluator. (`bench/pathF_swebench/bench_pathF_swebench.py:503-564`, `bench/pathF_swebench/oracle_prompt.py:1-89`, `bench/pathF_swebench/apply_and_test.py:74-247`, `:298-437`.) This is defensible as an *oracle-retrieval code-editing* metric, but it deliberately removes retrieval and workspace-navigation difficulty. It cannot validate OH-GUI’s UI/agent workflow.

- Evaluation is logically good: the official SWE-bench harness uses the Verified `test` split, one worker, a 1,800-s per-instance timeout, stores prediction JSONL, harness stdout/stderr, and reports. (`apply_and_test.py:298-437`.)
- Evaluation is operationally blocked today: it relies on SWE-bench Docker images and may pull them. Path A also clones repositories from GitHub, and its loader fetches `princeton-nlp/SWE-bench_Verified` from Hugging Face without pinning a dataset revision. (`bench_pathF_swebench.py:503-524`; `apply_and_test.py:396-405`; `load_verified.py:23-33`.) This conflicts with the no-cloud / currently-no-containers boundary.
- The smoke-30 originated from one earlier full-500 outcome run, stratified by repository/outcome. The smoke-100 extension candidly preserves the old prefix because its exact provenance cannot be reproduced, and warns that 30-vs-70 rate differences are not meaningful. This honesty is good; the sample should nonetheless be frozen as a versioned manifest with a dataset hash before comparative claims. (`bench_pathF_swebench.py:163-353`; `scripts/generate_smoke_100.py:7-58`, `:227-289`.)
- Path A summaries capture resolved/unknown/error/context-skip/truncation, pass@1, task wall-time, and GPU average/max. The `gpu_seconds_total` implementation probes keys the sampler does not emit and normally falls back to wall-time while labelling it as a GPU-inference source; do not treat it as measured GPU-seconds. (`bench_pathF_swebench.py:699-791`; `bench/_common/nvml_sampler.py:96-210`.)
- The reported USD-per-solve metric is an optional assumed `--usd-per-gpu-hour` rate, not a measured Colossus cost. Keep transparent energy/time data; do not import the cloud-cost framing for OH-GUI. (`bench_pathF_swebench.py:827-831`.)
- Diff repair in `apply_and_test.py` is a valid operational robustness layer but changes the evaluated system. If retained, apply it equally to every candidate and report it as part of the pipeline. (`apply_and_test.py:74-247`.)

### Repetitions, variance, and the McNemar addition

`bench/lib/mcnemar.py` is a genuine, tested implementation of paired McNemar comparison: mid-p exact under 25 discordant pairs and continuity-corrected chi-square otherwise. It computes the 2×2 table, effect-size percentage points, p-value, and an interpretation. (`bench/lib/mcnemar.py:45-131`, `:167-221`.) The standalone test covers no-discordance, symmetric cases, all-favorable flips, a literature-style 22-discordant case, method cutoff, and the intended “one flip on 30” scenario; all six pass. (`bench/lib/test_mcnemar.py:22-169`.)

**What it solves:**
- It is better than comparing two independent aggregate pass rates because the same SWE instances form matched pairs. It emphasizes changed tasks (`b+c`) rather than hiding them in large concordant pass/fail totals.
- It will detect a material directional change on a harder, sufficiently large paired task set, assuming the paired task coverage is complete and outcomes actually differ.

**What it does *not* solve for OH-GUI’s n=1 ceiling problem:**
- It introduces **no repetitions**, no deterministic seed capture, no CI, and no continuous/partial-credit metric. A single generation per task is still sampled from a stochastic model at `temperature=0.7`.
- It remains binary terminal pass/fail. If all candidates saturate on easy UI tasks, it yields “no discordant pairs; test not applicable,” not discrimination.
- It silently drops a task missing from either run and merely lists it afterward; an OOM/error that selectively removes difficult tasks can bias the paired analysis. (`mcnemar.py:134-155`, `:167-176`, `:224-254`.) Treat incomplete pairing as **inconclusive/invalid** unless a predeclared missingness policy says otherwise.
- It excludes error records from the pairing map. Its own `pass_at_1` denominator is only completed boolean outcomes, while other Path A summary accounting includes errors; this needs a single predeclared failure policy.

**Recommended OH-GUI measurement design:** retain a complete immutable trial record for every `candidate × difficult task × replicate`, including seed/sampling/runtime/UI build hashes, all event traces, screenshots, and continuous score components. Use a task-level **weighted partial score** (e.g., invariant/UI-state assertions, diff correctness, tool/approval-policy behavior, time-to-terminal) plus latency/energy; compute paired bootstrap confidence intervals or a paired permutation test on per-task aggregate score. Use McNemar only as the secondary test for a predeclared binary success outcome, and cluster/aggregate replicates per task before testing so repeated trajectories are not falsely treated as independent.

### Bench PORT verdicts

| Item | Verdict | Reason |
|---|---|---|
| NVML sampler (`bench/_common/nvml_sampler.py`) | **port-early** | Useful, small, local telemetry primitive. Integrate it with OH-GUI’s existing 80 C warn / 83 C stop / 45 C cold-start policy; change missing NVML from no-op to explicit unsupported/fail-closed for GPU benches. |
| Immutable per-trial manifest/result design from SWE Path A | **port-early** | Per-task JSON, progress, and manifest are the right direction. Expand metadata and preserve every replicate/output rather than final-only. |
| McNemar core (`bench/lib/mcnemar.py`) | **port-later** | Technically sound and tested, but only after OH-GUI has harder paired tasks, replicate storage, a missing-data policy, and a non-saturated primary score. Do not represent it as a remedy for n=1. |
| F.19/Path E/F three-run latency harness | **leave** | It has the exact quality-replication blind spot OH-GUI needs to avoid. Borrow no control flow without redesign. |
| Manual scoring bundles | **port-later** | Can support human review of retained trajectories, but only with immutable run IDs and explicit independent scoring protocol. Current latest-file mixing is unsafe. |
| SWE Path A oracle-edit evaluator | **port-later** | Valuable code-editing benchmark lane, but oracle retrieval does not test OH-GUI’s intended UI/agent behavior; it also needs local dataset/repo/image mirrors and container availability. |
| SWE Path B full-stack evaluator | **leave (for now)** | Useful Forge-OH diagnosis but tightly coupled to its BFF/agent APIs and Docker evaluation. Reconsider only when OH-GUI owns equivalent agents and containers are available. |
| `compare_tokens.py` | **port-later** | Keep the direct-vs-full-stack attribution concept; fix control-file filtering and zero-token handling first. |
| `generate_smoke_100.py` sampling recipe | **leave** | It carries unrecovered sample provenance and outcome-derived strata. Establish a new, versioned OH-GUI difficulty set instead. |

---

## 2. `ops/`: vLLM supervisor, launchers, GPU discipline, systemd

### Supervisor

`ops/vllm_supervisor.sh` implements the appropriate **single-GPU role-exclusivity idea**: coder on 8501 and planner on 8511 cannot coexist, so `up/ensure` stops both roles as required, stops Ollama, waits for a free-VRAM floor, launches, and polls `/v1/models`. (`ops/vllm_supervisor.sh:1-66`, `:270-347`.) This matches Colossus’s 32-GB practical constraint better than allowing competing resident model servers.

Good practices worth retaining:

1. A **measured free-VRAM precondition** of 28,000 MiB before a 0.90-utilization vLLM start, rather than relying on launch failure. (`vllm_supervisor.sh:40-66`, `:144-171`.)
2. Stop both system-scope and user-scope Ollama, then inspect actual GPU memory; the latter is the authoritative condition. (`:106-142`.)
3. Bounded VRAM and readiness polling with process diagnostics on timeout. (`:144-171`, `:232-265`.)
4. Explicit state/status semantics for coder/planner/none/both. (`:216-230`, `:355-367`.)
5. Offline shell tests with PATH-injected command stubs. The suite covers GPU free-memory reporting/wait/timeout, skipping/stopping Ollama in both service scopes, and `check`; it passed 21/21 locally. (`ops/test_supervisor.sh:1-458`.)

Safety/operability defects to fix before adapting it:

- **Fail-open on absent `nvidia-smi`:** `_free_gpu_for_vllm` logs a warning and proceeds, and `check` exits success with `SKIP`. A GPU workload manager should fail closed, especially beside OH-GUI’s thermal policy. (`vllm_supervisor.sh:144-171`, `:294-329`.)
- **No temperature or cold-start gate:** it controls VRAM only. It must call a monitor before launch and throughout a run, honoring OH-GUI max 83 C, warn 80 C, and cold-start 45 C.
- **No mutex:** two concurrent `ensure` callers can interleave stop/start steps and violate the single-role invariant. Add `flock`/one lockfile around all state-changing commands.
- **Broad process killing:** `_stop_role` uses `fuser -k PORT/tcp`, which can kill a non-Forge process if the port is repurposed. Kill only a verified owned PID/container. (`:185-214`.) The older `scripts/vllm_stop.sh` is worse: global `pkill -9` expressions can terminate unrelated vLLM/EngineCore/resource-tracker jobs. (`scripts/vllm_stop.sh:14-45`.)
- **Readiness is shallow:** it checks only that response JSON contains a nonempty `data` array, not the expected served model or container ownership. (`vllm_supervisor.sh:174-183`.)
- **Failure cleanup is incomplete:** a readiness timeout returns error but does not remove the just-started container; the next attempt must clean it.
- The stub test suite does not exercise `cmd_up`, switching roles, real launch failure cleanup, locking, or expected-model readiness. Its comment references `SUPERVISOR_TEST_MODE`, but the supervisor does not consume that variable; library mode actually relies on `source`. (`ops/test_supervisor.sh:8-11`; `ops/vllm_supervisor.sh:372-375`.)

### Launchers

Both `ops/vllm_launch_coder.sh` and `ops/vllm_launch_planner.sh` run Docker, mount local models read-only, use the Blackwell compatibility environment, force HF offline mode, set 0.90 GPU utilization, 65,536 context, FP8 KV cache, prefix caching, and chunked prefill. (`vllm_launch_coder.sh:51-99`; `vllm_launch_planner.sh:51-108`.) The code comments correctly call the planner’s estimated 65k headroom tight. (`vllm_launch_planner.sh:32-39`.)

Important concerns:

- Both use `vllm/vllm-openai:latest` despite calling it “pinned”; this is not reproducible. Pin image digest and record it in a manifest. (`vllm_launch_coder.sh:39-55`; `vllm_launch_planner.sh:41-58`.)
- `-p "${PORT}:8000"` publishes to all interfaces by Docker default. For a single-user local system use `-p "127.0.0.1:${PORT}:8000"`. (`vllm_launch_coder.sh:73-82`; `vllm_launch_planner.sh:77-87`.)
- Both claim VRAM math at concurrency 1 but configure `--max-num-seqs 128`. If the client permits concurrent requests, that mismatch is a safety/reliability risk. (`vllm_launch_coder.sh:24-26`, `:82-84`; `vllm_launch_planner.sh:32-39`, `:87-89`.) Enforce the actual permitted concurrency in the router/launcher, or benchmark and reserve for the configured limit.
- Neither launcher performs its own VRAM/temperature preflight; they depend on the supervisor being used.

### Systemd and SearXNG

- `ops/systemd/forge-oh-selfeval.service` is a user-scoped, on-demand `Type=oneshot` runner with a 2-h aggregate timeout, journald output, and modest process protections. (`:1-61`.) The pattern is portable only later. It hardcodes `~/dev/forge-oh`, assumes a `forge-oh-bff.service` unit that is not in the requested tree, and writes into source-tree docs. Do not port its workload or dependency name unchanged.
- `ops/compose/searxng.yml` is commendably loopback-bound and digest-pinned, with dropped capabilities and log rotation. (`ops/compose/searxng.yml:1-43`.) It is nonetheless Docker-dependent and not needed for OH-GUI frontend verification; leave it while containers are unavailable.

### Ops PORT verdicts

| Item | Verdict | Reason |
|---|---|---|
| vLLM single-role supervisor *design* | **port-later** | The VRAM/Ollama discipline is valuable, but only after adding flock, model identity check, ownership-safe teardown, fail-closed telemetry, and OH-GUI thermal gates. |
| `ops/vllm_supervisor.sh` as-is | **leave** | Docker-coupled and unsafe fail-open / broad-kill behavior. |
| Offline supervisor test pattern | **port-later** | Worth adapting after a safer native/local implementation exists; expand it to test locks, transitions, cleanup, and thermal failures. |
| Coder/planner launcher flag bundle | **port-later** | Blackwell/FP8/prefix/chunked-prefill experience is useful, but current image and Docker topology conflict with the present boundary. |
| Systemd self-eval unit | **port-later** | User unit/timeout/journald pattern is good; self-eval workload and hard-coded Forge dependencies are not. |
| SearXNG compose | **leave** | Docker unavailable; unrelated to current OH-GUI benchmark/front-end needs. |

---

## 3. `scripts/`: operations, Playwright drivers, and drift checks

### Operational tooling

**Best reusable pattern: host-process local stack management.** `forge-up.sh` runs agent-server, BFF, and Next on the host, binds backend services to `127.0.0.1`, writes PID/log files, checks port readiness, and shares a trajectory DB path. (`scripts/forge-up.sh:1-110`, `:112-195`.) This is aligned with local-first OH-GUI better than a control-plane container.

Supporting scripts provide useful concepts:

- `forge-status.sh` cross-checks listener, pidfile, process liveness, and parent/child relationship instead of trusting only a port. (`scripts/forge-status.sh:1-131`.)
- `forge-doctor.sh` is read-only and composes git/venv/service probes, HTTP timings, workspace/preset visibility, logs, and drift information. (`scripts/forge-doctor.sh:1-259`.)
- `forge-test.sh` gives a sensible ordered quality gate and invokes real Playwright only when BFF is present. (`scripts/forge-test.sh:1-139`.)
- `forge-down.sh`/`forge-restart.sh` repair orphaned dev children but use broad name/port kill fallbacks. (`scripts/forge-down.sh:40-96`; `scripts/forge-restart.sh:52-100`.) Do not copy destructive fallbacks into OH-GUI unchanged.

The old `vllm_*`/`vllm-coder-*` scripts are historical incident probes/remediation for mismatched 8000/8500/8501 topology. They contain useful diagnostic questions, but hard-code `~/dev/forge-oh`, host paths, ports, model names, direct `.env` writes, and in some cases destructive restart behavior. Examples: `vllm-coder-fix-env.sh:8-140`, `vllm_start.sh:21-55`, `vllm_stop.sh:14-45`, `start-host-services.sh:1-85`. **Leave these scripts; extract only ideas into a future OH-GUI doctor.**

The stage verification scripts are strong examples of explicit, self-cleaning acceptance probes (especially worktree isolation and crash/resume), but are tightly coupled to Forge-OH BFF/OpenHands/SQLite/API contracts. `test-crash-resume.sh` is careful about a throwaway port/database and `SIGKILL` persistence check. (`scripts/test-crash-resume.sh:1-222`.) The Stage 6 scripts use actual source worktrees and clean generated runs, though a few use fixed `/tmp` filenames and would race under parallel invocation. (`scripts/stage-6.4b-verify.sh:103-210`; `scripts/stage-6.4c-verify.sh:45-58`.)

### Playwright e2e assessment

**`scripts/e2e-run.ts` is the strongest port candidate.** It launches a real browser, instruments console/page/request failures, records API response previews and WebSocket frames, walks `/runs → New Run → submit → detail`, polls terminal state, captures screenshots, queries events/files/diff, saves a report JSON and timeline HTML, and exits nonzero on unexpected failure. (`scripts/e2e-run.ts:1-132`, `:134-291`, `:328-331`.) It is correctly an end-to-end diagnostic, not merely an API test.

Cautions before reuse:

- Selectors are heuristic and brittle: the submit button uses a broad regex and `.last()`, and the created run is selected by “newest of five” through a direct BFF request rather than correlating to the submit response. Parallel or pre-existing runs can produce a false match. (`e2e-run.ts:141-172`.) Give OH-GUI stable `data-testid` locators and capture a run identifier from the creation request/response.
- It reports a terminal status even if the polling deadline expires; it does not explicitly fail for non-terminal timeout. Add `if (!TERMINAL.has(status)) throw ...`. (`:180-196`.)
- It saves truncated network/WebSocket payloads. Good for diagnostics, but redact task content/secrets before artifact persistence in OH-GUI.
- It does not use Playwright Test fixtures, assertions, traces, video, or automatic service lifecycle. Convert its instrumentation into a formal test helper/spec rather than copying it as a one-off CLI diagnostic.

Other drivers:

- `debug-frontend.ts` is a compact read-only browser/network/screenshot diagnostic and a useful development aid. (`scripts/debug-frontend.ts:1-131`.)
- `e2e-approval.ts` is a good API-plus-UI acceptance test for approval transitions, but it hard-codes BFF data (`ap-1`, `ws-1`) and asserts a checkbox only in the third leg. (`scripts/e2e-approval.ts:1-87`.)
- `e2e-stage6.ts` correctly checks user-visible workspace semantics plus the server-side working directory; it is a model for testing visible UI and actual backend effect. (`scripts/e2e-stage6.ts:1-100`.)
- `e2e-stage7.ts` has broad endpoint coverage, but it is mostly HTTP integration, not Playwright, and creates/deletes MCP/secrets/plugins/run state. It is a destructive verifier; do not run it casually against user data. (`scripts/e2e-stage7.ts:1-202`.)
- `check-approval-checkbox.ts` is a quick selector probe only, not a durable test. (`scripts/check-approval-checkbox.ts:1-22`.)

### Pre-commit drift check

`pre_commit_drift_check.sh` is a simple, correct implementation of its narrow contract: block a commit if `git ls-files --others --exclude-standard` returns untracked, non-ignored paths. (`scripts/pre_commit_drift_check.sh:1-47`.) It is fast and local; it makes no network call and does not impose GitHub-native CI.

But it measures **untracked-file drift only**. It does not catch tracked-but-modified files, ignored configuration drift, generated artifacts intentionally excluded from Git, submodule state, or remote divergence. It can be bypassed with `--no-verify`, which is acceptable only if policy permits it. Port it only if OH-GUI adopts the exact “no unmanaged local files” policy; otherwise it will create friction for screenshots, local databases, benchmark artifacts, and developer scratch outputs. `forge-doctor.sh` reuses the same narrow check and also adds an optional unpushed-commits warning, which is not appropriate as a hard requirement under the stated no-GitHub-native-CI constraint. (`scripts/forge-doctor.sh:235-256`.)

### Scripts PORT verdicts

| Item | Verdict | Reason |
|---|---|---|
| `forge-up.sh` host-local lifecycle pattern | **port-later** | Local bindings, pid/log ownership, readiness, and common DB path are good. Adapt only after inspecting OH-GUI’s existing lifecycle; remove legacy Docker cleanup and avoid unconditional kill -9. |
| `forge-status.sh` | **port-early** | Good, read-only local observability pattern; parameterize service names/ports and retain PID-to-listener verification. |
| `forge-doctor.sh` | **port-later** | Excellent shape, but references Forge-specific BFF/selfeval/vLLM and a GitHub parity policy. Build a thin OH-GUI doctor from its principles. |
| `forge-test.sh` quality-gate wrapper | **port-later** | Playwright gating is relevant, but toolchain and service assumptions are Forge-specific. |
| `e2e-run.ts` instrumentation/reporting | **port-early** | Best direct fit for OH-GUI’s mandatory Playwright checks, after making selectors/request correlation deterministic and adding explicit timeout failure/redaction. |
| `debug-frontend.ts` | **port-early** | Useful local Playwright diagnostic companion; retain only sanitized artifact capture. |
| `e2e-approval.ts`, `e2e-stage6.ts` | **port-later** | Good acceptance-test patterns; their state fixtures and routes are Forge-specific. |
| `e2e-stage7.ts` | **leave** | Destructive broad API verifier, almost no browser behavior coverage, tightly coupled to Forge-specific MCP/plugins/secrets. |
| Stage worktree/crash-resume probes | **port-later** | Excellent explicit DoD/cleanup style if OH-GUI gains equivalent worktree/ledger contracts; not portable code. |
| Legacy `vllm_*` and coder repair/probe scripts | **leave** | Historical hard-coded topology, model, and destructive process management. |
| `pre_commit_drift_check.sh` | **port-later** | Small and local but policy-dependent; revise scope/allowlist first. |
| `forge-screenshots.sh` | **leave** | It deletes screenshots, checks out/creates a branch, commits, and pushes to GitHub (`:18-45`), directly conflicting with no GitHub-native workflow. |

---

## GPU-safety practices to adopt now

1. Keep OH-GUI’s existing gates as the authority: **do not launch above 45 C cold-start threshold; warn at 80 C; terminate/abort at 83 C**. Add continuous NVML sampling to every model/bench trial, with temperature, VRAM, power, and utilization persisted beside results.
2. Before loading a large model, stop only an explicitly owned competing inference service and require measured free VRAM. Do **not** use global `pkill` or `fuser -k` as a normal control plane.
3. Require a process-wide lock for GPU role switches and benchmark launches. All launch/stop/status transitions must be serialized.
4. Fail closed when `nvidia-smi`/NVML cannot verify the GPU; emit an actionable diagnostic rather than proceeding.
5. Pin runtime image/version, model artifact hash, driver/CUDA/vLLM version, model flags, and max active sequences in the run manifest. Never call an image `latest` “pinned.”
6. Enforce the tested concurrency limit. A configuration measured at one sequence must not advertise or accept 128 concurrent sequences without a separate safety benchmark.
7. On a readiness or thermal failure, stop the just-started owned process/container and record the failed state; do not leave VRAM occupied for the next run.

## Docker/topology blockers (containers presently unavailable)

Do not attempt to port or execute these paths until the container condition changes:

- **Bench:** `bench/pathE_qwen36_27b/vllm_launch.sh`; Docker-backed SWE evaluator in `bench/pathF_swebench/apply_and_test.py:396-405`; Path A’s GitHub clone / Hugging Face dataset loader also requires an explicitly prepared local cache/mirror.
- **Ops:** both `ops/vllm_launch_*.sh`; `ops/vllm_supervisor.sh` container lifecycle; `ops/compose/searxng.yml`.
- **Scripts:** `start-host-services.sh` references Docker/vLLM topology; all legacy vLLM container inspection/remediation scripts; `forge-up.sh`/`forge-down.sh` merely include legacy-container cleanup and are otherwise host-process-oriented.

**Bottom line:** adopt the NVML/manifest/Playwright diagnostic *ideas* early, but do not port Forge-OH’s current benchmark harness wholesale. Its performance repetition and McNemar addition improve observability and paired binary comparison, yet they do not address OH-GUI’s core discrimination gap: replicated difficult trajectories with an unsaturated, continuous or partial-credit primary metric.
