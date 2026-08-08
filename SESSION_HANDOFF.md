# SESSION HANDOFF

**Updated:** 2026-08-08 03:45 EDT

## Current stage

Phase 0 - baseline metrics. ADR-001, ADR-003, ADR-004 Ratified. ADR-002 Superseded.
Spec at v4.3. No application code written yet (both `apps/gui` and
`services/middleware` are contract READMEs only) - this is intentional.

## Completed this session

- ADR-003: single-operator deployment; household/multi-user removed from 14 spec files,
  `15-household-profiles.md` archived, safety plane (04, 04a) retained in full.
- LICENSE (MIT) + NOTICE added.
- Model set fixed: `qwen3.6:27b` (planner) + `qwen3-coder:30b` (coder).
  `qwen3:32b` dropped as superseded.
- `bench/SAMPLING.md`: official Qwen3.6 sampling params recorded. Ollama's baked defaults
  are a mix of two modes and match no official recommendation - do not use them.
- ADR-004: VRAM/context envelope measured and ratified. See BUILD_LOG for the numbers.

## Decided envelope

| Role | Model | Context | VRAM |
|---|---|---:|---:|
| Planner | `qwen3.6:27b` | 131072 | 26113 MiB |
| Coder | `qwen3-coder:30b` | 65536 | 25167 MiB |
| Embedding | `qwen3-embedding:0.6b` | **512 (pinned)** | 1502 MiB (CPU placement under eval) |

Server env: `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=f16`,
`OLLAMA_GPU_OVERHEAD=1073741824`. q8_0 KV is a confirmed no-op on Ollama's new engine.

## Exact next action

```bash
cd ~/dev/oh-gui && git pull
bash bench/ollama_env.sh f16
bash bench/embed_cpu_vs_gpu.sh   # decides embedder placement first
bash bench/validate_config.sh    # then validates the resulting config
```

Confirms planner@128K and coder@64K each fit co-resident with the embedding model at
`num_ctx 512`, and measures role-switch latency (the router's cost model depends on it).

## Open questions awaiting answer

1. **Security analyzer VRAM.** No room for a third resident model. Reuse the resident
   agent model / CPU-resident small model / omit the LLM analyzer from the ensemble?
   Deferred to the analyzer slice (ADR-004 §5).
2. **Quality bench not yet run.** `local-llm-bench` protocol requires Perplexity gold
   answers generated FIRST, prompts on disk under `bench/prompts/`, `<think>` stripped
   before scoring. `bench/prompts/` does not exist yet.

## Remaining before Phase 0 exit

- [ ] `validate_config.sh` co-residency + switch-cost results
- [ ] Quality bench vs Perplexity gold standard
- [ ] Upstream artifact pins: `ghcr.io/openhands/agent-server` digest, pip package
      versions, `@openhands/typescript-client` version (alpha - API may change without
      notice)
- [ ] Read-only stock Agent Canvas reference checkout
- [ ] First-run wizard stating default trust-dial stop `ConfirmRisky()` in-UI
