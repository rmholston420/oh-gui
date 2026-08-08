# Known Issues — OH-GUI

Append-only. Each entry: symptom, scope, status, and the condition that closes it.

## 2026-08-08 08:15 EDT — `bench/prompts/arch.txt` states a retracted desktop-VRAM figure

**Symptom:** the prompt tells the model "Desktop idle consumes 650-850 MiB of VRAM and will
rise by 2-3 GB once a browser and the OH-GUI frontend are running." The 2–3 GB rise is
**not supported by measurement.** Idle VRAM recorded immediately before load, with the
operator's normal desktop and browser running: 657 MiB (`20260808_0531`), 666 MiB
(`20260808_0545`), 675 MiB (`20260808_0738`). ADR-004 A#6 retracts the ~3,500 MiB figure.

**Scope:** `bench/prompts/arch.txt`, `bench/gold/arch.md` (corrected in place), Path E
rounds 1 and 2 `arch` scoring.

**Impact on results: none.** All cells in a round receive the identical prompt, so the
premise error is common-mode and relative ranking is unaffected. ADR-005's planner verdict
stands.

**Deliberately NOT fixed:** editing the prompt would break comparability with rounds 1 and 2,
whose scores are already recorded. 

**Closes when:** a round 3 `arch` prompt is authored with the measured figure, at which point
round 3 scores must not be compared directly against rounds 1–2 without noting the change.

## 2026-08-08 08:15 EDT — 262,144 context remains unmeasured

**Symptom:** no cell has ever run at 262,144. A#5 declared it unusable from the retracted
3,500 MiB figure; A#6 retracted that reasoning without re-ratifying the context.

**Status:** working ceiling stays **131,072** because that is the value Path E actually
exercised — not because 262,144 was shown to fail.

**Closes when:** a cell runs at 262,144 with the desktop under interactive load and idle
VRAM recorded at start and peak.

## 2026-08-08 08:15 EDT — power sampled at 450 W against a 435 W cap

**Symptom:** run `20260808_0738` reported `power max 450W` with 102 power-capped samples;
`20260808_0705` peaked at 437 W. LACT cap is 435 W (`/etc/lact/config.yaml`).

**Hypothesis, not established:** telemetry sampling above the enforcement averaging window
rather than a genuine cap breach. No causal claim enters an artifact until executed.

**Impact:** none observed. 0 thermally throttled samples in both runs; peak temp 72 C.

**Closes when:** a sampling run at fixed load compares `nvidia-smi` instantaneous power
against the LACT enforcement window, or the cap is confirmed to be advisory for transients.

## 2026-08-08 08:40 EDT — ADR-004 A#2 vs A#7 embedder discrepancy: input length RULED OUT, still open

`bench/oneoff/embed_query_latency.sh` was written to test whether the ~12x gap between A#2's
13.7 chunks/s (73 ms/chunk) and A#7's 1.09 chunks/s (915 ms/chunk) was simply a difference in
input size. **It is not.**

Measured on CPU, `qwen3-embedding:4b`, 9 reps per length:

| tokens | median | ms/tok |
|---:|---:|---:|
| 8 | 160.3 ms | 20.04 |
| 16 | 149.8 ms | 9.36 |
| 32 | 154.4 ms | 4.82 |
| 64 | 150.6 ms | 2.35 |
| 128 | 155.5 ms | 1.21 |
| 256 | 160.7 ms | 0.63 |

Wall time is **flat across a 32x range of input length** — 149.8 to 160.7 ms, a 1.0x ratio where
~12x would have been needed to explain the gap. Single-embed cost on CPU is essentially pure
fixed overhead; per-token work is invisible below 256 tokens.

**Consequences.**
- The A#2/A#7 discrepancy **stays OPEN** and now has one fewer available explanation. Candidate
  remaining causes: different batching, different `num_ctx`, chunk count vs chunk size
  confusion in one of the two measurements, or one figure being amortised indexing throughput
  while the other is single-call latency. Not yet investigated.
- **A separate result is settled, and favourably:** query-band latency (16-64 tokens) is
  **150.6 ms** median. Not user-visible for interactive retrieval. **ADR-004 A#2 (embedder on
  CPU) and A#7 (iGPU rejected) both stand**, and the flatness means the 2560-dim native output
  costs nothing measurable at query time.
- The 512-token row is invalid — at/over the 512 `num_ctx` the input was truncated. The operator
  intended `NUM_CTX=2048` but set it as a separate shell statement, so it never reached the
  script. Re-run as `NUM_CTX=2048 bash bench/oneoff/embed_query_latency.sh` on one line if the
  long-input tail matters; it does not affect the query-band verdict.
- Thermally irrelevant: peak 39 C, 34 W, 0 samples under load.

## 2026-08-08 08:52 EDT — `MAX_LOADED_MODELS=2` eviction order is unmeasured

**Status: OPEN, probe written and unrun.**

`OLLAMA_MAX_LOADED_MODELS=2` is intended to mean "one GPU role model plus the CPU-resident
embedder", enforcing ADR-004's never-co-resident invariant at the server. **Which model the
scheduler evicts when the limit is exceeded has never been measured.**

With `{qwen3-embedding:4b, qwen3.6:27b}` resident and the coder then loaded:

- If it evicts the **planner** → `=2` is a correct backstop.
- If it evicts the **embedder** → both role models go resident. At 131,072 that is
  26,140 + 26,390 = **52,530 MiB against a 32,607 MiB card**, and `=2` provides no protection at
  all; only the router's explicit `ollama stop` does.

Run `bash bench/oneoff/max_loaded_lru_probe.sh`. It changes no configuration and restarts nothing.

**Related and settled:** `=1` is NOT the fix. A CPU-placed model occupies a model slot (measured,
BUILD_LOG 2026-08-08 05:50 EDT), so `=1` would thrash the embedder on every role switch. ADR-005
Amendment #4 retracts that change.
