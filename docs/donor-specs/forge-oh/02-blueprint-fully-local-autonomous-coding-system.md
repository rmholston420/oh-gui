<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.
Source: Forge-OH research phase, supplied verbatim by the operator on 2026-08-09 00:41 EDT
(same message as 01-integrated-design-and-development-spec.md).
Filed unmodified. Amendments belong in docs/specs/ and in ADRs, never here.
-->

# Blueprint for a Fully Local Autonomous Coding System (RTX 5090, 32GB VRAM)

## Recommended Stack at a Glance

| Layer | Pick | Why |
|---|---|---|
| Agent framework | OpenHands (SDK + Docker sandbox) | Leading open-source autonomous coding agent, ~75.8k stars, MIT license, plan-act-observe loop with browser use, 72.8% SWE-bench Verified with strong models, purpose-built local-LLM docs and integrations[^1][^2] |
| Inference engine | vLLM (primary), llama.cpp/Ollama (fallback/prototyping) | vLLM wins throughput under concurrent agent tool-calling loops via PagedAttention and continuous batching; llama.cpp/Ollama is simpler and competitive at single-stream batch-size-1 use[^3][^4][^5][^6] |
| Model | Qwen3-Coder 30B-A3B (MoE) or Qwen3.6-35B-A3B | Fits comfortably in 32GB VRAM, near state-of-the-art open coding benchmark scores, officially recommended by OpenHands and AMD's Lemonade integration[^7][^8][^9] |
| Secondary/backup model | OpenHands LM 32B (fine-tuned Qwen2.5-Coder 32B) | Purpose-trained on OpenHands trajectories, 37.2% SWE-Bench Verified resolve rate, downloadable free on Hugging Face[^10][^11] |
| Orchestration | Docker + Docker Compose | Sandbox isolation per session; matches your existing Docker Compose workflow |

Given your existing Ollama and OpenHands SDK experience (per Forge-OH), this is essentially "the OpenHands ecosystem, wired to a local vLLM/Qwen3-Coder backend" — minimal custom code, maximal reuse of mature OSS.

## Why OpenHands Is the Right Core

OpenHands (formerly OpenDevin) is the most actively maintained, benchmark-leading open-source autonomous coding agent, sitting at roughly 75.8k GitHub stars under the MIT license with monthly releases. It runs a full plan-act-observe loop in a sandboxed Docker runtime, includes browser use and a planning agent, and posts 72.8% on SWE-bench Verified with top-tier models via its V1 SDK. Its "OpenHands Index" benchmark suite additionally evaluates agents across issue resolution (SWE-Bench Verified), greenfield development (commit0), frontend work (SWE-Bench Multimodal Verified), software testing (SWT-Bench), and information gathering (GAIA), giving a broad view of capability rather than a single narrow score. Critically, OpenHands ships first-class documentation for connecting to local LLM servers — LM Studio, Ollama, or an OpenAI-compatible vLLM endpoint — requiring only environment variables (`LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`) rather than custom integration code.[^7][^10][^1][^2]

Because your goal is to minimize custom coding, OpenHands' SDK-first design matters: it exposes CLI, web UI, and SDK entry points, and third parties (including AMD's Lemonade project) have already built turnkey local-LLM bridges you can copy directly. Alternatives like Aider position themselves as terminal pair-programmers rather than autonomous agents — strong for interactive diff-based editing, but not a sandboxed self-directed loop, and its benchmark culture (Polyglot leaderboard) scores the underlying model rather than the tool itself. Tools like Cline, OpenCode, and Gemini CLI are viable but have smaller ecosystems around local-model orchestration specifically for hands-off autonomous execution.[^12][^13][^14][^8][^1]

## Model Selection for 32GB VRAM

The 32GB VRAM ceiling on the RTX 5090 is a real dividing line in the current open-weight coding model landscape. Two credible architectures exist: dense models (all parameters active) and Mixture-of-Experts (MoE) models (small fraction of parameters active per token, enabling much faster generation for a similar total footprint).

| Model | Params (active) | VRAM (Q4-Q6) | Notes |
|---|---|---|---|
| Qwen3-Coder 32B | 32B dense | ~20.5GB (Q4_K_M) | 92.7% HumanEval, best dense coding model at this size; leaves headroom on a 5090 for larger context or Q6/Q8[^15][^16] |
| Qwen3.6-35B-A3B | 35B total / ~3B active (MoE) | ~19–27GB depending on quant | OpenHands' officially recommended local model as of May 2026; large context window, purpose-built for agentic coding, much faster token generation than dense equivalents due to MoE sparsity[^7][^9] |
| Qwen3.6-27B (dense) | 27B active | ~17–29GB (Q4–Q8) | Highest coding/agentic quality per VRAM if you can tolerate the slower dense throughput; a 32GB 5090 can run this at Q6/Q8, the top of its quality range[^9] |
| OpenHands LM 32B | 32B dense | ~20GB (Q4) | Fine-tuned from Qwen2.5-Coder 32B specifically on OpenHands agent trajectories; 37.2% SWE-Bench Verified, free on Hugging Face, best served via vLLM/SGLang[^11][^10] |
| Devstral Small | ~24B | ~14–16GB | Mistral's open-weight model tailored to software engineering agent tasks; demonstrated running fully locally with OpenHands[^17] |

Recommendation: run **Qwen3.6-35B-A3B (MoE)** as the primary daily driver for its speed advantage under agentic tool-calling loops (many short, sequential LLM calls per task, where MoE's lower active-parameter count reduces latency), and keep **Qwen3-Coder 32B dense** or **OpenHands LM 32B** loaded as an alternate for tasks needing maximum reasoning depth over speed. Both fit inside 32GB with room to spare for a large context window (22,000–32,768 tokens recommended by OpenHands docs), which matters because agentic coding tasks accumulate long tool-call histories.[^11][^9][^7]

For reference, open models still trail frontier closed models on SWE-bench Verified — Qwen 3.6 32B scores roughly 66.3% versus Claude Opus 4.7's 76.8% — but at a small fraction of the cost (roughly $0.04 self-hosted per task versus $0.42 for Opus), which is the entire point of an all-local, all-free stack.[^18]

## Inference Engine: vLLM vs. Ollama vs. llama.cpp

For an autonomous agent that fires many rapid, often single-stream tool-calling requests, the choice of inference backend genuinely affects usability, but the "best" engine depends on whether OpenHands is issuing one request at a time or several in parallel (e.g., multi-agent or multi-session use).

| Engine | Strengths | Weaknesses | Best fit here |
|---|---|---|---|
| vLLM | PagedAttention + continuous batching; 20–100% faster under concurrent load; native OpenAI-compatible API; used in OpenHands' own official demos with Qwen3-Coder 30B[^19][^5] | More setup complexity; per-model tuning | Best if running multiple agent sessions/sub-agents concurrently, or serving the model to other tools too |
| Ollama | Zero-config, one-command model pulls, `localhost:11434` API, officially documented OpenHands integration[^10] | No continuous batching — serializes concurrent requests; roughly on par with vLLM at batch size 1[^4] | Best default for solo, single-session use; matches your existing Ollama workflow |
| llama.cpp | GGUF format is the quantization gold standard; lowest single-user latency; can offload layers to system RAM for models exceeding VRAM[^20][^21] | No continuous batching either; manual server flags | Best for squeezing in models slightly over 32GB or for CPU/GPU hybrid inference |

Independent 2026 benchmarks are mixed at batch-size-1 (single agent, one active task): some report vLLM ~38% faster (112 vs. 81 tok/s), others find Ollama/llama.cpp roughly tied or even marginally faster in raw single-stream decoding. The gap becomes decisive only under concurrency — vLLM sustained roughly 630 tok/s across 10 concurrent requests on an RTX 5090 versus proportionally slower serialized throughput on Ollama. Given you're likely to run parallel sub-agents or multiple projects (consistent with Forge-OH and PlexClaw), **vLLM is the stronger long-term choice**, with Ollama kept as a zero-friction fallback for quick single-session testing, matching your current local LLM habits.[^4][^5][^20]

## Reference Architecture

```
┌─────────────────────────────────────────────┐
│  RTX 5090 (32GB VRAM)                        │
│  ┌─────────────────────────────────────────┐ │
│  │ vLLM server (OpenAI-compatible API)      │ │
│  │  - Qwen3.6-35B-A3B (primary, MoE)        │ │
│  │  - Qwen3-Coder 32B or OpenHands LM 32B   │ │
│  │    (swap-in for deep-reasoning tasks)    │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
                     │  OpenAI-compatible HTTP
                     ▼
┌─────────────────────────────────────────────┐
│  OpenHands (Docker container)                │
│  - Agent Server (plan-act-observe loop)      │
│  - Sandboxed runtime per session             │
│  - Browser use, file I/O, shell execution    │
│  - Web UI (localhost:3000) + CLI + SDK       │
└─────────────────────────────────────────────┘
                     │
                     ▼
        Your GitHub repos / local workspace
```

Setup requires almost no original code: pull `vllm serve Qwen/Qwen3.6-35B-A3B --max-model-len 32768` (or the Q4 GGUF via llama.cpp/Ollama for a lighter footprint), then launch the official OpenHands Docker image pointed at that endpoint via `LLM_BASE_URL`, `LLM_MODEL=openai/<model-id>`, and a placeholder `LLM_API_KEY`. AMD's published Lemonade + OpenHands walkthrough and All Hands' own DGX Spark + vLLM + Slack/GitHub integration guide are directly reusable references for wiring OpenHands to GitHub issues and chat, letting you skip building that glue yourself.[^8][^19][^7]

## Practical Recommendations

- Start with Ollama for day-one setup speed (matches your existing local-LLM habit), then migrate to vLLM once you need concurrent agents or want maximum throughput.[^10][^5]
- Keep two models resident behind vLLM's model-swap or run two vLLM processes if VRAM allows: a fast MoE model (Qwen3.6-35B-A3B) for routine edits and a denser model (Qwen3-Coder 32B or OpenHands LM 32B) for harder, multi-file refactors.[^9][^11]
- Set context length to at least 32,768 tokens — OpenHands' agent loop accumulates substantial tool-call history, and shorter contexts silently degrade multi-step task performance.[^7]
- Use OpenHands' native GitHub integration (webhook or Slack bridge, as demonstrated with its Cloud offering, but self-hostable) to assign it real issues directly, closing the loop from ticket to PR without hand-authored glue code.[^19]
- Benchmark your own workloads with the open `OpenHands/benchmarks` evaluation harness before committing to one model, since published SWE-bench numbers vary by task type and quantization.[^22][^18]

---

## References

1. [OpenHands vs Aider (2026): Sandbox Agent or Pair-Programmer?](https://wetheflywheel.com/en/comparisons/openhands-vs-aider/)
2. [Introducing the OpenHands Index | Jan 29, 2026](https://www.openhands.dev/blog/introducing-the-openhands-index)
3. [vLLM vs Ollama vs llama.cpp vs TensorRT-LLM on RTX 5090](https://craftrigs.com/comparisons/vllm-vs-ollama-vs-llama-cpp-vs-tensorrt-rtx-5090/)
4. [Ollama vs vLLM on RTX 5090: Air-Gapped Inference Benchmark (2026 Update)](https://markaicode.com/benchmarks/air-gapped-ai-benchmark/)
5. [vLLM vs TensorRT-LLM vs Ollama vs llama.cpp — Choosing the Right Inference Engine on RTX 5090](https://dev.to/soytuber/vllm-vs-tensorrt-llm-vs-ollama-vs-llamacpp-choosing-the-right-inference-engine-on-rtx-5090-2aap)
6. [Fastest Local LLM Setup: Ollama vs vLLM vs llama.cpp](https://insiderllm.com/pdfs/llamacpp-vs-ollama-vs-vllm.pdf)
7. [Run Local LLMs with OpenHands](https://docs.openhands.dev/openhands/usage/llms/local-llms)
8. [Local AI for Developers OpenHands AMD Bring Coding](https://www.amd.com/en/developer/resources/technical-articles/2025/OpenHands.html)
9. [How to Run Qwen 3.6 Locally: 27B Dense vs 35B MoE](https://codersera.com/blog/how-to-run-qwen-3-6-locally-2026/)
10. [OpenHands Local Coding Agent: Run Autonomously via Ollama](https://www.freshlab.es/blog/openhands-local-llm-coding-agent)
11. [A Strong, Open Coding Agent Model | Mar 31, 2025](https://www.openhands.dev/blog/introducing-openhands-lm-32b----a-strong-open-coding-agent-model)
12. [Open-Source AI Coding Agents in 2026: The Self-Hosting Guide](https://rightaichoice.com/blog/open-source-ai-coding-agents-2026-self-hosting-guide)
13. [9 Open-Source AI Coding Agents Worth Self-Hosting](https://securityboulevard.com/2026/06/9-open-source-ai-coding-agents-worth-self-hosting/)
14. [Open Source AI Coding Assistants (2026) - MorphLLM](https://www.morphllm.com/ai-coding-assistant-open-source)
15. [Qwen 3.6 27B Local Setup Guide 2026: Coder, VL &](https://www.promptquorum.com/local-llms/qwen-local-deployment-guide-2026)
16. [Qwen 3.6 27B lokal 2026: Qwen3, Coder & VL je Hardware](https://www.promptquorum.com/de/local-llms/qwen-local-deployment-guide-2026)
17. [OpenHands + Devstral = A Fully Local Coding Agent](https://www.youtube.com/watch?v=oV9tAkS2Xic)
18. [SWE-Bench Verified Leaderboard: Frontier Models Tested](https://contracollective.com/blog/swe-bench-verified-frontier-models-leaderboard-2026)
19. [Using a Local Agentic Coding LLM through Slack or GitHub with OpenHands](https://www.youtube.com/watch?v=4ukm7XK27ms)
20. [vLLM vs TensorRT-LLM vs Ollama vs llama.cpp：RTX 5090](https://explore.n1n.ai/zh/blog/vllm-duibi-tensorrt-llm-ollama-llamacpp-rtx-5090-2026-03-14)
21. [vLLM vs llama.cpp: When to Use Each on GPU Servers](https://gigagpu.com/vllm-vs-llama-cpp-gpu-servers/)
22. [OpenHands/benchmarks: Evaluation harness for ... - GitHub](https://github.com/OpenHands/benchmarks)
