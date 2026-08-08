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
that option. Never allow it to load at the Ollama default.

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
> `nomic-embed-text` (137M, 768 dims, ~62–64 MTEB) considered and **rejected**:
> Qwen3-Embedding-0.6B scores ~70.7 MTEB-eng-v2, and on CPU the weight-size advantage is
> irrelevant against 124 GB of RAM. 110 ms does not justify trading ~7 MTEB points.
> Dimensionality also differs (1024 vs 768), making it a vector-store schema change.

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

## Lock-in phase

Phase 0. Re-measure if the GPU, driver, Ollama version, or model tags change.

## References

- `bench/vram_sweep.sh`, `bench/validate_config.sh`, `bench/SAMPLING.md`
- Raw data: `~/.oh-gui/vram_sweep/20260808_0336_f16*.csv`
- [Qwen3.6-27B model card](https://huggingface.co/Qwen/Qwen3.6-27B) — ≥128K guidance
- [ollama#8921](https://github.com/ollama/ollama/issues/8921) — KV cache type ignored
- [ADR-001](ADR-001-integration-boundary.md), [ADR-003](ADR-003-single-operator-remove-household.md)
