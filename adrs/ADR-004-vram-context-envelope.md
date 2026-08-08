# ADR-004 — VRAM and Context Envelope on Colossus

**Status:** Ratified
**Lock-in phase:** Phase 0
**Supersedes:** —

## Context

Colossus has one RTX 5090 reporting **32,607 MiB**, shared between the KDE desktop, an
embedding model, and the agent LLM. Phase 0 requires a baseline metrics report, which
requires knowing what actually fits.

Measured 2026-08-08 with `bench/vram_sweep.sh` across two clean runs
(idle baseline 653 and 614 MiB). Ollama reports the processor split, so "fits" means
`100% GPU` — any CPU spill disqualifies the cell.

### Measured: context sweep, f16 KV

| Model | 32K | 64K | 128K | 256K |
|---|---|---|---|---|
| `qwen3.6:27b` | 20,007 ✅ | 22,130 ✅ | **26,113 ✅** | 31,618 ❌ 86% CPU |
| `qwen3-coder:30b` | 22,020 ✅ | **25,167 ✅** | 31,106 ❌ 97% CPU | — |

Derived KV cost per token: `qwen3.6:27b` ≈ **74.6 KB**, `qwen3-coder:30b` ≈ **110 KB**.
The MoE coder costs ~1.5× more KV per token than the larger dense planner — the opposite
of the pre-measurement assumption, which was wrong.

### Measured: embedding model footprint

| `num_ctx` | Ollama size | Cost above idle |
|---:|---:|---:|
| 512 | 1.0 GB | **1,502 MiB** |
| 2,048 | 2.1 GB | 2,561 MiB |
| 8,192 | 2.9 GB | 3,268 MiB |
| 32,768 (default) | 5.8 GB | 6,041 MiB |

A 639 MB model costs 6.0 GB at Ollama's default context. Context allocation, not weights,
dominates: ~112 KB/token for a 0.6B model with no GQA benefit at this size.

### Measured: q8_0 KV cache quantization is a no-op

With `OLLAMA_KV_CACHE_TYPE=q8_0` and `OLLAMA_FLASH_ATTENTION=1` confirmed present in the
service environment via `systemctl show`, every sweep cell returned **byte-identical**
sizes to the f16 run (18/20/25/35 GB and 21/25/32 GB, within ±20 MiB of measurement
noise). The setting is accepted and silently ignored.

Cause: Ollama's new Go inference engine does not implement KV-cache quantization, and the
env var is ignored for models running on it rather than erroring
([ollama#8921](https://github.com/ollama/ollama/issues/8921), corroborated by
[community reports](https://www.reddit.com/r/LocalLLaMA/comments/1kzjhfd/ollama_090_supports_ability_to_enable_or_disable/)).
`qwen3.6` (arch `qwen35`) is a new architecture served by that engine.

## Decision

**1. Context ceilings under Ollama are fixed at:**

| Role | Model | Max context | Rationale |
|---|---|---:|---|
| Planner / thinker | `qwen3.6:27b` | **131,072** | Meets Qwen's ≥128K guidance for preserving thinking capability |
| Coder | `qwen3-coder:30b` | **65,536** | 128K spills to 97% CPU; no headroom exists to recover it |

**2. The embedding model is pinned to `num_ctx 512`** and always loaded explicitly with
that option. Never allow it to load at the Ollama default. Model: **`qwen3-embedding:4b`**
on CPU at native 2560 dims (see Amendment #2; supersedes the initial 0.6b selection).

> **STATUS AMENDMENT (2026-08-08) — RATIFIED:** The embedder runs on **CPU**
> (`num_gpu: 0`), model `qwen3-embedding:0.6b` retained, `num_ctx 512`.
>
> Measured on Colossus (24 threads, 124 GB RAM), two runs:
>
> | Placement | Single chunk | 64-chunk batch | VRAM cost |
> |---|---:|---:|---:|
> | GPU | 91–93 ms | 211–216 chunks/s | 1,511–1,540 MiB |
> | CPU | 110–118 ms | 39–42 chunks/s | **16–28 MiB** |
>
> Query-time embedding is single-chunk, so the user-visible cost is **+25 ms**. Batch
> ingest drops 5×, but 39 chunks/s indexes a 10,000-chunk corpus in ~4 minutes — a
> one-time cost paid off the interactive path.
>
> Justification is correctness before VRAM: CPU placement makes the embedder **immune to
> the Ollama scheduler eviction** observed with `qwen3-coder:30b` @65536, where the
> embedder was silently dropped from GPU with no error. Retrieval no longer depends on the
> estimator guessing right.
>
> `nomic-embed-text` (137M, 768 dims) considered and **rejected**: on CPU the weight-size
> advantage is irrelevant against 124 GB of RAM, and dimensionality differs (1024 vs 768),
> making it a vector-store schema change rather than a swap.
>
> **Correction (2026-08-08):** an earlier draft of this ADR cited a "~7 MTEB point" gap by
> comparing Qwen3-0.6B on MTEB-eng-v2 against nomic on MTEB English v1. Those are
> different tracks and the figure was not apples-to-apples. The direction of the result is
> well supported, the magnitude was not. Authoritative same-track figures are now recorded
> in the model-size amendment below.

> **STATUS AMENDMENT #2 (2026-08-08) — embedder upgraded to `qwen3-embedding:4b`:**
> Measured CPU latency at `num_ctx 512` (24 threads):
>
> | Model | dims | single | chunks/s | Retrieval (MTEB-multi) |
> |---|---:|---:|---:|---:|
> | 0.6b | 1024 | 110 ms | 41.3 | 64.64 |
> | **4b** | **2560** | **161 ms** | **13.7** | **69.60** |
> | 8b | 4096 | 212 ms | 7.9 | 70.88 |
>
> Applying the pre-registered decision rule (<150 ms free; 150–400 ms acceptable for a
> ≥3-point retrieval gain; >400 ms reject): **4b passes** (161 ms for +4.96 points over
> 0.6b). **8b fails** — it costs another 51 ms for only +1.28 over 4b.
>
> Stored at **native 2560 dims**. MRL truncation is confirmed working through Ollama's
> `dimensions` parameter (4b and 8b both returned exactly 1024 when asked), so 1024-dim
> storage is available as a fallback — but truncation degrades quality below the measured
> 69.60, and at single-user scale the larger vectors are not a real cost.
>

> **STATUS AMENDMENT #7 (2026-08-08) — iGPU placement tested and REJECTED; A#2 stands:**
> The operator raised the iGPU (Ryzen 9 7900X, RDNA2 Raphael) as possibly better than CPU for
> the embedder. Tested as a one-off outside the Path E matrix
> (`bench/oneoff/embed_igpu_ab.sh`), 64 chunks of ~140 tokens, `qwen3-embedding:4b`, both arms
> with the 5090 excluded:
>
> | Arm | Device (from server log) | Median wall | Chunks/s | Tok/s |
> |---|---|---:|---:|---:|
> | **CPU** | `id=cpu library=cpu` | **58.58s** | 1.09 | 178 |
> | iGPU | `Vulkan1 ... RADV RAPHAEL_MENDOCINO type=iGPU` | 193.97s | 0.33 | 53.7 |
>
> **The iGPU is 3.31x slower.** Well outside the 1.10x band that would have justified a second
> serving instance, so **Amendment #2 is unchanged: the embedder stays on CPU.** Reps 1 and 2
> were 193.97s and 193.98s; rep 3 was interrupted and is not needed at that spread. The
> pre-registered prediction (CPU wins, written into the script header before running) held.
>
> Mechanism: the iGPU is a 2-CU part reporting `compute=0.0`, sharing the same DDR5 as 12 Zen 4
> cores with AVX-512. It has no memory-bandwidth advantage and far less compute.
>
> First attempt was **invalid** and its own assertion caught it: `CUDA_VISIBLE_DEVICES=""` does
> not hide an NVIDIA card from the Vulkan loader, so the "iGPU" arm ran 37/37 layers on the
> 5090 and reported a 39x win. Pinning now uses `VK_DRIVER_FILES` to the RADV ICD. See
> DEBUG_LOG 2026-08-08 07:22 EDT.
>
> **Incidental, not part of this decision:** the same accident measured the 5090 at ~6,849
> tok/s via Vulkan versus ~178 on CPU. A#2's VRAM isolation therefore costs roughly **39x**
> embedder throughput. That is a real trade worth revisiting if retrieval latency ever becomes
> the bottleneck; it does not change the decision now, because the reason for CPU placement is
> immunity to eviction, not speed.
>
> **Open discrepancy, flagged not resolved:** A#2 recorded 13.7 chunks/s for 4b at `num_ctx
> 512`, but this run measured 1.09 chunks/s on the same model and hardware — a ~12x gap. The
> two used different chunk sizes and different request shapes, so they are not directly
> comparable, and A#2's figure was a per-call latency extrapolation while this one is
> end-to-end wall time over 64 sequential calls. The decision rule in A#2 compared models
> against each other under one method, so its ranking is unaffected. Anyone quoting an
> absolute embedder throughput number should use **this** measurement, not A#2's.
>
> Ingest: 13.7 chunks/s indexes 10,000 chunks in ~12 minutes, one-time and off-path.

**3. KV-cache quantization is abandoned on Ollama.** Server env stays
`OLLAMA_KV_CACHE_TYPE=f16` so the configuration does not misrepresent itself.
`OLLAMA_FLASH_ATTENTION=1` and `OLLAMA_GPU_OVERHEAD=1073741824` (1 GiB display reserve)
are retained.

**4. The planner and coder are never co-resident.** Combined they need ~41 GB. The
middleware model router **must explicitly `ollama stop` the outgoing model on every role
switch**, because this host runs `OLLAMA_KEEP_ALIVE=-1` and models never auto-unload.
Role-switch latency is a first-class cost in the router design, not an implementation
detail.

**5. The LLM-based security analyzer does not get a dedicated resident GPU model.** No
VRAM exists for a third concurrent GPU model. With CPU inference now demonstrated viable
(0.6B at ~110 ms), a **CPU-resident analyzer is the leading option** and must be measured
at its own parameter count before adoption. Fallbacks: reuse the resident agent model, or
run Pattern + PolicyRail only and omit the LLM analyzer.

**6. If the coder needs 128K, that requires leaving Ollama.** vLLM supports
`--kv-cache-dtype fp8`, which would bring the coder's 128K cache from ~11 GB to ~6 GB.
Recorded as a contingency, not adopted. Trigger: coder tasks demonstrably failing from
context truncation at 64K.

## Rationale

The ceilings are measured, not modeled, on the actual device with the actual runtime.
Every earlier estimate in this project was wrong in at least one direction — desktop
overhead was overestimated (665 MiB vs 1.0–1.5 GB assumed), embedding footprint was
underestimated by ~8×, and the dense-vs-MoE KV ratio was inverted. Measurement supersedes
all of it.

Pinning the embedding model to 512 tokens recovers 4.5 GB, which is what makes the
planner's 128K configuration viable alongside it. Retrieval chunks are 512–1024 tokens;
32K of embedding context serves no purpose here.

Abandoning q8_0 rather than leaving it configured avoids a config that claims a saving it
does not deliver — a future session reading the unit file would otherwise plan against
memory that was never freed.

## Consequences

- `docs/specs/02-repo-setup.md` and `11-dev-plan.md`: Phase 0 baseline metrics run is
  bounded by these ceilings.
- Middleware model router (`services/middleware`) acquires a hard requirement: explicit
  unload before load on role switch, with switch latency surfaced in telemetry
  (`08-telemetry.md`).
- The security-analyzer ensemble design is constrained; the LLM analyzer is not free.
- `bench/validate_config.sh` added to verify co-residency and measure switch cost.
- Desktop growth risk: 653 MiB is an idle KDE baseline. Running a browser and the OH-GUI
  frontend on the same GPU will consume 2–3 GB. The 1 GiB `OLLAMA_GPU_OVERHEAD` reserve
  partially covers this; the planner's 128K config has ~6.4 GB free before the embedding
  model, so the margin is real but not generous.

> **STATUS AMENDMENT #6 (2026-08-08) — Amendment #5's desktop figure was WRONG:**
> A#5 below rests on the claim that the operator's working desktop consumes ~3,500 MiB of
> VRAM. **Measurement contradicts it.** Both Path E runs recorded idle VRAM immediately
> before loading, with the operator's normal working desktop and browser running:
>
> | Run | Idle VRAM with desktop + browser up |
> |---|---:|
> | `20260808_0531` | **657 MiB** |
> | `20260808_0545` | **666 MiB** |
>
> That is within ~10 MiB of the 650–850 MiB "idle desktop" figure A#5 dismissed as
> unrepresentative. The ~3,500 MiB number is unsourced and is now retracted.
>
> Consequence: **A#5's conclusion is not supported.** It found `35b-a3b-mtp` @262,144 to
> overrun the card by 261 MiB — a margin computed entirely from the bad 3,500 MiB figure.
> Recomputed against 666 MiB, that configuration fits with ~2.5 GB to spare.
>
> **This does NOT re-ratify 262,144.** It means the question is reopened, not resolved: no
> cell has ever run at that context, and the operator uses the desktop interactively during
> benches, so headroom must survive a browser that grows under load. The honest status is
> *unmeasured*. 131,072 remains the working ceiling because it is the value actually
> exercised by the Path E matrix — that is now the reason, replacing A#5's arithmetic.
>
> Method note, and the second time this exact error has appeared today: A#5 corrected a
> measurement with an assumption. The original envelope was measured; the 3,500 MiB desktop
> was assumed. Substituting the latter for the former felt like rigour and was the
> opposite. Desktop VRAM is now recorded at the top of every Path E run so this figure is
> never guessed again.

> **STATUS AMENDMENT #5 (2026-08-08) — 262,144 context is UNUSABLE in production:**
> The envelope in Amendment #4 was measured against an **idle desktop** (650–850 MiB of
> VRAM in use). The operator's actual working desktop consumes ~3,500 MiB. Re-checked
> against that number, the largest context does not fit:
>
> | Model @ context | Model MiB | + desktop 3,500 | vs 32,607 total | Verdict |
> |---|---:|---:|---:|---|
> | `35b-a3b-mtp-q4_K_M` @262,144 | 29,368 | 32,868 | **261 MiB OVER** | ✗ unusable |
> | `35b-a3b-mtp-q4_K_M` @131,072 | 26,390 | 29,890 | 2,717 free | ✓ |
> | `qwen3.6:27b` @131,072 | 26,140 | 29,640 | 2,967 free | ✓ |
>
> Consequence: **the planner's real production ceiling is 131,072, not 262,144.** This
> still satisfies the Qwen3.6 card's ≥128K guidance for preserving thinking capability,
> so no capability is lost — but the "full 256K with 2,743 MiB free" claim in Amendment
> #4 is true only on a bare desktop and must not be quoted as a production figure.
>
> No harness change is required: no Path E cell was ever planned at 262,144.
>
> Method note: an envelope measured under conditions the system will never actually run
> in is not an envelope. Future sweeps must record concurrent desktop VRAM alongside the
> model figure, not subtract it away.

> **STATUS AMENDMENT #4 (2026-08-08) — envelope CLOSED, all five candidates measured:**
>
> | Model | Params | Max 100%-GPU ctx | MiB at max | KV KB/token |
> |---|---|---:|---:|---:|
> | `qwen3.6:27b` | 27B dense | 131,072 | 26,140 | 74.6 |
> | `qwen3.6:35b` | 35B A3B MoE | **262,144** | 29,698 | 21.8 |
> | **`qwen3.6:35b-a3b-mtp-q4_K_M`** | 35B A3B + MTP | **262,144** | **29,368** | 23.3 |
> | `qwen3-coder:30b` | 30B A3B MoE | 65,536 | 25,194 | 110 |
> | Devstral-Small-2507 UD-Q4_K_XL | 24B dense | 65,536 | 26,160 | **152** |
>
> Three independent sweep runs (0357, 0410, 0420) agree within ~130 MiB.
>
> KV cost per token spans **7×** across these five models and does not track parameter
> count, MoE topology, or file size. It is set by attention configuration alone. Any future
> capacity claim must be measured, not inferred — this ADR now contains one falsified
> prediction (Amendment #3) as a standing reminder.
>
> Devstral is the most KV-expensive model tested despite being the smallest (13.6 GB
> weights + 878 MB vision projector). It spills at 131,072 and is therefore capped at
> 65,536 — the same ceiling as the incumbent coder, so the coder comparison is
> context-matched at 65,536 with no handicap to either side.

> **STATUS AMENDMENT #3 (2026-08-08) — planner selection REOPENED:**
> `qwen3.6:35b` (= `35b-a3b`, digest `07d35212591f`, MoE ~3B active) was predicted in
> BUILD_LOG to fit only at 32K and to spill at 64K. **That prediction was wrong.**
> Measured:
>
> | ctx | 27b (dense) | 35b-a3b (MoE) |
> |---:|---:|---:|
> | 32,768 | 20,083 | 25,114 |
> | 65,536 | 22,187 | 25,798 |
> | 131,072 | 26,178 | 27,063 |
> | 262,144 | **SPILLED** 86% CPU | **25,864 — 100% GPU** |
>
> Derived KV cost per token: 27b **74.6 KB**, qwen3-coder:30b **110 KB**,
> qwen3.6:35b **21.8 KB**. The prediction assumed 35b would resemble the other A3B MoE
> (`qwen3-coder:30b`); instead it is ~3.4× cheaper per token than the dense 27b. MoE
> topology does not predict KV cost — attention configuration does. The earlier reasoning
> was an unfounded generalisation from a single analogous model.
>
> Consequence: `qwen3.6:35b` reaches the **full 256K** context with 2,743 MiB free, and at
> 131,072 costs only 885 MiB more than the 27b. With ~3B active params it should also
> generate faster than the dense 27b. It therefore dominates the 27b on capacity and
> likely on speed; only reasoning quality per token remains open.
>
> The operator froze the candidate list to 27b + qwen3-coder:30b *before* this data
> existed, on the basis of the incorrect prediction. Decision #1 below is left standing
> pending the operator's call on whether to reopen the planner comparison.

## Lock-in phase

Phase 0. Re-measure if the GPU, driver, Ollama version, or model tags change.

## References

- `bench/vram_sweep.sh`, `bench/validate_config.sh`, `bench/SAMPLING.md`
- Raw data: `~/.oh-gui/vram_sweep/20260808_0336_f16*.csv`
- [Qwen3.6-27B model card](https://huggingface.co/Qwen/Qwen3.6-27B) — ≥128K guidance
- [ollama#8921](https://github.com/ollama/ollama/issues/8921) — KV cache type ignored
- [ADR-001](ADR-001-integration-boundary.md), [ADR-003](ADR-003-single-operator-remove-household.md)
