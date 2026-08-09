<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Original filename : best-github-repos-stack.md
Origin            : Forge-OH, the predecessor project. Supplied by the operator on 2026-08-09 01:01 EDT.
Filed by          : agent, verbatim, unmodified below the marker line.
sha256 (body)     : 6b8f528bf1199e43
Why filed         : Candidate OSS components. Vendoring candidates only: nothing here is adopted until it has a PORTING_LEDGER.md entry with SPDX license and commit SHA.

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

# Best-of-Breed GitHub Repos for the Local Autonomous Coding Stack

## Principle: Buy (Clone), Don't Build

Every layer of the modular stack has a mature, high-star, actively-maintained open-source repo that can be dropped in behind a standard interface, meaning near-zero original code is required anywhere except thin glue configuration (env vars, `.openhands/` config files, MCP server manifests).

## Component-by-Component Repo Selection

| Layer | Repo | Stars / Signal | Why this one |
|---|---|---|---|
| Agent harness | `All-Hands-AI/OpenHands` | 72,761★, crossed 68K in March 2026, monthly release cadence[^1][^2] | Highest-star, most benchmarked autonomous coding agent; native local-LLM docs, plugin/hook/skill extension system already covered in prior research |
| Inference engine | `sgl-project/sglang` | Powers 400,000+ GPUs in production, hosted under LMSYS non-profit, "de facto industry standard" per its own repo description[^3] | RadixAttention shared-prefix caching matches OpenHands' repeated-system-prompt pattern; active kernel repos (`flashinfer`, `DeepGEMM`, `sgl-kernel-npu`) show a healthy surrounding ecosystem, not a single-maintainer risk[^4][^5] |
| Inference engine (fallback) | `vllm-project/vllm` | Broadest model day-one support, largest community[^6] | Use when swapping to a brand-new model release before SGLang adds support |
| Model weights | `Qwen/Qwen3-Coder-Next` (Hugging Face, not GitHub, but OSS-licensed) | 80B/3B MoE, 70.6% SWE-Bench Verified[^7] | Already selected in prior research; distributed as open weights, no training code needed |
| Tool/capability layer — general reference | `modelcontextprotocol/servers` | Maintained by the MCP steering group itself; canonical reference implementations (Filesystem, Redis, GitHub, etc.)[^8] | Official, protocol-authoritative source — start here before third-party servers |
| Tool/capability layer — discovery | `tolkonepiu/best-of-mcp-servers` | Curates 370-400 MCP servers, ~380K combined stars, ranked by an automated project-quality score, updated weekly[^9] | Best single index for finding a vetted MCP server for any new capability without evaluating from scratch |
| Tool: docs/API grounding | Context7 (Upstash) | 59,784★, universally recommended as "install first" across 2026 MCP roundups[^10][^11] | Prevents hallucinated library APIs — directly improves autonomous coding accuracy |
| Tool: repo/CI operations | GitHub MCP Server (official) | 31,737★, official GitHub-maintained[^11][^10] | Native issue/PR/CI access without custom GitHub API glue code |
| Tool: browser automation | Playwright MCP (Microsoft) | 35,512★, #1 on npm at 6.4M installs/week[^11] | Lets the agent test web UIs it writes, officially maintained by Microsoft |
| Tool: semantic code navigation | Serena (Oraios) | 26,943★[^11] | Purpose-built for LLM-driven code search/refactor navigation, directly complements a coding agent |
| Tool: browser debugging | Chrome DevTools MCP (Google) | 47,640★[^11] | Google-maintained, high-star, useful for frontend debugging loops |
| Memory layer | `mem0ai/mem0` | ~55.7k–61k★, $24M raised, 186M API calls/quarter reported[^12][^13][^14] | Largest star base and fastest integration ("runs in three lines"); embeds into any framework rather than replacing your agent runtime, preserving modularity[^13] |
| Memory layer (alternative) | `letta-ai/letta` | ~22–24k★, $10M seed, Berkeley/MemGPT pedigree[^12][^14] | Choose instead of Mem0 only if you want memory paging as a full "Agent OS" rather than an embedded API — a bigger architectural commitment |
| Memory layer (temporal/graph) | Zep / Graphiti | ~20k★[^13] | Consider only if you specifically need temporal knowledge-graph reasoning across sessions |
| Retrieval/vector store | Qdrant or Chroma | Both widely adopted in 2026 context-engineering stacks[^15][^16] | Either works behind a stable query API; Qdrant favored for production scale, Chroma for zero-friction local prototyping |
| Orchestration/graph (only if needed beyond OpenHands' own loop) | LangGraph | Most-cited graph-control framework in 2026 comparisons[^17][^18] | Reach for this only for durable multi-day/multi-repo workflows beyond a single OpenHands session |

## Recommended Minimal-Code Install Sequence

- Clone and run `sgl-project/sglang`, serving Qwen3-Coder-Next as the primary model endpoint.[^3]
- Clone and run `All-Hands-AI/OpenHands`, pointed at the SGLang endpoint via env vars — zero application code required.[^1]
- Add MCP servers to OpenHands' plugin config in this priority order: Context7 (docs grounding), GitHub MCP Server (repo ops), Playwright MCP (browser testing), Serena (code navigation) — all pulled directly from `modelcontextprotocol/servers` or their respective official repos, no custom tool code.[^10][^8][^11]
- Add `mem0ai/mem0` as an embedded memory service for cross-session persistence, since it integrates via a short SDK call rather than requiring a runtime replacement.[^13]
- Defer LangGraph/Temporal entirely until a concrete need for multi-agent or multi-day durable workflows emerges beyond what OpenHands' native loop already handles.[^17]

## Why This Selection Minimizes Original Code

Every repo above is chosen specifically because it exposes a standard protocol (OpenAI-compatible API for SGLang, MCP for all tools, a documented plugin/env-var contract for OpenHands, a short SDK call for Mem0) rather than requiring a custom adapter — the entire system can be assembled through configuration files and install commands, with the only "coding" being a handful of `.openhands/` skill/plugin manifests and hook scripts, consistent with the plug-and-play, process–information–structure design established in prior research.

---

## References

1. [OpenHands | GitHub Stars Leaderboard](https://githublb.vercel.app/owner/OpenHands) - OpenHands on GitHub

2. [OpenHands Crosses 68K GitHub Stars — A Bellwether for the Agent ...](https://theagenttimes.com/articles/openhands-crosses-68k-github-stars-a-bellwether-for-the-agent-platform-boom) - The open-source agent framework has amassed 68,481 stars, placing it among the most-watched AI repos...

3. [SGLang is a high-performance serving framework for large ...](https://github.com/sgl-project/sglang) - SGLang is a high-performance serving framework for large language models and multimodal models. It i...

4. [sgl-project](https://github.com/sgl-project) - sgl-project has 28 repositories available. SGLang is a high-performance serving framework for large ...

5. [sgl-project](https://github.com/orgs/sgl-project/repositories) - sgl-project has 8 repositories available. Follow their code on GitHub.

6. [SGLang vs vLLM vs TensorRT-LLM: 2026 Inference Benchmark](https://iotdigitaltwinplm.com/sglang-vs-vllm-vs-tensorrt-llm-benchmark-2026/) - Reproducible 2026 benchmark of SGLang, vLLM, and TensorRT-LLM — throughput, p50/p99, KV cache utiliz...

7. [Hands On Guide: Putting...](https://binaryverseai.com/qwen3-coder-review/) - A deep dive review of Alibaba's Qwen3-Coder. We go beyond the hype with hands-on coding tests, a ful...

8. [Model Context Protocol Servers](https://github.com/modelcontextprotocol/servers) - This repository is a collection of reference implementations for the Model Context Protocol (MCP), a...

9. [tolkonepiu/best-of-mcp-servers: 🏆 A ranked list ...](https://github.com/tolkonepiu/best-of-mcp-servers) - This curated list contains 400 awesome MCP (Model Context Protocol) servers with a total of 1.2M sta...

10. [Best MCP Servers in 2026: 12 Ranked Picks for Claude ...](https://www.totalum.app/blog/best-mcp-servers-2026) - Directories like mcpservers.org list 9,800 plus servers, and the curated best-of-mcp-servers list on...

11. [Top 11 MCP Servers Ranked by REAL Data — I Ran Every One (4 Popular Ones Are Dead)](https://www.youtube.com/watch?v=BwkXpR9YgHE) - Two days before the biggest MCP spec revision ever (July 28), I ranked every major MCP server by rea...

12. [Mem0 vs Letta: AI Agent Memory System Comparison](https://www.agentlist.top/en/compare/mem0-vs-letta/) - Compare Mem0 (lightweight memory layer) and Letta (full stateful Agent platform) across memory model...

13. [AI Agent Memory Systems Compared: Letta vs Mem0 vs Zep](https://futurepicker.com/en/ai-agent-memory-systems-letta-mem0-zep-2026-en/) - AI agent memory beca […]

14. [AI Memory Tools Compared: Pricing & Status](https://theforecastdesk.com/tracks/ai-memory-layer/) - Seven boards sit on this track — the most crowded field on the books. Dated prices, verified tractio...

15. [Context Engineering for AI Agents: The Complete Guide (2026)](https://toolhalla.ai/blog/context-engineering-ai-agents-2026) - Prompt engineering was about finding the right words. Context engineering is about curating the righ...

16. [The Ultimate Guide to Context Engineering for AI Agents](https://www.youtube.com/watch?v=a4otTRdFxdY) - Prompt engineering used to be enough, but in the era of autonomous AI agents, the game has completel...

17. [Best LangGraph alternatives (2026): 6 AI agent frameworks ranked](https://stacksandflows.com/best-langgraph-alternatives/) - Honest buyer guide to the best LangGraph alternatives in 2026: OpenAI Agents SDK, AutoGen, CrewAI, L...

18. [LangGraph Alternatives: Graph Control vs Managed Runtime ...](https://logic.inc/resources/langgraph-alternatives) - LangGraph fits when graph topology is the design problem. When it isn't, the choice is between a dif...

