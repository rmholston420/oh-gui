# SESSION HANDOFF — OH-GUI

**Overwritten each session. Current state only. Last updated 2026-08-08 08:20 EDT.**

## Current stage

**Phase 0, exit gate.** ADR-005 is **Ratified** — the last *bench* blocker on Phase 0 exit is
cleared. No further Path E runs are required for Phase 0.

## Completed this session

- **ADR-005 Ratified.** Planner `qwen3.6:27b` @131,072 `planner` preset; coder
  `qwen3.6:35b-a3b-mtp-q4_K_M` @131,072 `precise` preset. Roles do **not** collapse.
- **Round 2 coder cells** (`20260808_0705`) scored: c10 99, c11 92, c09 81, c08 78. 60/100
  machine-scored by executing 30 unittest cases. Both code-marketed models placed last.
- **Round 2 planner replicates** (`20260808_0738`) scored: medians c12 **72**, c13 **66**.
  Decisive sub-metric: gold-decision agreement **3/3 vs 1/3**.
- **ADR-004 Amendment #8** — closes A#3's reopened planner question.
- **Embedder question closed** (A#7): iGPU 3.31× slower than CPU; A#2 stands (CPU, 4b, 2560).
- **Harness fixes:** bash `local` + `set -u` bug; fake 39× iGPU win caught by my own device
  assertion (Vulkan loader ignores `CUDA_VISIBLE_DEVICES`, pinned via `VK_DRIVER_FILES`);
  cold gate raised to a self-checking 45 C preset; `validate_harness.py` now 41 assertions.
- **Two corrections filed against my own prior work:** the c12/c13 start-temperature caveat
  (the 45 C gate was not yet in effect on that run), and `bench/gold/arch.md`'s retracted
  ~3,500 MiB desktop premise.

## Remaining before Phase 0 exit — none are bench work

1. Upstream artifact pins (agent-server digest, pip/npm versions) — ADR-001,
   `docs/specs/02-repo-setup.md` item 1.
2. Read-only stock Agent Canvas reference checkout — `docs/specs/03-layout.md` §3.0.1.
3. First-run wizard stating the default trust-dial stop `ConfirmRisky()` in-UI —
   `docs/specs/03-layout.md` §3.4.

## Open questions awaiting the operator

1. **Apply `OLLAMA_MAX_LOADED_MODELS` 2 → 1?** Required by ADR-005. Must change
   `bench/lib/ollama_env.sh` **and** `ollama_guard`'s expected value in the same commit, or
   every subsequent preflight fails. Not done unilaterally — it edits the live systemd user
   unit.
2. **Run the pre-registered c13 `precise`-preset test?** `REPS=3` of c13 `arch` at temp 0.6.
   If it reaches Option C 3/3 with a median above 75, the planner slot **reopens** and
   single-model routing (zero swap cost, 2× decode) becomes decisive. Filed in ADR-005 so the
   result cannot be fitted after the fact.
3. **`NUM_CTX=2048 bash bench/oneoff/embed_query_latency.sh`** was requested two turns ago and
   its output was never received. Still unrun. Pre-registered bands: <250 ms → A#2/A#7 stand;
   250–500 ms borderline; >500 ms → reopen embedder placement.

## Exact next action

Nothing is blocked on me. Pick one of the three open questions above. If the intent is to
proceed to Phase 0 exit, the next substantive work is item 1 of "Remaining" — upstream
artifact pins — which needs the operator to confirm which agent-server digest to pin.

## Do not repeat

- `git pull` before any run — the user's clone was last known to be at `49a70c0`; `main` is
  several commits ahead.
- Do not quote `bench/gold/arch.md`'s VRAM table without its correction block. Option A is
  **not** "arithmetically dead"; it has ~3.8 GB headroom at 131,072 against the measured
  desktop.
- Do not quote ADR-004 A#2's absolute embedder throughput (13.7 chunks/s). A#7 measured 1.09
  chunks/s by a different method; the ~12× discrepancy is unresolved. A#2's *ranking* stands.
- Only GPU **core** temp is real on this card. Hotspot duplicates core, VRAM temp is N/A, fan
  tach reads 0% while spinning. Fan recommendation: no change.
- `power max 450W` against the 435 W cap is logged in `KNOWN_ISSUES.md` as an unexplained
  anomaly, not a confirmed breach. 0 thermally throttled samples.
