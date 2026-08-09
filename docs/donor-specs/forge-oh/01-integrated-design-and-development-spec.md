<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Source: Forge-OH research phase, supplied verbatim by the operator on 2026-08-09 00:41 EDT.
Reason for filing: the OH-GUI spec corpus (docs/specs/) contains ~1 of 69 "middleware" references
that describe middleware as a capability harness. The harness concept below — OpenHands unmodified
core plus Skills/Plugins/Hooks/MCP as adapters, lifecycle-hook quality gates, evidence packaging,
plain-language event schema, and the Simple/Advanced mode split — was lost across spec iterations.

Filed unmodified so that any future OH-GUI spec claim can be diffed against the original intent
rather than against a summary of it. Amendments belong in docs/specs/ and in ADRs, never here.
See docs/specs/COVERAGE-forge-oh.md for the requirement-by-requirement mapping.
-->

# Local Autonomous Coding System: Integrated Design and Development Specification

## Overview

This specification integrates three prior research phases into a single buildable plan: the local-LLM backend architecture for an RTX 5090 (32GB VRAM), the technical/developer-facing browser GUI, and a non-technical "vibe coding" front door for users with no programming background. The system runs entirely on free, open-source software on a single workstation, uses OpenHands as the unmodified agent core, and exposes two front doors — a plain-language experience for non-technical use and an optional developer view — over the same backend.

## Part 1: Backend Architecture

### Model and Inference Engine

The production model baseline is **Qwen3-Coder-30B-A3B-Instruct (AWQ)**, a 30.5B-total/3.3B-active Mixture-of-Experts model that fits at roughly 16GB VRAM, leaving headroom for KV cache and concurrency. **Qwen3.6-35B-A3B** is the immediate challenger, officially supported by both major serving engines and reportedly stronger on repository-level and frontend agentic tasks. **Qwen3-Coder-Next** (80B total/3B active, 256K context, 70.6% SWE-Bench Verified) is retained only as an experimental challenger: public quantization data shows Q4 requiring roughly 45–49GB and even NVFP4 packaging landing near 45GB, exceeding the 32GB budget without CPU expert offload, which trades latency and context headroom for fit.[^1][^2][^3][^4][^5][^6]

| Model | Total/Active Params | Est. VRAM | Role |
|---|---|---|---|
| Qwen3-Coder-30B-A3B AWQ | 30.5B/3.3B MoE | ~16GB | Primary daily driver |
| Qwen3.6-35B-A3B | 35B/~3B MoE | ~19–27GB | Challenger, officially recommended for agentic coding[^3] |
| Qwen3-Coder-Next | 80B/3B MoE | ~45GB+ at Q4[^5] | Experimental, offload required |

Inference engine selection should be settled by a workload-specific bake-off rather than by benchmark literature alone, since **vLLM** and **SGLang** trade places depending on whether traffic is single-stream or shared-prefix/concurrent — and OpenHands' repeated system-prompt-plus-growing-tool-history pattern is architecturally a shared-prefix workload that tends to favor SGLang's RadixAttention. Both expose an OpenAI-compatible `/v1/chat/completions` API, which is the single interface decoupling every upstream component from the serving engine.[^7][^8]

### Harness, Tools, and Reliability

**OpenHands** remains the unmodified agent core. All customization happens through its own extension surfaces — Skills, Plugins, Hooks, and MCP server declarations — which function as a hexagonal-architecture boundary: the OpenHands plan-act-observe loop is the domain hexagon, and skills/plugins/hooks/MCP are pluggable adapters at its edge. Hooks fire at defined lifecycle points (`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`) and are the correct place to enforce quality gates, block dangerous commands, and inject the plain-language event schema required by the non-technical front end.[^9][^10][^11]

External capabilities (GitHub operations, documentation grounding via Context7, browser automation via Playwright, semantic code navigation via Serena) should be added as Model Context Protocol servers rather than embedded code, using the official reference implementations and curated discovery indexes as the source of vetted options.[^9]

Host OS should be a current Ubuntu-family LTS with distro-supported CUDA packaging (Ubuntu 26.04 distributes CUDA through its own archive via `apt install cuda-toolkit`, reducing the driver friction seen on earlier RTX 5090 deployments). Docker plus the NVIDIA Container Toolkit provides per-session sandbox isolation.[^12][^13]

### Development Phasing (Backend)

1. **Phase 0** — Define non-negotiables (local-only, OSS-licensed, single-GPU, no OpenHands fork) and build a 30–50 task benchmark corpus from real repositories, tracking success rate, regression rate, tokens, VRAM, and retries.
2. **Phase 1** — Minimal vertical slice: one OpenHands version, one model/engine pair (Qwen3-Coder-30B-A3B on SGLang vs vLLM), pinned image versions, 20 tasks passing reproducibly.
3. **Phase 2** — Harness hardening via a versioned plugin bundling the base skill, lifecycle hooks (dangerous-command blocking, completion gates), the plain-language event schema, and an evidence packager.
4. **Phase 3** — Model/engine tournament across context lengths, quantizations, and concurrency; promote a new default only on measured improvement.
5. **Phase 4** — Add LiteLLM gateway (optional, after baseline validation) plus OpenTelemetry/Langfuse observability.
6. **Phase 5** — Durable autonomy: Git worktrees per task, branch/PR automation, risk-tiered approval policy.
7. **Phase 6** — Evidence-driven memory: add structured file memory, then Qdrant retrieval, then Mem0, each gated on measured need.

## Part 2: Developer/Advanced GUI

The technical interface exists as an opt-in "Advanced" or "Developer View," never shown by default. Its information architecture separates five simultaneous streams that most chat tools flatten into one: task state (plan/DAG and FSM state), the tool-call event trace, code diffs, terminal output, and evidence/verification results. Diff-first, per-hunk review — the pattern that distinguishes leading agent tools such as Cursor and Claude Code from generic chat interfaces — is the core interaction.[^14]

| Zone | Content | Component |
|---|---|---|
| Header | Session state, active model/engine, VRAM, tokens/sec | Persistent status strip |
| Sidebar | Task/session tree | Left rail |
| Event timeline | Collapsible action/tool-call cards, errors preserved | Center scroll region |
| Diff panel | Per-hunk accept/reject | Monaco diff editor |
| Terminal drawer | Live shell output | xterm.js |
| Evidence panel | Test/lint/grep artifacts backing agent claims | Expandable citation chips[^14] |

Visual direction is a precise, terminal-adjacent tool aesthetic (Linear/Vercel-class), dark-mode default, monospace for code/logs paired with a clean grotesk for chrome, one restrained accent color, and status colors (green/amber/red) used only semantically. Stack: React + TypeScript + Vite, Tailwind v4 with OKLCH design tokens, Monaco for diffs, xterm.js for terminal, WebSocket transport, with the GUI treated as a stateless read-model over OpenHands' event log so it can be rebuilt without touching agent state.

## Part 3: Non-Technical "Vibe Coding" Front Door

### Design Rationale

Non-technical users need situational awareness, not operational detail — they want to know what is happening and when a decision is needed, never the underlying mechanics. Currently 63% of self-identified "vibe coders" have no formal development background, and this population overwhelmingly favors tools that show a live, visual result appearing on screen over tools that show code or logs. This is the default experience; the developer GUI from Part 2 becomes the hidden escape hatch.[^15][^16][^17]

### Entry Points

Two entry points converge into the same backend TaskSpec pipeline:

- **Describe what you want** — a single large text box with tappable example prompts, matching how most non-developer vibe-coders start a project.[^16]
- **Upload a build spec** — drag-and-drop PDF/Word/Markdown parsing, with the agent echoing back a plain-language summary for confirmation before starting.

Both produce an **Intent Preview** framed at the outcome level ("I'll build a 3-page website with a home page, services page, and contact form") rather than the operation level, following current agent-native UX guidance that plan previews should describe outcomes, not internal steps. A single "Start Building" button begins the run.[^15]

### The Watching Experience

| Zone | Content | Pattern |
|---|---|---|
| Live preview | Embedded iframe/screenshot of the running app, refreshing as changes land | Matches how mainstream builder tools (Lovable, Bolt, v0) present progress[^17] |
| Progress feed | Plain-language narration, checked-off steps, current step highlighted | "Dynamic Checklist" / agent progress trace pattern[^18][^19] |
| Status header | Current state, elapsed time, friendly animated indicator | "Living Breadcrumb" pattern for background progress[^19] |

Every status string follows the **Agentic Update Formula** — an action word, a specific item, and any relevant constraint (e.g., "Adding your logo to the homepage" rather than "Processing"). This requires each tool/action in the OpenHands plugin layer to carry a human-readable `display_name` and outcome-level description; it is a backend event-schema requirement, not a cosmetic skin.[^19][^20]

### Decisions, Errors, and Completion

Decisions requiring user input are presented as plain-language cards framed as choices with consequences ("I can add a shopping cart now or wait until you tell me what to sell — which do you prefer?"), with a "just decide for me" fallback, rather than raw approve/reject gates. Failures trigger automatic self-recovery first; only unrecoverable errors surface, described in plain language with clear next options, using **partial success reporting** that states exactly what worked and what did not rather than a binary failure.[^21][^19][^15]

Completion produces a celebratory "Your app is ready!" screen with the live preview front and center, a plain summary of what was built, and simple next actions (Preview, Download, Publish, Request a change). Given documented real-world harm from unreviewed non-technical deployments — including a 2026 incident that exposed 1.5 million API keys from a vibe-coded platform — every build must pass an automated, plain-language **Safety Check** before it can be marked ready to publish.[^22]

### Mode Separation

| Mode | Default for | Shows |
|---|---|---|
| Simple (default) | Non-technical end user | Live preview, plain-language progress feed, decision cards, completion screen |
| Advanced | Technical operator, opt-in via settings | Full event timeline, diffs, terminal, evidence panel |

Both modes read from the same OpenHands event log and TaskSpec artifacts; only presentation and information density differ.

## Integrated Development Roadmap

| Phase | Focus | Duration |
|---|---|---|
| 0 | Backend non-negotiables, benchmark corpus | 2–3 days |
| 1 | Minimal backend vertical slice (model + engine) | Week 1 |
| 2 | Harness hardening + plain-language event schema | Week 1–2 |
| 3 | Simple-mode home screen (describe / upload spec) | Week 2 |
| 4 | Watching screen: live preview + progress feed | Week 2–3 |
| 5 | Decision cards, error handling, completion + Safety Check | Week 3–4 |
| 6 | Advanced/Developer view (timeline, diffs, terminal, evidence) | Week 4 |
| 7 | Model/engine tournament, observability, durable workflows | Weeks 5–6 |
| 8 | Evidence-driven memory additions (files → retrieval → Mem0) | Post-baseline, gated on measured need |

This sequencing ensures the non-technical experience ships early and functions correctly against a stable backend baseline before the technical layers, model tournament, and memory subsystems are layered on top.

---

## References

1. [Run Local LLMs with OpenHands](https://docs.openhands.dev/openhands/usage/llms/local-llms) - This guide explains how to serve a local LLM using LM Studio and have OpenHands connect. Base URL: h...
2. [OpenHands Local Coding Agent: Run Autonomously via Ollama](https://www.freshlab.es/blog/openhands-local-llm-coding-agent) - OpenHands v1.7.0 runs fully offline via Ollama, autonomous refactoring, test generation and debuggin...
3. [Open-Source AI Coding Agents in 2026: The Self-Hosting Guide ...](https://rightaichoice.com/blog/open-source-ai-coding-agents-2026-self-hosting-guide) - A practical, benchmarked guide to the four open-source coding agents worth self-hosting in 2026 — wi...
4. [9 Open-Source AI Coding Agents Worth Self-Hosting](https://securityboulevard.com/2026/06/9-open-source-ai-coding-agents-worth-self-hosting/) - Compare 9 open source AI coding agents worth self-hosting in 2026, with licenses, model support, and...
5. [Best Open Source Self-Hosted LLMs for Coding in 2026](https://pinggy.io/blog/best_open_source_self_hosted_llms_for_coding/) - Discover the best open source LLMs for coding and development that you can self-host. Compare GLM-5....
6. [Open Source AI Coding Assistants (2026) - MorphLLM](https://www.morphllm.com/ai-coding-assistant-open-source) - OpenCode leads at 172k stars (MIT). Aider is 45.9k (Apache-2.0), Cline 63.0k, Gemini CLI 105k, Codex...
7. [Qwen 3.6 27B lokal 2026: Qwen3, Coder & VL je Hardware ...](https://www.promptquorum.com/de/local-llms/qwen-local-deployment-guide-2026) - Qwen 3.6 27B, Qwen3, Qwen2.5 (7B–72B), Qwen2.5-Coder und Qwen2-VL lokal betreiben 2026. VRAM-Anforde...
8. [Local AI for Developers OpenHands AMD Bring Coding ...](https://www.amd.com/en/developer/resources/technical-articles/2025/OpenHands.html)
9. [OpenHands + Devstral = A Fully Local Coding Agent](https://www.youtube.com/watch?v=oV9tAkS2Xic) - OpenHands is an open source software development agent, and Devstral Small is a new open-weight mode...
10. [Self-Hosted AI for Developers: Best Coding LLMs in 2026](https://dev.to/lightningdev123/self-hosted-ai-for-developers-best-coding-llms-in-2026-1pmj) - The way developers use AI for coding has changed a lot over the past year. Not long ago, running a.....
11. [Using a Local Agentic Coding LLM through Slack or GitHub with OpenHands](https://www.youtube.com/watch?v=4ukm7XK27ms) - See how to use a locally hosted coding LLM with Slack, GitHub, or a browser interface using the Open...
12. [A Strong, Open Coding Agent Model | Mar 31, 2025](https://www.openhands.dev/blog/introducing-openhands-lm-32b----a-strong-open-coding-agent-model) - We're excited to announce the release of OpenHands LM 32B, a new open-source model fine-tuned from Q...
13. [Locally Hosted Coding Agents: The 2026 Landscape | by Mehmet ...](https://mehmetozgenozdogan.medium.com/locally-hosted-coding-agents-the-2026-landscape-ed652def5989) - Coding agents are no longer confined to cloud-first products. The open-source ecosystem has, in the ...
14. [Qwen 3.6 27B Local Setup Guide 2026: Coder, VL & ...](https://www.promptquorum.com/local-llms/qwen-local-deployment-guide-2026) - Run Qwen 3.6 27B, Qwen3, Qwen2.5 (7B–72B), Qwen3-Coder and Qwen2-VL locally in 2026. VRAM requiremen...
15. [How to Run Qwen 3.6 Locally: 27B Dense vs 35B MoE](https://codersera.com/blog/how-to-run-qwen-3-6-locally-2026/) - Run Qwen 3.6 locally: 27B dense vs 35B-A3B MoE explained, VRAM tables per quant, and copy-paste Olla...
16. [vLLM vs Ollama vs llama.cpp vs TensorRT-LLM on RTX 5090](https://craftrigs.com/comparisons/vllm-vs-ollama-vs-llama-cpp-vs-tensorrt-rtx-5090/) - vLLM wins sustained batches. TensorRT peaks highest. llama.cpp is easiest. RTX 5090 benchmarks acros...
17. [Ollama vs vLLM on RTX 5090: Air-Gapped Inference Benchmark (2026 Update) | Markaicode](https://markaicode.com/benchmarks/air-gapped-ai-benchmark/) - Ollama vs vLLM compared on a single RTX 5090 for air-gapped LLM inference: throughput, P99 latency, ...
18. [Best RTX 5090 AI Stack: 5 Tools Tested for Local LLM Inference](https://markaicode.com/best/best-rtx-5090-ai-stack/) - Find the best AI stack for RTX 5090 GPU. We test Ollama, vLLM, LM Studio, LLaMA.cpp, and ExLlamaV2 f...
19. [vLLM vs TensorRT-LLM vs Ollama vs llama.cpp — Choosing the Right Inference Engine on RTX 5090](https://dev.to/soytuber/vllm-vs-tensorrt-llm-vs-ollama-vs-llamacpp-choosing-the-right-inference-engine-on-rtx-5090-2aap) - Why This Comparison Exists I've been running Nemotron Nano 9B v2 Japanese on an RTX 5090...
20. [vLLM vs TensorRT-LLM vs Ollama vs llama.cpp：RTX 5090 ...](https://explore.n1n.ai/zh/blog/vllm-duibi-tensorrt-llm-ollama-llamacpp-rtx-5090-2026-03-14) - 深入对比 NVIDIA RTX 5090 显卡上的主流 LLM 推理引擎，涵盖性能基准、架构支持及生产环境适用性分析。
21. [vLLM vs llama.cpp: When to Use Each on GPU Servers](https://gigagpu.com/vllm-vs-llama-cpp-gpu-servers/) - vLLM outperforms llama.cpp by 2-3x on throughput when handling 32 or more concurrent requests on hig...
22. [Why I Ditched llama.cpp for vLLM on My RTX 5090](https://www.reddit.com/r/LocalLLaMA/comments/1pll1if/why_i_ditched_llamacpp_for_vllm_on_my_rtx_5090/) - vLLM outperformed llama.cpp in both speed and accuracy for complex tasks The switch was a game-chang...
