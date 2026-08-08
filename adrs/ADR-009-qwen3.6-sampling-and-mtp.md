# ADR-009 — Qwen3.6 sampling parameters and the MTP asymmetry

**Status:** Proposed — verdict PENDING the Phase 0 matrix
**Lock-in phase:** Phase 0 close / router configuration
**Supersedes:** —

## Context

Researched 2026-08-08 while the 2x8 baseline matrix was running. Nothing here was changed
mid-matrix: the run in flight remains a valid *as-configured-today* baseline, and this ADR is the
input to what we change afterwards.

**Verified on Colossus (not inferred):**

Both profiles are byte-identical except `model`, and **neither sets any sampling parameter** —
no `temperature`, `top_p`, `top_k`, `min_p`, or penalty field. The OpenHands SDK defaults
`temperature`/`top_p` to `None`, meaning provider defaults, so Ollama's baked-in Modelfile values
govern every request.

`ollama show --parameters`:

| | qwen3.6:27b | qwen3.6:35b-a3b-mtp-q4_K_M |
|---|---|---|
| temperature | 1 | 1 |
| top_p | 0.95 | 0.95 |
| top_k | 20 | 20 |
| min_p | 0 | 0 |
| presence_penalty | 1.5 | 1.5 |
| repeat_penalty | 1 | 1 |
| **draft_num_predict** | **absent** | **4** |

## Findings

**1. We are running coding tasks on the general-reasoning preset.**
`temperature 1 / presence_penalty 1.5` is Qwen3.6's *thinking-mode general* preset. For coding,
Qwen officially recommends `temperature=0.6, top_p=0.95, top_k=20, min_p=0.0,
presence_penalty=0.0, repetition_penalty=1.0`. We are 0.4 hotter than recommended with a presence
penalty of 1.5 where Qwen says 0.0, and the model card warns a higher presence_penalty "may
occasionally result in language mixing and a slight decrease in model performance."

The 27B and 35B cards *disagree* on thinking-general presence_penalty (0.0 vs 1.5). They agree on
the coding preset, which is the one that applies to us.

**2. The speed axis of the matrix is asymmetric.** The 35b is the MTP variant; the 27b is not
(`draft_num_predict` absent from the daemon's view, confirming it, not just the tag name). MTP is
~1.4-2.2x faster generation with no accuracy change. `qwen3.6:27b-mtp-q4_K_M` (18 GB) exists in
the library. **Any tok/s comparison from this matrix understates the 27b and must be reported with
that caveat attached, in the same breath, or not reported at all.**

**3. Context is below Qwen's stated floor.** We run `num_ctx 65536`; Qwen advises "at least 128K
tokens to preserve thinking capabilities." At 28 GB resident on a 32 GB card 128K is unreachable
without KV quantization (`OLLAMA_KV_CACHE_TYPE=q8_0` + flash attention ~halves KV).

**4. Unverified, claimed by nobody yet.** The profiles set `reasoning_effort: "high"` and
`extended_thinking_budget: 200000`, which are Anthropic/OpenAI-shaped fields. With
`drop_params: true`, litellm may discard them before the request reaches Ollama. **Whether these
do anything at all on `ollama_chat/` is unknown and must be measured, not assumed.**

## Decision (proposed, not yet ratified)

1. Report the Phase 0 matrix as-configured, with the MTP asymmetry stated wherever tok/s appears.
2. After the matrix, run a **sampling A/B on the winning model only**: baked default
   (`temp 1 / pp 1.5`) vs Qwen coding preset (`temp 0.6 / pp 0.0`), same 8 tasks. Sampling is set
   in the profile JSON so it is version-controlled, not in a Modelfile.
3. Pull `qwen3.6:27b-mtp-q4_K_M` and re-run the 27b block only, to size the MTP effect against a
   measured non-MTP baseline we already own.
4. Determine empirically whether `reasoning_effort` reaches Ollama; drop it from the profiles if
   it does not.
5. Defer the 128K context question until KV quantization is measured — it changes VRAM for every
   cell and must not be entangled with the sampling A/B.

## Consequences

Each item is a separate run. None may be combined: changing sampling and MTP together makes both
unmeasurable. Files touched: `~/.openhands/profiles/*.json`, `bench/baseline/run_matrix.sh`,
ADR-008 verdict.

## References

- [Qwen3.6-27B-GGUF card](https://huggingface.co/unsloth/Qwen3.6-27B-GGUF)
- [Qwen3.6-35B-A3B-MTP-GGUF card](https://huggingface.co/unsloth/Qwen3.6-35B-A3B-MTP-GGUF)
- [Unsloth Qwen3.6 docs (MTP speedup)](https://unsloth.ai/docs/models/qwen3.6)
- [Ollama qwen3.6 tags](https://ollama.com/library/qwen3.6/tags)
- [Ollama qwen3.6:27b params blob](https://ollama.com/library/qwen3.6:27b/blobs/276ffc6327ae)
- [OpenHands SDK LLM config defaults](https://deepwiki.com/OpenHands/software-agent-sdk/4.1-llm-interface-and-configuration)
- [Ollama K/V cache quantization](https://smcleod.net/2024/12/bringing-k/v-context-quantisation-to-ollama/)
- ADR-008 (Phase 0 baseline method)
