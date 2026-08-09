<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.
Source: Forge-OH research phase, supplied verbatim by the operator on 2026-08-09 00:45 EDT.
Filed unmodified. Amendments belong in docs/specs/ and in ADRs, never here.

OPERATOR CAVEAT recorded at filing time (2026-08-09 00:45 EDT), applies to all three donor specs:
"the problem with Forge-OH that forced me to start over with OH-GUI is that you went off the rails
and didn't use the actual contracts OpenHands provides, you ended up making your own stuff up."

Read these documents as INTENT, not as contract. Every OpenHands extension surface named below
(Skills, Plugins, Hooks, hooks.json, PreToolUse/PostToolUse/Stop/SessionStart/SessionEnd, setup.sh,
Plugin.load(), .installed.json, MCP declaration) is a CLAIM SOURCED FROM DOCUMENTATION AND THIRD-PARTY
ARTICLES, not from the SDK source. None of it may enter docs/specs/ or apps/gui/ until verified
against the extracted openhands-sdk / openhands-tools / openhands-agent-server / openhands-workspace
artifacts at the pinned version, per ADR-015 (native fidelity: SDK source beats SDK docs).
-->

# Advanced OpenHands Optimization: Best Local LLM + Inference Engine for RTX 5090 (32GB VRAM)

## Bottom Line

For an RTX 5090 with 32GB VRAM in August 2026, the optimal local stack is **Qwen3-Coder-Next (80B total / 3B active MoE)** served by **SGLang** for agentic/multi-turn OpenHands workloads, with **vLLM** as the pragmatic default when broad model compatibility matters more than shared-prefix speed — wired into OpenHands via its native **Skills/Plugins/Hooks architecture** rather than any custom code.

## Model Selection: Why Qwen3-Coder-Next Wins for 32GB

The single most important 2026 development for local coding agents is Qwen3-Coder-Next: an 80-billion-parameter MoE model that activates only 3 billion parameters per token, explicitly trained via reinforcement learning on 800,000 executable coding tasks for long-horizon agentic work — multi-file edits, tool calling, and recovery from execution failures. It scores 70.6% on SWE-Bench Verified, 44.3% on SWE-Bench Pro, and 36.2% on Terminal-Bench 2.0, "achieving performance comparable to models with 10–20x more active parameters". Because only 3B parameters activate per forward pass, decode throughput on a single RTX 5090 will be dramatically faster than a 32B dense model at similar quality, while the 80B total footprint (roughly 45–50GB at Q4, or well under 32GB at more aggressive Q3/Q2 quantization, or split with CPU offload for the inactive experts) is far more tractable on consumer hardware than dense 70B+ alternatives. Its native 256K context window comfortably covers OpenHands' long tool-call histories without truncation tricks.[^1][^2][^3][^4]

| Model | Total / Active Params | SWE-Bench Verified | Fits 32GB? | Best role |
|---|---|---|---|---|
| Qwen3-Coder-Next | 80B / 3B (MoE) | 70.6%[^4] | Yes, at Q3–Q4 with expert offload | Primary daily driver — fastest, most agent-tuned |
| Qwen3-Coder-30B-A3B | 30B / 3B (MoE) | ~65% class[^5] | Yes, comfortably at Q6–Q8 | Lighter/faster fallback, higher quant quality |
| Qwen3-Coder 32B (dense) | 32B / 32B | Strong dense baseline[^6] | Yes, Q4–Q6 | Maximum single-pass reasoning depth when MoE routing underperforms |
| GLM-4.6 / GLM-4.6-Air | 355B / 32B (MoE) | 72.8% (GLM-5 family)[^7] | No — Air still needs ~70GB+ at Q4; full model needs 178–214GB[^8][^9] | Out of reach on a single 5090; reference only |
| MiniMax M2.5 | — | 75.8% (leads open field)[^7] | Check VRAM before committing — verify quant footprint | Aspirational upgrade path if VRAM allows |

Open-weight models still trail the very best closed frontier models on raw SWE-Bench Verified (MiniMax M2.5 75.8%, GLM-5 72.8%, Kimi K2.5 70.8%, DeepSeek V3.2 70.0% versus higher closed scores), but Qwen3-Coder-Next's efficiency-per-active-parameter makes it the standout choice specifically for a single-GPU 32GB budget rather than a multi-GPU server. GLM-4.6 and its Air variant, despite strong benchmark scores, are architecturally mismatched to your hardware — even the "Air" variant requires 64GB+ system RAM plus GPU offload tricks to run at all, and the full model needs 178–715GB of VRAM depending on precision.[^7][^8][^10][^4][^11]

## Inference Engine: SGLang vs vLLM — The Real Trade-off

The 2026 benchmark literature is unusually consistent on one point: **the "best" engine depends entirely on prefix-sharing patterns in your workload, not on raw peak throughput** — and OpenHands' agent loop is a textbook shared-prefix workload.

| Dimension | vLLM | SGLang | Verdict for OpenHands |
|---|---|---|---|
| Unique single-shot prompts | Competitive, sometimes faster (60 vs 52.7 tok/s in some tests)[^12] | Within 2–5% of vLLM[^13] | Roughly a tie |
| Shared-prefix / multi-turn agent loops (OpenHands' exact pattern) | Baseline | 10–40% higher throughput, up to 6.4x on heavy prefix reuse via RadixAttention[^12][^14][^13] | **SGLang wins decisively** |
| Time-to-first-token (TTFT) at concurrency | 118–142ms p50 | 89–98ms p50 (SGLang caches the shared system-prompt/tool-schema prefix)[^13] | SGLang wins — matters for interactive agent responsiveness |
| Model support breadth / new-model day-one support | Broadest, fastest to support new releases[^15][^16] | Narrower but covers all mainstream MoE architectures including Qwen3-Coder family | vLLM safer if swapping models often |
| MoE-specific optimization (expert parallelism, high-concurrency MoE) | Very good | Best — "wins on high-concurrency MoE workloads"[^16] | SGLang favored given Qwen3-Coder-Next's MoE design |
| Operational maturity/ecosystem | Largest community, most tutorials, default in most agent docs (incl. OpenHands' own examples)[^17] | Smaller but rapidly maturing | vLLM easier day-one setup |

Given that OpenHands repeatedly re-sends a large, mostly-static system prompt plus growing tool-call history on every single LLM call within a session — the canonical shared-prefix pattern — **SGLang's RadixAttention is architecturally the better match**, and its MoE-specific scheduling optimizations compound that advantage specifically for Qwen3-Coder-Next. The practical recommendation from multiple 2026 comparisons is consistent: "move to SGLang for large MoE or high-concurrency structured generation," reserving vLLM as the safer universal default only when model-swapping flexibility outweighs throughput. TensorRT-LLM, while fastest in raw compiled-engine benchmarks (15–25% above vLLM), is excluded here — its 20–30 minute compile step and NVIDIA-only rigidity conflict with your stated goal of minimizing engineering overhead.[^18][^15][^13][^16]

## Architecting OpenHands Improvements Without Writing New Code

Rather than modifying OpenHands' core, the highest-leverage improvements come from its own extension surfaces, which map cleanly onto hexagonal/ports-and-adapters thinking and vertical-slice delivery without touching the agent's core domain logic.

- **Skills (formerly Microagents)** — project-specific knowledge and workflow definitions stored in `.openhands/`, functioning as a "ports" layer that injects domain context into the agent's prompt without code changes.[^19]
- **Plugins** — bundle skills, hooks, MCP servers, sub-agents, and slash commands into installable, versioned packages (`Plugin.load()`, `.installed.json` metadata, enable/disable lifecycle), giving you a clean adapter boundary for swapping capabilities per project — directly analogous to vertical slices, since each plugin is a self-contained feature slice.[^20]
- **Hooks** — event handlers (`.openhands/hooks.json`) that fire at tool-call lifecycle points, ideal for enforcing quality gates (lint-before-finish, blocking dangerous shell commands, structured logging) as a Viable-Systems-Model-style regulatory/monitoring subsystem wrapped around the autonomous "operational" agent loop, without forking the agent.[^19]
- **MCP server configuration** — plugins can declare external Model Context Protocol tool servers, letting you compose best-in-class OSS tools (search, browser automation, static analyzers) as external bounded contexts rather than embedding them in the agent core.[^20]
- **setup.sh** — per-repo bootstrap script run automatically at session start, the natural place for dependency installation and environment configuration, keeping infrastructure concerns out of the agent's reasoning loop entirely.[^19]

This plugin/hook/skill trio effectively gives you hexagonal architecture "for free": the OpenHands core is the domain/application hexagon, and skills, plugins, hooks, and MCP servers are all pluggable adapters at its boundary — meaning your "improvements" to OpenHands should almost entirely take the form of well-designed plugins and hook scripts rather than any fork of the underlying SDK.

## Recommended Architecture

```
┌───────────────────────────────────────────────────┐
│  RTX 5090 (32GB VRAM)                              │
│  SGLang server (RadixAttention, OpenAI-compat API) │
│    - Qwen3-Coder-Next (80B/3B MoE) — primary       │
│    - Qwen3-Coder-30B-A3B — lightweight fallback    │
└───────────────────────────────────────────────────┘
                     │ OpenAI-compatible HTTP
                     ▼
┌───────────────────────────────────────────────────┐
│  OpenHands Agent Server (Docker)                   │
│    Core: plan-act-observe loop  ← domain hexagon   │
│    Adapters (your customization surface):          │
│      • .openhands/skills/   (domain knowledge)      │
│      • .openhands/plugins/  (feature slices)        │
│      • .openhands/hooks.json (quality gates, VSM)   │
│      • MCP servers          (external tool bounded  │
│                               contexts)              │
└───────────────────────────────────────────────────┘
```

## Practical Rollout Steps

- Install SGLang and launch `python -m sglang.launch_server --model-path Qwen/Qwen3-Coder-Next --context-length 131072` (start at 131K rather than the full 256K to conserve VRAM headroom for KV cache).[^1]
- Point OpenHands at the SGLang OpenAI-compatible endpoint via `LLM_BASE_URL` and `LLM_MODEL`, exactly as documented for other local-LLM backends.[^21]
- Quantize Qwen3-Coder-Next to Q4_K_M or lower via GGUF/AWQ if the full weights exceed available VRAM headroom alongside KV cache; validate quality loss against your own tasks with the `OpenHands/benchmarks` harness before committing.[^3][^22]
- Build 2–3 targeted plugins (e.g., a "quality-gate" plugin bundling lint/test hooks, a "research" plugin adding MCP-based search/browsing) instead of modifying agent internals — this is the vertical-slice-friendly path to "improving" OpenHands.[^20][^19]
- Keep Qwen3-Coder-30B-A3B loaded as a secondary, faster model for trivial edits, since its smaller total footprint frees VRAM for higher-precision quantization and larger batch/context sizes.[^5]
- Re-benchmark SGLang vs vLLM on your own repo-specific traffic once the plugin stack is in place — the shared-prefix advantage of SGLang scales with how much static context (skills, tool schemas) your plugins inject per call.[^13]

---

## References

1. [Qwen3 Coder Next · Benchmarks, Pricing & Performance](https://benchgecko.ai/model/qwen3-coder-next)
2. [Qwen3 Coder Next - API, Specs, Playground & Pricing - Puter Developer](https://developer.puter.com/ai/qwen/qwen3-coder-next/)
3. [[2603.00729] Qwen3-Coder-Next Technical Report](https://arxiv.org/abs/2603.00729)
4. [Hands On Guide: Putting...](https://binaryverseai.com/qwen3-coder-review/)
5. [Qwen3 Coder: Agentic Coding Assistant in the World](https://qwen3lm.com/qwen-coder/)
6. [Qwen 3.6 27B Local Setup Guide 2026: Coder, VL &](https://www.promptquorum.com/local-llms/qwen-local-deployment-guide-2026)
7. [Best LLM for Coding in 2026: Ranked by Benchmarks](https://www.tembo.io/blog/best-llm-for-coding)
8. [GLM-4.6 Hardware Requirements & Specs - LocalOps](https://localops.tech/model/glm-4.6)
9. [Z.ai GLM-4.6 Open Source | Reference Models - Made By Agents](https://www.madebyagents.com/models/glm-4-6)
10. [zai-org/GLM-4.6 · guys we also need some AIR](https://huggingface.co/zai-org/GLM-4.6/discussions/1)
11. [GLM-4.6 - 357B | GPU Requirements | vram.run](https://vram.run/model/zai-org/GLM-4.6/)
12. [SGLang vs vLLM in 2026: Benchmarks, Architecture, and ...](https://particula.tech/blog/sglang-vs-vllm-inference-engine-comparison)
13. [vLLM vs SGLang 2026: RadixAttention vs PagedAttention ...](https://www.spheron.network/blog/vllm-vs-sglang-2026/)
14. [SGLang vs vLLM in 2026: Which Inference Engine Wins?](https://kanerika.com/blogs/sglang-vs-vllm/)
15. [SGLang vs vLLM vs TensorRT-LLM: 2026 Inference Benchmark](https://iotdigitaltwinplm.com/sglang-vs-vllm-vs-tensorrt-llm-benchmark-2026/)
16. [vLLM vs SGLang vs TensorRT-LLM - Inference Engineering](https://inferenceengineering.tech/learn/vllm-vs-sglang-vs-tensorrt-llm/)
17. [Using a Local Agentic Coding LLM through Slack or GitHub with OpenHands](https://www.youtube.com/watch?v=4ukm7XK27ms)
18. [vLLM vs TensorRT-LLM vs SGLang: Which Is Fastest? ...](https://www.spheron.network/blog/vllm-vs-tensorrt-llm-vs-sglang-benchmarks/)
19. [Repository Customization](https://docs.openhands.dev/openhands/usage/customization/repository)
20. [Plugins](https://docs.openhands.dev/sdk/guides/plugins)
21. [Run Local LLMs with OpenHands](https://docs.openhands.dev/openhands/usage/llms/local-llms)
22. [OpenHands/benchmarks: Evaluation harness for ... - GitHub](https://github.com/OpenHands/benchmarks)
