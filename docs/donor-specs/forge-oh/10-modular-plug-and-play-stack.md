<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Original filename : modular-plug-and-play-stack.md
Origin            : Forge-OH, the predecessor project. Supplied by the operator on 2026-08-09 01:01 EDT.
Filed by          : agent, verbatim, unmodified below the marker line.
sha256 (body)     : e2b380b0a14ccc50
Why filed         : Modular plug-and-play stack. Read against ADR-026: most entries must land in a native tier, not the harness.

Standing rules for this directory (docs/donor-specs/):
  1. The body below the marker is the operator's document. Never edit it, never "correct" it,
     never summarise it in place. Disagreements go in an ADR that cites this file, not in edits.
  2. Nothing here is a specification of OH-GUI. These are donor documents. A statement becomes
     binding on OH-GUI only when an ADR or a file under docs/specs/ adopts it.
  3. Every OpenHands API, field, or extension surface named below is UNVERIFIED until checked
     against review/_sdk_src/ per ADR-015. Documentation is not verification.
  4. These files exist because iterating a spec drops information. Source-shaped memory is the
     structural fix; summary-shaped memory is what failed.
-->

<!-- ===================== VERBATIM DONOR DOCUMENT BELOW ===================== -->

# A Modular, Plug-and-Play Local Autonomous Coding Stack: Process-Information-Structure Architecture

## Core Design Principle

Every component of the stack — model, inference engine, orchestration graph, memory, retrieval, and harness — should sit behind a standard interface (OpenAI-compatible API, MCP protocol, or OpenHands' plugin contract) so any single layer can be swapped without touching the others. This directly implements a process–information–structure ontology: **structure** is the fixed set of interface contracts (ports), **information** is what flows through them (context, tokens, tool results), and **process** is the transformation logic at each node (an LLM call, a retrieval step, a compaction pass) — the entire system is legible as information moving through a graph of bounded, swappable processes.

## Layer-by-Layer Modularity Map

| Layer | Role | Swap-in options | Interface that enables swapping |
|---|---|---|---|
| Model weights | Raw translation engine (English → logic/math) | Qwen3-Coder-Next, Qwen3-Coder-30B-A3B, OpenHands LM 32B, GLM-Air variants | GGUF/safetensors + standard tokenizer config |
| Inference server | Serves weights over a network port | SGLang, vLLM, llama.cpp, TensorRT-LLM | OpenAI-compatible `/v1/chat/completions` API — the single most important interface in the whole stack, since it decouples every upstream component from the serving engine[^1][^2] |
| Agent harness | Runs the plan-act-observe loop, owns tool dispatch | OpenHands, Cline, custom LangGraph agent | Reads `LLM_BASE_URL` / `LLM_MODEL` env vars — harness is itself swappable since it only assumes an OpenAI-shaped endpoint[^3] |
| Tool/capability layer | External capabilities (search, browser, linters, DBs) | Any MCP server | Model Context Protocol — the emerging universal plug-and-play standard for tool exposure, letting tools be added/removed without touching agent code[^4] |
| Orchestration/graph layer | Coordinates multi-agent or multi-step workflows | LangGraph (graph control), CrewAI (role-based), AutoGen (conversational), Temporal (durable workflows) | Each framework wraps the same underlying LLM-call primitive, so the choice is about topology, not lock-in[^5][^6] |
| Memory/state layer | Persists facts, plans, and history across turns/sessions | Mem0, Letta, Redis, flat MEMORY.md files | Read/write API independent of which LLM or harness is active[^7] |
| Retrieval layer | Injects external knowledge just-in-time | ChromaDB, Qdrant | Vector-store query API, swappable independent of the agent[^7][^8] |

Because every layer talks to its neighbor through a standard, narrow contract, you can replace SGLang with vLLM, or Qwen3-Coder-Next with a future model, or OpenHands with a different harness, and only that one box in the diagram changes.

## Prompt, Context, Loop, Graph, and Harness Engineering — Defined and Applied

Your query names five distinct engineering disciplines; each maps to a specific layer of the process–information–structure model and has its own best-practice literature as of 2026.

**Prompt engineering** — the static "process definition" layer: the wording of the system prompt, instructions, and few-shot examples. Anthropic's guidance is to write extremely clear, direct prompts organized into distinct XML/Markdown sections (`<background_information>`, `<instructions>`, tool guidance, output format), targeting the "right altitude" of specificity — not so rigid it breaks on edge cases, not so vague the model has to guess. Start minimal, test against real failure modes, then add only the instructions and examples the evidence justifies.[^9]

**Context engineering** — the "information flow" layer: deciding exactly which tokens occupy the context window at each inference call, since Anthropic and most 2026 practitioners now treat this as the actual bottleneck in agent reliability, not model capability. The convergent industry framework (Anthropic, LangChain, Manus, Cognition/Devin) reduces to four operations:[^10][^11]

- **Write** — externalize state to files/memory (MEMORY.md, scratchpads) so the model never has to re-derive facts it already established.[^12][^13]
- **Select** — retrieve narrowly and just-in-time rather than front-loading everything; over-eager retrieval is itself a failure mode.[^13][^8]
- **Compress** — summarize resolved history into structured fields (intent, progress, artifacts, next steps) once usage crosses a threshold, commonly 50–75% of window capacity.[^14][^12]
- **Isolate** — give sub-agents or sandboxed sub-tasks their own clean context window so noise from one task never poisons another.[^15][^13]

A critical structural rule for local models specifically: **freeze the stable prefix** (system prompt, tool schemas) and treat it as append-only, because a single changed token anywhere in that prefix invalidates the KV cache and forces expensive recomputation — this is precisely why SGLang's RadixAttention (which caches shared prefixes across calls) compounds the benefit of disciplined context engineering rather than substituting for it. For a 32K-32B-class local model, a practical threshold is compacting at ~75% of context (~24K tokens) into a structured brief, then reinitiating with brief + system prompt + last few turns.[^7][^16][^17]

**Loop engineering** — the "process control" layer: designing the plan-act-observe cycle itself, including error recovery. Production patterns include preserving failed tool calls in context rather than scrubbing them (models read error messages and self-correct), a hard "three strikes then escalate" rule to prevent infinite retry loops, and todo-recitation (the agent periodically rewrites its own goal/plan state) to prevent drift on long-horizon tasks.[^18][^15]

**Graph engineering** — the "structural topology" layer: choosing how multiple agents or steps connect. LangGraph gives explicit low-level graph control when topology itself is the hard problem; CrewAI suits fixed-sequence role-based crews; AutoGen suits flexible multi-agent conversation; Temporal wraps any agent in a durable, crash-recoverable workflow engine. For a solo autonomous coding system built primarily around OpenHands' own loop, the pragmatic choice is to treat OpenHands' native loop as the graph for single-session work, and only introduce LangGraph/Temporal if you need durable multi-day, multi-agent workflows spanning multiple repos.[^5][^6]

**Harness engineering** — the "outer shell" layer: everything that wires model, tools, memory, and graph into an operable system a user or CI pipeline can invoke. OpenHands itself is best understood as a harness: its Skills, Plugins, Hooks, and MCP configuration are the harness's own plug-and-play seams, letting you compose capability without forking core logic.[^4][^19]

## Recommended Fully Modular Reference Architecture

```
┌─────────────────────────────────────────────────────────┐
│ STRUCTURE (fixed interfaces / ports)                     │
│  OpenAI-compatible API · MCP protocol · Plugin contract  │
└─────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐  ┌───────────────────┐  ┌──────────────────┐
│ PROCESS        │  │ PROCESS            │  │ PROCESS          │
│ Inference      │  │ Agent Harness       │  │ Tool/Capability   │
│ engine          │  │ (OpenHands loop:    │  │ layer             │
│ (SGLang primary,│  │  plan-act-observe)  │  │ (MCP servers:     │
│  vLLM fallback) │  │                     │  │  search, lint,    │
│ Model: Qwen3-   │  │ Extension seams:    │  │  browser, DB)     │
│ Coder-Next      │  │  Skills/Plugins/    │  │                   │
│                 │  │  Hooks              │  │                   │
└───────────────┘  └───────────────────┘  └──────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│ INFORMATION (context engineering: write/select/          │
│ compress/isolate)                                        │
│  Memory: Mem0/Letta/MEMORY.md · Retrieval: Qdrant/Chroma │
└─────────────────────────────────────────────────────────┘
```

Every arrow in this diagram is a standard protocol boundary, not a hardcoded dependency — the defining property of a genuinely plug-and-play system, and the direct engineering expression of treating AI as English-to-logic translation happening inside a swappable process operating on well-structured information.

## Practical Guardrails for True Swappability

- Never let the agent harness assume anything about the inference engine beyond the OpenAI API shape — this single discipline is what makes SGLang/vLLM/llama.cpp interchangeable without code changes.[^1]
- Expose every external capability as an MCP server rather than an in-process function call, so tools can be added, removed, or replaced independently of the harness and the model.[^4]
- Keep the system prompt and tool schema block byte-stable across sessions to preserve KV-cache/prefix-cache hits regardless of which engine serves the model.[^16][^17]
- Log the fully assembled context sent on every turn; most agent failures are context failures, not model failures, and you cannot diagnose or swap components responsibly without that trace.[^15][^14]
- Treat memory (Mem0/Letta/files) and retrieval (Qdrant/Chroma) as separate services behind their own APIs, never embedded in harness code, so either can be replaced as better OSS options emerge.[^7]
- Budget context explicitly (target 30–40% window utilization, compact at 50–75%) regardless of which model or engine is active, since this discipline is orthogonal to and compounds with any inference-layer speedup.[^12][^14]

---

## References

1. [SGLang vs vLLM vs TensorRT-LLM: 2026 Inference Benchmark](https://iotdigitaltwinplm.com/sglang-vs-vllm-vs-tensorrt-llm-benchmark-2026/) - Reproducible 2026 benchmark of SGLang, vLLM, and TensorRT-LLM — throughput, p50/p99, KV cache utiliz...

2. [vLLM vs SGLang vs TensorRT-LLM - Inference Engineering](https://inferenceengineering.tech/learn/vllm-vs-sglang-vs-tensorrt-llm/) - On H100 benchmarks with 5,980 requests at TP=2, SGLang throughput is competitive with or exceeds vLL...

3. [Run Local LLMs with OpenHands](https://docs.openhands.dev/openhands/usage/llms/local-llms)

4. [Plugins](https://docs.openhands.dev/sdk/guides/plugins)

5. [Best LangGraph alternatives (2026): 6 AI agent frameworks ranked](https://stacksandflows.com/best-langgraph-alternatives/) - Honest buyer guide to the best LangGraph alternatives in 2026: OpenAI Agents SDK, AutoGen, CrewAI, L...

6. [LangGraph Alternatives: Graph Control vs Managed Runtime ...](https://logic.inc/resources/langgraph-alternatives) - LangGraph fits when graph topology is the design problem. When it isn't, the choice is between a dif...

7. [Context Engineering for AI Agents: The Complete Guide (2026)](https://toolhalla.ai/blog/context-engineering-ai-agents-2026) - Prompt engineering was about finding the right words. Context engineering is about curating the righ...

8. [The Ultimate Guide to Context Engineering for AI Agents](https://www.youtube.com/watch?v=a4otTRdFxdY) - Prompt engineering used to be enough, but in the era of autonomous AI agents, the game has completel...

9. [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) - Anthropic is an AI safety and research company that's working to build reliable, interpretable, and ...

10. [Context Engineering: A Practical Guide for AI Agents (2026)](https://sourcegraph.com/blog/context-engineering) - A practical guide to context engineering for AI agents: the four pillars, how it differs from prompt...

11. [Context Engineering: Agent Reliability Playbook 2026](https://www.digitalapplied.com/blog/context-engineering-agent-reliability-playbook-2026) - A playbook for engineering production-agent context windows: retrieval budgeting, compaction, memory...

12. [Context Engineering for Long-Running AI Agents | Zylos Research](https://zylos.ai/research/2026-06-20-context-engineering-long-running-agents/) - How production AI agents manage their context windows — from dynamic assembly and compression to mul...

13. [Context Engineering: The 2026 Playbook for AI Agents](https://cruxdigits.nl/blog/context-engineering-ai-agents-2026/) - Context engineering, not bigger windows, separates production AI agents from demos. What it means, w...

14. [Context Engineering for AI Agents: The 2026 Stack That ...](https://agentmelt.com/blog/ai-agent-context-engineering-guide/) - Context engineering is the 2026 shift from clever prompts to deliberately assembled context — system...

15. [Context Engineering for LLM Agents (Production-Ready Agents #3)](https://www.youtube.com/watch?v=cD2D_gRESaA) - Context windows fill up fast in long-running agent tasks. When agents hit their token limits, they l...

16. [Context Engineering: The Complete Guide (2026)](https://www.aibuilderclub.com/blog/context-engineering-guide) - Agents burn 100 input tokens per output token. The 4 management strategies, 4 failure modes, and the...

17. [vLLM vs SGLang 2026: RadixAttention vs PagedAttention ...](https://www.spheron.network/blog/vllm-vs-sglang-2026/) - vLLM vs SGLang 2026: RadixAttention prefix reuse vs PagedAttention KV paging, H100/H200 throughput b...

18. [Agent Context Engineering: The Definitive Guide (Top 30 ...](https://snowan.gitbook.io/study-notes/ai/ai-resources-1/context-engineering/context-engineering)

19. [Repository Customization](https://docs.openhands.dev/openhands/usage/customization/repository)

