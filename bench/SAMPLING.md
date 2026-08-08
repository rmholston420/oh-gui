# Canonical sampling parameters - Qwen3.6 / Qwen3-Coder

Source of truth: [Qwen/Qwen3.6-27B model card](https://huggingface.co/Qwen/Qwen3.6-27B).
Do not use Qwen3-era presets for Qwen3.6 - they differ.

## qwen3.6:27b (planner / thinker)

| Mode | temp | top_p | top_k | min_p | presence_penalty | repetition_penalty |
|---|---:|---:|---:|---:|---:|---:|
| Thinking, general | 1.0 | 0.95 | 20 | 0.0 | **0.0** | 1.0 |
| Thinking, precise coding | 0.6 | 0.95 | 20 | 0.0 | **0.0** | 1.0 |
| Instruct / non-thinking | 0.7 | 0.80 | 20 | 0.0 | **1.5** | 1.0 |

**Ollama's baked defaults for this model are a mix of two different modes**
(`temperature 1, top_p 0.95, top_k 20` from thinking mode, but `presence_penalty 1.5`
from non-thinking mode). That combination appears in no official recommendation.
Always send sampling parameters explicitly; never inherit the model's defaults.

Other card facts that affect OH-GUI:

- Qwen3.6 runs in **thinking mode by default** and does **not** support the Qwen3
  `/think` and `/nothink` soft switches. Disable via
  `chat_template_kwargs: {enable_thinking: false}` (vLLM/SGLang). The Ollama `think`
  field must be verified empirically against this model - do not assume it works.
- `preserve_thinking: true` retains reasoning traces from historical messages. The card
  states this improves decision consistency, reduces redundant reasoning, and improves
  KV-cache utilization in agent scenarios. Directly relevant to the OH-GUI agent loop -
  evaluate it during the bench, not after.
- Native context 262,144; extendable to ~1,010,000. The card advises keeping context at
  **>=128K to preserve thinking capability**, which is why the VRAM sweep exists.

## qwen3-coder:30b (coder)

Per the Qwen3-Coder card: `temperature 0.7, top_p 0.8, top_k 20, min_p 0.0,
repetition_penalty 1.05`. No thinking mode.

## Rules

- Sampling is per-role, never per-model-family shorthand.
- Never use greedy decoding on a thinking model - Qwen warns it causes endless repetition.
- Strip `<think>...</think>` before scoring any output.
