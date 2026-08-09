<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Original filename : ideal-ACA-v8.md
Origin            : Forge-OH, the predecessor project. Supplied by the operator on 2026-08-09 01:01 EDT.
Filed by          : agent, verbatim, unmodified below the marker line.
sha256 (body)     : 4f5f17bd19bd4458
Why filed         : Ideal autonomous coding agent, v8. The operator has said OH-GUI is a restructuring and extension of Agent Canvas; this is the ideal-shape document.

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

## Hardware Strategy: Agnostic Core, Colossus-Optimized Defaults

The `ModelClient` and `SandboxRuntime` ports already specified are the mechanism for hardware agnosticism — the agent core never hardcodes a GPU vendor, compute capability, or quantization format; every hardware-specific decision lives in an adapter selected at deploy time. vLLM validates this pattern is achievable in practice: its `Platform` abstract base class provides a unified interface across NVIDIA CUDA, AMD ROCm, Google TPU, Intel XPU, and CPU-only backends, with capability detection and attention-kernel dispatch handled per-platform beneath a stable engine API — "one engine, run any model on any hardware". Model the `ModelClient` port's adapter selection the same way: detect available accelerator(s) at startup, select the matching backend (CUDA/ROCm/CPU/Metal), and fall back gracefully to CPU-only llama.cpp on hardware with no discrete GPU at all, since llama.cpp explicitly supports x86, ARM, PowerPC, and s390x with no GPU requirement.[^1][^2][^3][^4][^5]

### Colossus-Specific Optimization Layer

Within that agnostic core, Colossus (RTX 5090, 32GB VRAM, Blackwell SM_120) gets a tuned default adapter rather than a special-cased core. Blackwell (SM_120/compute capability 12.0) requires explicit build/runtime targeting distinct from prior NVIDIA generations — mismatched CUDA architecture flags are the most common source of "it doesn't run" reports on this card. Concretely, for a llama.cpp adapter: build with `-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES="120" -DGGML_CUDA_FA_ALL_QUANTS=ON`, targeting compute capability 12.0 explicitly rather than relying on auto-detection. For a vLLM adapter: `TORCH_CUDA_ARCH_LIST="12.0"`, PyTorch cu128/cu130 builds, and FlashInfer as the attention backend rather than `flash-attn`, which throws `undefined symbol` errors on SM_120 as of current releases. CUDA 12.8+ (13.2 recommended if paired with matching cuDNN 9.20) is the current known-good combination; mixing a CUDA 12 install with newer PyTorch Blackwell wheels is a documented source of dependency breakage.[^6][^7][^8][^9]

Model-sizing guidance specific to the 32GB VRAM budget: 32B-class dense models run comfortably at Q8 with full context on llama.cpp, while 70B-class models require IQ3-tier quantization with a constrained (~8k) context window to fit, or hybrid CPU/GPU layer offload (`-ngl` partial) if system RAM is available for the overflow. GGUF Q4_K_M quantization keeps most 70B-class models under 20GB VRAM in practice across tested tools, leaving headroom for KV cache and concurrent sandboxed tool execution on the same GPU. For the multi-agent/parallel-execution design already specified, vLLM's PagedAttention and continuous batching give a meaningfully higher aggregate throughput ceiling under concurrent worktree-agent load than llama.cpp on this card — observed single-GPU 5090 benchmarks show vLLM reaching several hundred to low-thousands tokens/sec aggregate under batched concurrent requests versus llama.cpp's single-stream-optimized profile. A community-maintained Blackwell-tuned Docker image (`vllm-blackwell-optimizer`, pinned to SM_120 kernels and Linux 6.14 native DMA-BUF) is a directly usable reference for a production-grade Colossus deployment container, avoiding a from-source vLLM build unless a newer capability specifically requires it.[^10][^7][^11][^8][^12][^1]

### Concurrency ceiling: bounding worktree-parallel agents by VRAM

vLLM's throughput advantage under concurrent worktree-agent load is real, but it is not unlimited on a single 32GB card — KV cache, model weights, and per-request activation memory are all shared across every concurrent agent hitting the same `ModelClient` endpoint. Before enabling git-worktree parallelism at any given concurrency level, compute the actual VRAM budget: base model footprint (Q8/32B or IQ3/70B) plus per-concurrent-request KV cache at the configured context length, and cap the orchestrator's active-worktree-agent count at whatever concurrency fits with headroom for the sandboxed tool-execution processes sharing the same GPU. Treat this as a runtime-computed limit read from the `ModelClient` hardware-detection adapter, not a hardcoded constant, so the same orchestrator logic self-adjusts if Colossus's GPU is later upgraded or the core is deployed on different hardware.

### Recommended Hardware-Adapter Split

| Layer | Agnostic default (any Linux host) | Colossus-optimized adapter |
|---|---|---|
| Single-agent inference | llama.cpp (CPU or any GPU backend, auto-detected) | llama.cpp built with `CUDA_ARCHITECTURES=120`, `GGML_CUDA_FA_ALL_QUANTS=ON`[^9][^7] |
| Multi-agent/concurrent inference | vLLM with `Platform` auto-detected backend (CUDA/ROCm/CPU)[^2][^3] | vLLM built/pinned for SM_120, `TORCH_CUDA_ARCH_LIST="12.0"`, FlashInfer attention backend, cu128/cu130 PyTorch[^6][^8] |
| Model quantization/sizing | Runtime-selected quant based on detected VRAM (query via `nvidia-smi`/ROCm-SMI/CPU RAM at startup) | 32B-class at Q8 full-context, or 70B-class at IQ3/Q4_K_M within the 32GB budget[^7][^12][^1] |
| Fine-tuning (Axolotl/Unsloth) | CPU-fallback or cloud-adapter path for non-CUDA hosts | Single-GPU LoRA/QLoRA tuned for Blackwell's FP4/NVFP4 tensor-core support where the base model supports it[^13][^14] |

The `ModelClient` port's hardware-detection adapter should read available VRAM/compute capability at process start and select quantization tier and engine automatically — Q8/32B or IQ3/70B on a 32GB Blackwell card, smaller quants or CPU-only GGUF on lesser hardware, and larger BF16/FP8 tiers if later deployed on a bigger card — so the same core codebase self-configures rather than requiring a manual hardware-specific build per deployment target. This keeps the hardware-agnostic promise real: the port contract never changes, only the adapter's internal engine flags and quant selection do, consistent with the hexagonal architecture's core rule that adapters absorb hardware variance and the domain core never does.[^7][^2][^5][^15]

The strongest autonomous coding agents in 2026 converge on a common shape: a stateless, typed agent core; a separately versioned tool layer; an isolated execution sandbox; and a server boundary that lets the same core run locally or remotely without rewrites. OpenHands' V1 SDK exemplifies this: agents, tools, LLMs, and configs are immutable Pydantic models, and the only mutable entity is a single conversation-state object that supports deterministic replay and crash-safe persistence. This "layered isolation" pattern — SDK core, tools, workspace/sandbox, agent server — is the right foundation because it lets research (prompt/tool experimentation) and production (multi-tenant deployment) evolve independently. By 2026, the industry consensus has sharpened this further: "the harness matters more than the loop" — the model-tool loop is commodity, and differentiation comes from context engineering, durable state, policy enforcement, externalized memory, and protocol design.[^16][^17][^18][^19]

On top of that layering, the system is organized as a **hexagon (ports & adapters)**: every external dependency — LLM provider, vector store, sandbox runtime, memory backend, tool protocol, notification channel, voice pipeline, trace collector, secrets store, input/output guard — is defined as a stable port in domain vocabulary, with vendor-specific adapters plugged in from outside. The dependency arrow only points inward; adapters depend on the core, the core never imports an adapter. This single decision makes the system swappable, fast to extend, durable across a 10-20 year horizon, and able to improve continuously without destabilizing its center. The frontend follows the same principle: it is a thin, swappable rendering layer over the SDK's event stream, never embedding agent logic client-side.[^5][^20][^21]

## Harness Engineering: The Discipline Above the Loop

Harness engineering is now recognized as a distinct discipline: designing the scaffolding, feedback loops, and governance structures that turn a capable model into a reliable, auditable agent. The harness performs five functions — inject instructions/knowledge, provision tools per phase, execute the loop, verify work deterministically, and keep a full record — and none of these are the model's job. A production harness is organized around five stable layers: execution runtime (event loop, session manager, checkpointing, recovery), context system (prompt layout, artifact references, compaction, cache discipline), capability surface (tools, skills, subagents), governance layer (approvals, hooks, allow/deny policy, sandboxing, provenance), and surface/protocol adapters (CLI, IDE, web UI, MCP, ACP). This maps directly onto the hexagonal architecture already specified — the "governance layer" is the `InputGuard`/`OutputFilter`/approval-gate ports, and "surface/protocol adapters" are the frontend and voice adapters.[^19][^22][^23][^5]

Two harness-design levers deserve explicit adoption. First, **design around cache stability**: prompt caching is not a minor optimization — it changes the entire architecture toward a stable prompt prefix, append-only history, a fixed tool catalog per session, and state transitions modeled as messages or mode flags rather than prompt rewrites. The most cache-friendly context ordering is: static system prompt and tool stubs, project memory/AGENTS.md, session-level state summary, recent messages and tool results, then the latest user turn — reordering context on every turn defeats caching entirely. Second, **checkpoint before and after every external side effect**, and make replay deterministic by wrapping side effects in tool-execution envelopes so a replay never accidentally re-runs a destructive action — LangGraph's checkpointers and comparable per-step session persistence patterns both support this rule directly.[^19]

### AGENTS.md as the Harness's Static Knowledge Layer

AGENTS.md has emerged as the open, tool-agnostic standard for repository-local agent instructions — a "README for agents" that cascades hierarchically (global → project → subdirectory, with the nearest file to the edited code taking precedence). It is plain CommonMark Markdown with no required schema, making it trivial to maintain alongside the rest of the repository rather than in a separate tool-specific format (CLAUDE.md, .cursorrules). Treat AGENTS.md as a concise table of contents, not an encyclopedia — the agent should re-read a short, current plan frequently to prevent goal drift, and the file should be actively maintained as living documentation rather than a stale artifact. This slots directly into the existing spec-kit "Constitution" phase: the constitution document and AGENTS.md should be the same artifact, or tightly cross-referenced, so project conventions are defined exactly once.[^24][^23][^25][^26][^27]

| Function | Repo/Standard | Role |
|---|---|---|
| Hierarchical agent instructions | agentsmd/agents.md (AGENTS.md standard) | Repository-local, tool-agnostic behavioral rules, cascading by directory[^25][^26][^27] |

## Context Engineering: The Successor to Prompt Engineering

By 2026, "context engineering" has formally superseded "prompt engineering" as the primary discipline for building reliable agents — Cognition AI states it is "effectively the #1 job of engineers building AI agents". Prompt engineering optimizes a single input-output pair at write time; context engineering designs the dynamic system that retrieves, compresses, assembles, and budgets information across multi-turn sessions spanning hours or days. The four pillars are instructions (system prompts, behavioral framing), retrieval (RAG/grounded search), memory (short-term conversation plus long-term persistent state), and available tools (the function-calling surface, standardized via MCP). Anthropic frames it precisely as "the delicate art and science of filling the context window with just the right information for the next step".[^28][^29][^30]

### The Four Core Strategies: Write, Select, Compress, Isolate

Production context management decomposes into four strategies that directly extend the `Condenser`/context-compaction design already specified. **Write** externalizes state to memory outside the active window (the existing `MemoryStore`/mem0 design). **Select** performs smart, narrow retrieval rather than dumping wholesale context — most production retrieval failures come from retrieving too widely, not too narrowly. **Compress** summarizes at a defined trigger point, using structured fields (session intent, progress, artifacts, next steps) rather than free-form prose, and maintains an artifact manifest separately from the summary itself. **Isolate** delegates work into sub-agents with clean, narrow context windows — each receives only what it needs, returns a structured result, and its intermediate context is discarded, preventing context pollution across unrelated task threads.[^31][^32][^29][^33][^28]

A three-layer cascade governs when each strategy fires, ordered cheapest-first: Layer 1 (tool output truncation and quiet modes) and Layer 2 (input eviction) handle the majority of context pressure without any LLM call; Layer 3 (LLM summarization) is the expensive backstop invoked only when Layers 1-2 are insufficient. This directly operationalizes the "never use an LLM for what a tool can do" heuristic already adopted — compaction itself should default to deterministic truncation/eviction before escalating to a model call. Budget explicitly: target 30-40% context utilization, reserving headroom for response generation and unexpected tool output, and monitor token usage per request rather than only per session. Gate tool exposure with progressive disclosure — expose only the tools relevant to the current task phase rather than the full catalog on every turn, both for token efficiency and for accuracy.[^34][^29][^23]

| Failure mode | Description | Primary mitigation |
|---|---|---|
| Context poisoning | Hallucinated or stale content persists in context and corrupts later reasoning | Validate relevance/freshness before injecting; harder to fix after the fact than to prevent[^29][^33] |
| Context distraction | Irrelevant accumulated history crowds out the current task's signal | Select strategy — narrow, task-scoped retrieval[^33] |
| Context confusion | Overloaded or conflicting instructions blur the model's objective | Stable, ordered context assembly per the cache-friendly layout[^33][^19] |
| Context clash | Newly retrieved information contradicts earlier context | Explicit re-anchoring/re-planning step rather than silent merge[^35][^33] |
| Lost-in-the-middle | Relevant information buried in a long context window is under-weighted | Keep the working context lean; verified via `LLMTest_NeedleInAHaystack`[^33][^31] |

### Evolving Context as a Self-Improving Playbook

Agentic Context Engineering (ACE) frames contexts themselves as evolving playbooks — accumulated, refined, and curated through generation, reflection, and curation — rather than static prompts rewritten from scratch each iteration. This avoids two known failure modes: brevity bias (concise rewrites dropping domain insight) and context collapse (iterative rewriting eroding detail over time). ACE reports +10.6% on agent benchmarks and +8.6% on finance benchmarks purely from structured, incremental context updates, adapting without labeled supervision by leveraging natural execution feedback. This is a direct enhancement to the existing Letta memory-block and MLflow-gated self-improvement design: memory-block edits should themselves follow ACE's generation → reflection → curation cycle rather than ad-hoc overwrites.[^36][^37][^38]

## Agent Loop Design: ReAct, Reflexion, and Composition

ReAct (Reasoning + Acting) remains the correct default single-agent loop in 2026: the model alternates a thought trace with a tool-invoking action, using each observation to update the next thought. Reflexion extends ReAct with an explicit self-critique step after each iteration — "did we succeed, what failed, what changes next" — appended to context as guidance for the retry, and is the right addition specifically when evaluation shows the agent repeating the same failure mode across attempts, particularly on long-horizon coding tasks. The composed loop — think → act → observe → reflect → re-plan → (refuse if unsupported) — is described as the production-grade single-agent stack, and should be the default loop shape for the coding-agent core rather than a bare ReAct loop.[^39][^35][^40][^41]

The recommended adoption sequence is incremental and evaluation-gated, consistent with the champion/challenger discipline already established: start with a ReAct baseline, measure success rate, tool-call accuracy, latency, and cost on the evaluation set; add Reflexion only if the evaluation shows repeated failure patterns, accepting the roughly 30% latency increase in exchange for a typical 10-30% quality improvement on the affected failure-mode subset. Add plan-and-execute (spec-kit's existing Plan/Tasks phases) when planning itself is the bottleneck, and add a verifier-critic step when output quality — not planning — is the bottleneck. Explicit loop budgets are mandatory regardless of composition: max steps, timeouts, retry caps, and a crisp, checkable definition of "done," since an unbounded loop is both a cost risk and a stuck-agent risk. Loop-detection middleware should identify when an agent repeats the same action verbatim and escalate to a human rather than continuing to spin.[^42][^35][^23][^24][^39]

| Loop pattern | Structure | When to add |
|---|---|---|
| ReAct | think → act → observe → repeat | Default baseline for any single-agent coding task[^35][^41] |
| ReAct + Reflexion | + reflect after observe, retry with discipline | Evaluation shows the same failure mode recurring across attempts[^35][^40] |
| ReAct + Planning | Plan first (numbered roadmap), each step its own mini ReAct cycle, replan on contradiction | Planning quality, not execution, is the bottleneck[^39][^35] |
| Plan-and-execute + verifier-critic | Separate generator and evaluator roles | Output quality is the bottleneck, not planning or execution[^35][^32] |
| Orchestrator-worker (multi-agent) | Supervisor delegates to isolated sub-agents, each with clean context | Parallel, independently-scoped subtasks (ties directly to the git-worktree parallelism already specified)[^19][^35][^43] |

The orchestrator-worker pattern, not peer-to-peer multi-agent communication, should be the first multi-agent pattern adopted if/when the single-agent loop proves insufficient for a task — it is simpler to checkpoint, audit, and reason about failure attribution than any peer-to-peer topology.[^35][^19]

## Graph Engineering: LangGraph State Design in Production

Two state-schema decisions are the most consequential choices in a LangGraph-based implementation of the agent core. First, **accumulator vs. overwrite fields**: use `Annotated[list, add]` for anything that should grow across the agent's lifetime — messages, findings, errors, completed steps — since accumulator fields survive checkpoint restarts by design, while plain-typed fields (current document index, approval status, current plan string) take their last-written value on restore. Second, **keep state lean**: everything in the state schema is serialized to the checkpoint store on every node transition, so large content (document text, tool output bodies) should be fetched from storage inside each node rather than carried through state directly — with a lean schema (under 10KB per checkpoint), write latency stays under roughly 15ms with a SQLite-backed checkpointer.[^44]

Retry logic belongs at the state level, not assumed from the framework: LangGraph does not retry automatically on node exceptions, so nodes should catch exceptions, increment an `error_count`/`last_error` field in state, and route to a retry or fallback node via a conditional edge. Wrap node execution with an explicit timeout (e.g., `asyncio.wait_for`) and return fallback state on timeout rather than letting an unbounded call raise into the graph. Mark any node with a state-changing, irreversible action with `interrupt_before`/`interrupt_after` so the human-approval-gate design already specified is enforced structurally by the graph, not left to convention. For the orchestrator-worker pattern above, model the supervisor as a node that reads the task and delegates to specialized sub-agents, each implemented as its own compiled subgraph — this keeps sub-agent context isolated exactly as the "Isolate" context-engineering strategy requires.[^45][^33][^46][^44]

## Python Coding and Debugging Best Practices for Agent-Generated Code

AI-generated code fails in different patterns than human-written code — common agent failure modes include over-abstraction, unnecessary error handling, and documentation drift — so review checklists for agent output should explicitly account for these rather than reusing an unmodified human-code checklist. The practitioner-validated loop that works in production: specify in writing (even one paragraph — vague prompts produce vague code), have the agent plan and list the files/changes it intends before writing anything (catching architectural drift before an 800-line diff exists), let the agent run to a self-verified state (write code, run tests, iterate until green), then review the diff to the same standard as a junior engineer's PR, with particular attention to input validation, error handling, edge cases, and architectural fit. Feedback should be specific, not vague — "the error case at line 42 swallows the exception; raise it instead," not "make it better" — since specific feedback produces specific fixes.[^22][^47]

Static analysis and security scanning belong in the CI loop before any AI-assisted output scales, since roughly 45% vulnerability rates have been observed in AI-generated code in some studies, and this control must run on every PR regardless of whether the diff came from the agent core or a human. Never allow an AI-generated PR to merge without a green light from an automated security scanner and manual sign-off on business logic — this extends the sandboxing/injection-defense design to the code-review stage, not just runtime. A minimal, four-part spec — intent, acceptance criteria (written as test cases), constraints, and out-of-scope — should back every non-trivial change; "out of scope" is explicitly called out as where most regressions slip in, since an agent asked to fix one thing will otherwise wander into unrelated refactors. This four-part spec format is directly compatible with, and should be absorbed into, the spec-kit Specify phase already adopted.[^48][^47][^49][^50][^51][^24]

| Practice | Rationale | Where it plugs into the existing design |
|---|---|---|
| Plan-before-code (file list + intended changes) | Catches architectural drift before the diff is large | spec-kit `Plan` phase[^47][^24] |
| Four-part spec (intent, acceptance criteria, constraints, out-of-scope) | Prevents scope creep and regressions | spec-kit `Specify` phase[^50][^24] |
| Security scan gate on every PR/commit | Roughly 45% vulnerability rate observed in unreviewed AI-generated code | CI hook, parallel to `InputGuard`/`OutputFilter`[^51][^48] |
| Agent-specific review checklist (over-abstraction, unneeded error handling, doc drift) | AI-generated code has distinct failure modes from human code | Human approval gate, self-verification loop[^22][^18] |
| Specific, line-level feedback on rework | Vague feedback produces vague fixes; specific feedback produces specific fixes | Reflexion critique step[^47][^40] |

## Design Heuristic: Never Use an LLM for What a Tool Can Do

The single highest-leverage design discipline across current agent-engineering guidance is: route every operation through the cheapest, most deterministic mechanism capable of handling it, and reserve the LLM strictly for genuinely ambiguous, high-uncertainty, or language-dense decisions. Pure functions — posting to an API, writing a file, computing a timestamp, database writes, formatting — are deterministic, side-effect-controlled, cheaper, faster, and fully unit-testable when executed directly in the orchestration layer rather than as an LLM-invoked tool call. A useful mental split: put the model at "high-value ifs" (ambiguous branches, risk-bearing judgments, escalation points, workflow decisions warranting human-level reasoning) and hand every "foreach" (repeatable, well-scoped, low-risk, deterministically describable execution) to programs, workflows, and tool layers — on tasks that can be deterministically described, code is orders of magnitude cheaper, faster, more stable, and easier to audit than an LLM call.[^52][^53][^54][^34]

This principle governs the whole hexagon, not just the agent core. The `Condenser` (context compaction) should use deterministic truncation/summarization triggers rather than asking the LLM whether to compact. The `KnowledgeSearch` tiering (local-first, web-fallback) should be a deterministic cache-miss check, not an LLM judgment call about whether to search. Spec-kit's task breakdown, Alembic migrations, Docker Compose generation, and git-worktree allocation are all pure orchestration-layer operations with zero need for LLM involvement once the plan is set. Even within the reasoning loop, default parameter values and API-runtime-known decisions should never be placed in the tool schema the model has to reason about — removing deterministic defaults from the model's generation space reduces both cost and error surface.[^55][^43][^56][^57][^24][^31][^34]

### Concrete Enforcement Mechanisms

- **Deterministic-first triage**: before wiring any capability as an LLM tool call, ask whether a rule, lookup, or pure function already solves it; only promote to an LLM-invoked tool when the decision genuinely requires judgment, classification, or open-ended reasoning.[^58][^52]
- **Read/write tool separation**: read tools (safe, no side effects) can be called freely inside reasoning loops; write tools (state-changing) are called only after reasoning is complete and validated, never speculatively.[^34]
- **Idempotent tool design**: use upsert semantics, idempotency keys, and conditional writes so that retries — inevitable in a probabilistic agent loop — never cause duplicate side effects.[^59][^34]
- **Structured-output enforcement**: mandate Pydantic/JSON-schema or grammar-constrained decoding on every LLM call that feeds a downstream program, eliminating markdown-to-JSON parsing failures.[^60][^52]
- **Extraction/transformation separation**: let the LLM only extract or classify; let deterministic code map results to canonical enums via a maintained registry, preventing naming drift across runs.[^52]
- **Prompt-as-code discipline**: version every prompt, gate merges on evaluation thresholds against a golden test set, and run paraphrase fuzzing to surface fragile logic — the same rigor applied to the deterministic codebase.[^61][^52]
- **Latency/cost accounting**: every additional LLM call increases token cost and response time; combine steps or cache repeated deterministic queries rather than re-invoking the model for the same computation.[^62][^61]

This heuristic is not a new port but a cross-cutting review gate: every new capability proposed for the agent passes through a "tool-first" checklist before being wired as an LLM-reasoned tool call, consistent with the "tool-first design" and "pure-function invocation" best practices identified as core to production-grade agentic systems. It directly reduces the attack surface for prompt injection (fewer LLM decision points touching untrusted content), lowers Langfuse-traced token cost, and makes MLflow's evaluation sweeps cheaper to run, reinforcing rather than competing with the observability, safety, and self-improvement design already specified.[^63][^64][^53][^48]

## Backend Architecture

### Core agent loop
Build the reasoning-action loop around a `Conversation` object that owns message history and execution state, with `Agent` as a declarative graph of interchangeable tools, prompts, and LLM bindings. For richer resumability, adopt LangGraph-style checkpointing patterns: a `StateGraph` plus Postgres/Redis checkpointers gives native crash recovery and time-travel debugging — replay any prior state, resume after a human approval gate. For a single, deeply autonomous coding agent (versus a multi-agent "crew"), a graph model or typed core is preferable to role-based frameworks like CrewAI, which optimize for teams of specialist agents rather than one deep worker. The loop shape itself should follow the ReAct+Reflexion composition established above, with plan-and-execute layered in via spec-kit's existing task breakdown.[^65][^17][^18][^66][^40][^45][^24]

### Tool and execution layer
Separate "tools" (bash, file editor, browser, MCP clients) from the sandboxed workspace that actually executes them, following OpenHands' `openhands-tools` / `openhands-workspace` split. Support Model Context Protocol (MCP) as the standard interface for external tool integration — OpenHands V1 aligns its local-execution model to MCP by default and only containerizes when isolation is required. MCP itself becomes a port: tool contracts (name, schema, result type, error semantics) are owned by the core and versioned independently of any specific tool implementation. Every tool should expose progressive-disclosure metadata so the harness can gate exposure by task phase rather than presenting the full catalog on every turn.[^17][^18][^29][^23][^5]

### Edit-application strategy: search/replace vs. whole-file

The spec is silent on *how* the agent applies edits to disk, yet this is a dominant real-world failure mode independent of reasoning quality: search/replace diff blocks are token-efficient but fail more often on weaker or smaller local models (malformed hunks, ambiguous match targets), while whole-file rewrites are more reliable but far more expensive in tokens and latency. Given the local-model-first mandate (32B-class models on Colossus, not frontier hosted models), default to a **hybrid edit strategy**: search/replace diff format as the primary mode for capable models, with automatic fallback to whole-file rewrite when a diff application fails validation (e.g., ambiguous or non-matching search block) rather than surfacing the failure directly to the user. Track edit-application failure rate as an explicit evaluation-harness metric — a rising rate on a given model/quantization tier is a signal to switch that model's edit format, not to add more reasoning steps.[^157]

### Tool invocation strategy: code execution vs. direct MCP calls

Direct MCP tool calls load full tool-definition schemas into context on every turn, which is expensive at the scale of "hundreds of tools across dozens of MCP servers" — Anthropic's code-execution pattern (the agent writes code that calls tools programmatically, keeping intermediate results and unused tool definitions out of context) demonstrates reductions of up to 98.7% in token usage and materially lower latency on tool-heavy tasks. Given this system's local-inference constraint (32B-class models, single RTX 5090), token efficiency in tool invocation directly affects both cost and achievable context budget more than on hosted-frontier setups. Adopt code-execution-with-MCP as the default invocation mode for tool-heavy phases (multi-file edits, multi-step verification), falling back to direct tool calls only for single, simple invocations where the code-execution overhead isn't justified. Pair this with Agent-Skills-style progressive disclosure — load only tool/skill metadata (name + one-line description) at session start, and load the full schema/instructions only once the agent's current task is identified as needing that specific tool — extending the harness's existing progressive-disclosure principle from tools to skills uniformly.[^158][^159]

### Sandboxing and security (critical path)
Treat all LLM-generated code as hostile by default. The isolation spectrum runs: no sandbox → Docker/namespaces + cgroups → seccomp-BPF hardened profiles → gVisor (userspace kernel, syscalls intercepted before reaching the host) → Firecracker microVMs (dedicated kernel per sandbox) → WebAssembly/WASI (capability-based, no ambient authority). For a personal, single-user workstation agent, a pragmatic baseline is: ephemeral, default-deny containers with no host network, no host secrets, read-only root filesystem except `/workspace` and `/tmp`, resource caps, and one fresh container per task. Escalate to gVisor once the agent starts fetching and executing untrusted external content, and reserve Firecracker/Kata for adversarial or multi-tenant threat models.[^67][^68][^69]

| Isolation tier | Mechanism | Startup | Best fit |
|---|---|---|---|
| Docker container | namespaces + cgroups | ~200ms | Trusted, self-written scripts[^68] |
| Docker + hardened seccomp | syscall filtering | ~200ms | CI/CD, internal tooling[^67] |
| gVisor (`runsc`) | userspace kernel (Sentry) | ~300ms | Agent-generated code, mixed trust[^67][^68] |
| Firecracker/Kata microVM | dedicated guest kernel over KVM | ~1-2s (sub-150ms optimized) | Untrusted/third-party code, multi-tenant[^67][^69] |
| WebAssembly/WASI | capability-based sandbox | near-instant | Plugin/extension systems, browser-side tools[^67] |

The sandbox is itself a port: swapping Docker+seccomp for gVisor, or later for Firecracker, requires only a new adapter behind the "workspace execution" interface, not changes to the agent core.[^15][^5]

### Local LLM serving
The inference engine choice depends on concurrency needs, not raw tokens/sec. llama.cpp (and Ollama) wins single-user time-to-first-token — the metric that matters for agents firing dozens of short tool calls per minute. vLLM's continuous batching and PagedAttention pull ahead past roughly 4 concurrent requests, scaling to ~920 tokens/sec at 50 concurrent requests versus Ollama's flatline near 155. Model the LLM connection as a port (a `ModelClient` interface) with adapters for llama.cpp/Ollama, vLLM, and hosted APIs — LiteLLM already provides this unification inside the OpenHands SDK. Default to llama.cpp/Ollama for a single local agent; swap in vLLM only when running multiple parallel agents or users off one GPU. Model routing should also follow a cost-tiered gateway pattern: reserve the most capable local model for planning/reflection decisions, and route mechanical sub-steps to a smaller, cheaper model where accuracy requirements allow.[^18][^70][^71][^72][^73][^74]

### Code retrieval and long-term memory
Index the codebase with tree-sitter-based semantic chunking, stored in a lightweight, file-based vector store. VectorCode demonstrates this directly: Chroma-backed persistent vector DB, CLI + MCP server exposure, semantic chunking via tree-sitter. LanceDB is a strong alternative for a single-file, dependency-light embedded vector store with hybrid BM25+vector search. For durable, editable long-term memory, Letta's self-editing memory-block model is the most mature OSS pattern for persistent-memory agents, and memory edits should follow the ACE generation-reflection-curation cycle rather than ad-hoc overwrite. Both retrieval backend and memory backend sit behind their own ports, making a future migration an adapter swap.[^75][^76][^77][^78][^38][^65][^36][^5]

### Semantic code retrieval: grep + embeddings + LSP

Embedding-only retrieval (VectorCode/LanceDB) is necessary but not sufficient for a coding agent: the 2026 industry convergence is a **three-layer retrieval cascade** — `ripgrep`/grep for broad, low-cost textual search; tree-sitter-chunked vector embeddings for fuzzy semantic recall; and the **Language Server Protocol (LSP)** for symbol-level precision (definitions, references, call graphs, type-aware renames) that embeddings cannot provide. Oraios' Serena demonstrates this pattern directly: it wraps standard language servers to give an LLM IDE-grade "go to definition," "find all references," and safe symbolic renames, and is MCP-exposed so it slots in as a tool rather than a framework change. Add an `LSPClient` port alongside `VectorStore`: Tier 1 grep (cheapest, always available), Tier 2 embeddings (semantic fallback), Tier 3 LSP (symbol-precise operations — renames, cross-file impact analysis, type diagnostics) invoked only when the task genuinely requires symbolic guarantees rather than fuzzy retrieval.[^151][^152]

| Tier | Mechanism | Cost | Use case |
|---|---|---|---|
| 1 | ripgrep/grep | Near-zero | Broad exploratory search, literal string/pattern matches |
| 2 | Tree-sitter + embeddings (VectorCode/LanceDB) | Low | Semantic/fuzzy recall across unfamiliar code |
| 3 | LSP (via Serena or direct language-server wiring) | Moderate (server startup) | Precise renames, reference-finding, type-aware refactors |

### Dependency verification: defending against slopsquatting

LLMs periodically hallucinate plausible-but-nonexistent package names, and attackers pre-register those exact names on public registries (PyPI, npm) with malicious payloads — a supply-chain attack now termed "slopsquatting." Because this agent is explicitly authorized to install dependencies and run `docker compose up` as part of self-verification, an unsupervised `pip install`/`npm install` on a hallucinated name is a direct compromise path — a gap the sandboxing and prompt-injection defenses do not cover, since the package name itself is the malicious payload, not injected instructions. Treat every AI-proposed dependency as untrusted input: add a deterministic `DependencyGuard` step (not an LLM judgment call, per the tool-first heuristic) that verifies each package against the target registry before install — confirming existence, publisher identity, and registration date — and flags anything registered within the prior 30-90 days for human review. Enforce lockfile pinning (hash verification) in CI and require every install to route through an explicit allowlist; anything off-allowlist blocks on human approval rather than auto-installing.[^153][^154]

| Function | Mechanism | Where it plugs in |
|---|---|---|
| Registry existence + age check | Query PyPI/npm metadata API before install | New `DependencyGuard` port, invoked by the `Implement` phase task queue |
| Lockfile hash pinning | `requirements.txt`/`package-lock.json` committed + verified on every install | CI hook, parallel to the security-scan gate |
| Allowlist gating | Off-allowlist package names route to human approval, never auto-install | Approval-gate/`NotificationChannel` port already specified |

### Durable execution: closing the exactly-once gap

LangGraph's checkpointers answer *where the agent was*, not whether resuming guarantees the side effect wasn't already applied — a node that crashes mid-execution after sending a notification or writing a file will re-run that side effect on resume, since checkpointers save state *between* nodes, not *inside* one. This is a distinct concern from the idempotent-tool-design bullet already listed under the tool-first heuristic; it deserves to be a first-class requirement paired explicitly with the checkpointer rather than an implicit consequence of idempotency alone. Pair LangGraph's reasoning-state checkpointer with a lightweight durable-execution discipline for side effects specifically: every state-changing tool call carries a deterministic idempotency key (derived from task ID + step index + argument hash), and the tool-execution envelope checks for a prior completion record before re-issuing the call on replay. Temporal is the reference for teams that need this at full production rigor; for a single-user local system, a SQLite-backed "completed side effects" ledger keyed by idempotency key is sufficient and avoids introducing a new service dependency.[^155][^156]

### Orchestration framework selection

| Framework | Paradigm | Strength | Best fit for a coding agent |
|---|---|---|---|
| LangGraph | Graph (StateGraph + checkpoints) | Time-travel debugging, Postgres/Redis persistence, explicit interrupt-based approval gates | Long-running, resumable single-agent coding loop[^45][^65][^46] |
| Smolagents | Code-as-action | Sub-1,000-LOC auditable core | Minimal, inspectable agent runtime[^45][^79] |
| OpenHands SDK | Layered SDK (agent/tools/workspace/server) | Purpose-built for software engineering tasks, Docker/Apptainer sandboxing, `Conversation.fork()` | Reference architecture for a dedicated coding agent[^16][^18] |
| CrewAI | Role-based crews | Fast scaffolding, multi-agent teams | Only if decomposing work across specialist sub-agents[^45][^65] |
| Letta | Persistent memory server | Self-editing memory blocks | Cross-session project memory layer bolted onto the above[^65] |

The recommended core is an OpenHands-SDK-style layered architecture for software-engineering-specific abstractions, with LangGraph-style checkpointing for crash recovery and time-travel debugging, and VectorCode/LanceDB for repo-aware retrieval.[^76][^45][^16][^18][^75]

### Database schema management
The agent server, MLflow, and Letta all persist relational state, and over a 10-20 year lifespan the schema will inevitably change. Alembic — SQLAlchemy's companion migration tool — provides versioned, ordered migration scripts rather than ad-hoc schema drift, and fits directly since FastAPI+SQLAlchemy is already the chosen server stack. Treat migrations as part of the deployment pipeline: every schema change ships as an Alembic revision committed alongside the code change that requires it, keeping the database's evolution traceable the same way tool contracts are versioned.[^56][^5]

## Frontend Design Philosophy: Diffs and Plans Over Chat

The 2026 UX consensus is that the chat transcript is secondary. Cursor and Claude Code make the file diff and the live plan/todo list the primary interaction surface, letting users accept, reject, or edit at every checkpoint without losing context. A "stop button that actually stops" and a token/cost meter that doesn't lie are baseline trust requirements. Render inline per-hunk diffs (accept/reject/rewrite), a persistent live task list for long autonomous runs, and tool-call cards (Bash, Edit, Search, Plan) as first-class UI elements.[^80][^81]

### Checkpoint rollback beyond git

The diff-first accept/reject UX implies granular control at the hunk level, but the design's only stated recovery mechanism for a bad autonomous run is git — insufficient when an agent has made a chain of commits across a worktree and the user wants to revert to a specific intermediate state without hand-picking git operations. Add a first-class **checkpoint-to-disk revert**: since the `Conversation`/`StateGraph` checkpointer already persists state at every node transition, expose a UI action that reverts both the conversation state *and* the working-directory contents to a selected checkpoint atomically (a `git reset --hard` to the commit associated with that checkpoint ID, paired with restoring the corresponding conversation state). This makes "undo" a single UI action rather than a manual git archaeology exercise, and composes directly with the existing `Conversation.fork()` support — reverting and forking from a checkpoint are the same underlying primitive.

## Frontend Architecture

The UI renders the SDK's WebSocket/REST event stream without embedding agent logic client-side. OpenHands' own production frontend validates this stack at scale: React 19 + React Router 7 (SPA mode) + Vite, TanStack Query, Zustand, Tailwind CSS v4, Monaco Editor, and Xterm.js.[^82][^83]

| Layer | Recommended OSS | Rationale |
|---|---|---|
| App framework | React 19 + React Router 7 + Vite | File-based routing, fast HMR, proven in OpenHands' production frontend[^83] |
| Server state | TanStack Query | Handles streaming/event-sourced agent state without manual cache logic[^83] |
| Client state | Zustand | Lightweight store for UI-only state[^83] |
| Styling/components | Tailwind CSS v4 + shadcn/ui | Copy-in, fully-owned component source[^84][^85] |
| Chat/agent UI primitives | assistant-ui | Composable primitives with native streaming[^86] |
| Agent-specific components | 21st.dev agent-elements | Pre-built tool-call cards and plan/todo components[^81] |
| Code editor | Monaco Editor (`@monaco-editor/react`) | Same engine as VS Code, inline diff view[^83][^87] |
| Terminal emulator | Xterm.js | Browser terminal paired with backend `libtmux`[^83] |
| Testing | Vitest + Playwright | Fast, Linux-native unit and e2e testing[^83] |

Core frontend requirements: real-time streaming of agent reasoning, tool calls, and diffs over WebSocket; a terminal/IDE-integrated view (tmux-backed shell, file editor, browser tool); human-in-the-loop approval gates as LangGraph-style interrupts or explicit approval nodes; conversation fork/branch support via `Conversation.fork()`; and full audit logging mirrored to the UI.[^68][^45][^16][^18]

## Visual Design: Restraint as the New Spectacular

2026's leading design consensus explicitly rejects gratuitous gloss — "Anti-Liquid Glass" and "purposeful motion, not decorative animation" are the two dominant trend reversals of the year. The path to a genuine "wow" that still holds up under daily engineering use is: sparse, high-impact visual moments (an animated aurora background on load, a fluid page transition, a signature interaction) layered onto an otherwise disciplined, functional interface — not constant motion or gloss everywhere. For AI-specific panels, the 2026 standard converges on dark-mode-default "Glassmorphism 2.0": near-black bases (#0A0A0A–#1A1A2E) with frosted, translucent panels (backdrop-filter blur 12–20px, low-opacity rgba fills) that visually separate AI-generated output from the base UI without rigid card borders.[^88][^89]

### Recommended Visual/Motion Stack

| Layer | Recommended OSS | Rationale |
|---|---|---|
| Animation engine | Motion for React (formerly Framer Motion) | Hybrid engine — native Web Animations API + JS fallback for spring/gesture physics, 120fps, 30M+ downloads/month, MIT[^90][^91] |
| Animated component source | Aceternity UI | Copy-in React+Tailwind+Motion components — 3D card effects, GitHub-globe-style visuals, spotlight/beam effects[^92][^93][^94] |
| Animated component source (complementary) | Magic UI | 150+ additional copy-in components (marquees, animated lists, bento grids, particles) on the same stack, MIT[^95][^96] |
| Ambient hero/background effects | Aurora/gradient background pattern (Motion-based) | Slow-moving radial gradient sweep for the landing/idle state — one well-placed "wow" moment rather than app-wide motion[^97] |
| 3D/WebGL accents (optional, sparing use) | react-three-fiber (Three.js React renderer) | For a signature 3D element, used deliberately, not throughout[^92] |

These additions sit directly on top of the React 19 + Tailwind v4 + shadcn/ui foundation — Aceternity and Magic UI are both built explicitly for that combination, so no architectural change is needed. Reserve heavy motion for low-frequency, high-impact surfaces (landing screen, onboarding, completed-build celebration) while keeping high-frequency work surfaces (diff view, terminal, task list) to fast (100–300ms), state-communicating micro-animations only. Streaming text via typewriter-style reveal, skeleton/shimmer loading during tool calls, and persistent dark-mode Glassmorphism 2.0 panels complete the 2026-standard visual identity.[^89][^95][^94][^88]

## Core Abilities and Features

An autonomous coding agent competitive with the 2026 frontier needs, at minimum:[^98][^99][^100][^101][^102]

- Multi-file, repository-scale code editing with semantic retrieval over the full codebase.[^102][^75]
- Autonomous multi-step planning with checkpointed, resumable execution and time-travel replay.[^45]
- Sandboxed shell, file, and browser tool execution with tiered isolation escalation.[^67][^68]
- Provider-agnostic LLM routing (via `litellm`) across local GGUF models, self-hosted vLLM endpoints, or hosted APIs.[^71][^18]
- Native MCP client/server support for extensible third-party tool integration.[^17]
- Self-verification loops: run tests, linters, and type-checkers after edits, feeding failures back into planning.[^18]
- Persistent, editable project memory across sessions, updated via generation-reflection-curation rather than overwrite.[^38][^65]
- Human approval gates and full command-level audit logging, given OWASP's classification of unsandboxed agent code execution as top-tier risk (ASI05).[^103]
- Diff-first, plan-first interaction model as the primary UX surface.[^81][^80]
- Spec-driven autonomous build pipeline: uploaded or natural-language-derived specs drive a full spec → plan → tasks → implement → test loop.[^104][^105]
- Tiered knowledge retrieval: local knowledge base searched first, global web search only as fallback.[^75][^55]
- Continuous self-evaluation with run-level metrics, comparisons, and safe self-upgrade gating.[^42][^63]
- Multi-channel human notification (email, chat/IM) for approval requests and status updates.[^106]
- Bidirectional voice interface: local speech-to-text input and text-to-speech output.[^107][^108]
- Structured learning loop from both failures and successes, feeding back into memory, prompts, and evaluation baselines.[^36][^42]
- A visually distinctive, restraint-based UI with deliberate signature moments rather than constant decoration.[^88][^89]
- Request-level tracing of every run for step-by-step debugging beyond aggregate metrics.[^64][^109]
- Encrypted-at-rest secrets management with no separate vault service required.[^110]
- Automatic context compaction for long-running autonomous sessions, governed by the write/select/compress/isolate strategy cascade.[^111][^29][^31]
- Parallel agent execution across isolated working directories, following the orchestrator-worker multi-agent pattern.[^43][^19]
- Self-contained deployment packaging for every generated application.[^24][^18]
- Layered input/output guarding against prompt injection from web content, scraped pages, and third-party MCP tool output.[^112][^113]
- Versioned database schema migrations as persisted state models evolve.[^56]
- A local fine-tuning path so learning can eventually act at the model-weights level, not only the prompt/memory level.[^13]
- A ReAct+Reflexion composed reasoning loop with explicit step budgets, loop-detection, and a checkable definition of "done".[^40][^39]
- An AGENTS.md-governed static knowledge layer, cache-stable context assembly, and a four-part spec contract (intent, acceptance criteria, constraints, out-of-scope) for every non-trivial change.[^25][^50][^19]
- Symbol-precise code retrieval via LSP (definitions, references, refactors) layered above grep and embedding-based search.[^151][^152]
- Deterministic dependency verification (registry-existence, publisher-age, lockfile pinning) guarding against AI-hallucinated ("slopsquatted") package installs.[^153][^154]
- Exactly-once side-effect execution via idempotency-keyed tool envelopes, paired with — not substituted for — checkpointing.[^155][^156]
- Automatic fallback between search/replace diff and whole-file edit application, tracked as an evaluation-harness metric per model tier.[^157]
- Code-execution-with-MCP as the default tool-invocation mode for tool-heavy phases, with Agent-Skills-style progressive disclosure of tool/skill metadata.[^158][^159]
- On-disk checkpoint rollback (conversation state + working directory reverted atomically), not git alone, as the undo mechanism for a bad autonomous run.
- Capability claims tracked against named, versioned public benchmarks (SWE-bench Verified, Terminal-Bench 2.0), not only an internal evaluation harness.[^160][^161]

## Spec-Driven Autonomous Build Pipeline

Uploading a build spec, or converting a natural-language app idea into a spec, maps onto the Spec-Driven Development (SDD) methodology GitHub formalized in 2025-2026: **Constitution → Specify → Plan → Tasks → Implement**. Both entry points share the same downstream pipeline — the difference is whether "Specify" is skipped (spec already provided) or run first (idea → spec). A PRD-generation layer sits in front for the natural-language direction, transforming informal descriptions into structured technical documents. Layering a BDD/Gherkin extension on the spec phase gives the pipeline the self-testing property needed to autonomously verify "full working" status. The `Specify` phase should require the four-part contract established above — intent, acceptance criteria as test cases, constraints, and explicit out-of-scope boundaries — since out-of-scope drift is the most common source of regressions in agent-authored changes.[^114][^105][^115][^116][^50][^104][^24]

| Stage | Tool/Repo | Role |
|---|---|---|
| Idea → structured spec | OpenSQZ/GTPlanner | Converts natural-language app ideas into structured PRD/technical documents[^115] |
| Spec → plan → tasks → implement | github/spec-kit | CLI (`specify`) driving Constitution/Specify/Plan/Tasks/Implement, integrates with 30+ coding agents[^24][^117] |
| Acceptance criteria → tests | spec-kit-bdd (community extension) | Converts spec acceptance criteria to Gherkin scenarios and step definitions before implementation[^114] |

Wire spec-kit's `/speckit.implement` phase directly into the OpenHands-SDK-based agent core — the task breakdown becomes the task queue the `Conversation`/`Agent` loop executes and checkpoints against. The `Implement` phase should include "generate and validate `docker-compose.yml`" as a standard task in every build's task list, verified by actually running `docker compose up` as part of the self-verification loop, giving every spec-built application a self-contained, portable run target with no manual deployment configuration. Before the agent begins writing code, it should be required to plan and list the exact files it will touch and the changes it intends, catching architectural drift while the diff is still zero lines rather than eight hundred.[^47][^18][^24]

## Tiered Knowledge Retrieval: Local-First, Web-Fallback

Implement as a two-tier `KnowledgeSearch` port with ordered adapters. Tier one queries local codebase/memory indices (VectorCode/LanceDB embeddings plus Letta memory blocks). Tier two, invoked only on a local miss, queries a self-hosted metasearch engine rather than a third-party API — SearXNG aggregates 270+ search services with no tracking, deployable via Docker Compose. Local Deep Research's SearXNG integration is a directly reusable reference for wiring this into an agent's retrieval loop.[^118][^119][^120][^76][^55][^75][^36]

| Tier | Component | Repo |
|---|---|---|
| 1 (local knowledge base) | VectorCode / LanceDB + Letta memory | Davidyz/VectorCode, lancedb/lancedb, letta-ai/letta[^78][^77][^36] |
| 2 (web fallback) | Self-hosted metasearch | searxng/searxng[^118][^120] |

## Prompt Injection and Adversarial Content Defense

Because the `KnowledgeSearch` port and browser tool pull in live web content, scraped pages, and third-party MCP tool output, the agent has a direct exposure to indirect prompt injection — malicious instructions hidden inside documents, issue trackers, or tool responses that attempt to hijack the agent's behavior, a risk OWASP ranks among the top LLM application threats. This is distinct from the sandboxing defense already specified, which protects the host from malicious *code*; this defense protects the agent's *reasoning* from malicious *instructions* embedded in content it reads. The current best-practice pattern is layered: input triage (regex/pattern matching for known injection markers), schema validation on any structured tool output, a semantic classifier for subtler attempts, and least-privilege tool authorization so that even a successfully injected instruction cannot invoke tools outside the current task's declared scope. Treat retrieved content and tool output as untrusted by default: strip system-prompt-like text from retrieved chunks, isolate tool output behind explicit JSON schemas, validate every tool argument against a typed contract, and run a guardrail evaluator against planner output before any state-changing call. Model this as paired `InputGuard`/`OutputFilter` ports wrapping every LLM call and every ingested external document, with `protectai/llm-guard` (modular input/output scanners) or `deadbits/vigil-llm` (stacked vector-similarity, YARA-rule, and transformer-classifier scanners) as vendorable adapters.[^113][^121][^74][^112][^48]

| Function | Repo | Role |
|---|---|---|
| Input/output scanning | protectai/llm-guard | Modular scanners for prompt injection, PII leakage, and toxic output on both directions of the LLM call[^48] |
| Stacked injection detection | deadbits/vigil-llm | Vector-similarity, YARA-rule, and transformer-classifier detection layers, usable as a standalone scanning service[^48][^121] |

## Metrics, Comparison, and Safe Continuous Self-Improvement

Every run, model, prompt variant, and tool version is logged as a trackable experiment. MLflow provides experiment tracking, a model/prompt registry with aliasing (champion/challenger/candidate), and integrates with any CI/CD gate before promotion. The champion/challenger pattern is the mechanism for safe self-upgrade: a new prompt, tool version, or fine-tune runs as a challenger against a held-out evaluation set and is only promoted once it clears defined thresholds. `benchflow-ai/awesome-evals` catalogs pass@k (capability) and pass^k (reliability) metrics plus Agent-as-a-Judge trajectory grading. `huggingface/lighteval` and `relari-ai/continuous-eval` provide ready-made harnesses across local model backends and retrieval-specific metrics. Build the evaluation harness before adding more tools or loop complexity — without it, the agent graph grows by intuition, regressions become invisible, and incident review turns into archaeology; a minimal harness needs four scores and roughly 50 task examples to be useful.[^122][^37][^74][^63][^42]

Anchor "frontier-competitive" claims to a named, tracked leaderboard rather than treating capability as self-evident: **SWE-bench Verified** (500 human-filtered real-world GitHub issues, the current standard for coding-agent capability comparisons) and **Terminal-Bench 2.0** (89 tasks scored by deterministic exit codes/diffs/output strings, purpose-built for shell/terminal-executing agents) are the two concrete targets to track run-over-run on Colossus's local model tier. This makes self-improvement claims falsifiable — a prompt or fine-tune change either moves the Colossus-hosted model's score on these named benchmarks or it doesn't, rather than being judged only against an internal ~50-example harness.[^160][^161]

| Function | Tool/Repo | Role |
|---|---|---|
| Experiment tracking + registry | mlflow/mlflow | Logs runs, metrics, artifacts; champion/challenger safe promotion[^63][^122][^37] |
| Agent trajectory evaluation | benchflow-ai/awesome-evals | pass@k/pass^k, Agent-as-a-Judge trajectory grading[^42] |
| Model/agent benchmarking harness | huggingface/lighteval | Cross-backend evaluation harness, 1000+ tasks[^42] |
| Retrieval-specific evaluation | relari-ai/continuous-eval | Modular per-module metrics separating retrieval vs. generation errors[^42] |

## Local Fine-Tuning: Learning at the Weights Level

The learning loop described so far acts at the prompt and memory level (Letta memory blocks, few-shot examples, ACE-style context curation). To eventually act at the model-weights level — the deeper form of "learning from successes and failures" — a local fine-tuning path closes the gap. Axolotl and Unsloth both provide LoRA/QLoRA fine-tuning optimized for single-GPU consumer hardware, letting a local model be periodically fine-tuned on curated successful trajectories pulled from the MLflow/Letta feedback loop. The resulting fine-tuned checkpoint is registered back through MLflow's model registry and gated through the same champion/challenger evaluation process as any other self-modification, so a weights-level update is never promoted without clearing the pass@k/pass^k thresholds already established.[^37][^13][^42]

| Function | Repo | Role |
|---|---|---|
| LoRA/QLoRA fine-tuning | axolotl-ai-cloud/axolotl or unslothai/unsloth | Single-GPU-optimized fine-tuning on curated successful trajectories, registered via MLflow[^13] |

## Human Notification: Email and Instant Messaging for Approval

A notification port with Apprise as the adapter supports 100+ destination services — email, Slack, Discord, Telegram, Matrix — through one URL-based syntax. The approval-gate logic calls one `notify()` interface; the destination is configured, not hardcoded.[^123][^106]

| Function | Repo | Role |
|---|---|---|
| Multi-channel notifications | caronc/apprise | Single library, 100+ services, used from the approval-gate handler[^106][^123] |

## Voice Interface: Speech-to-Text and Text-to-Speech

A fully local, offline voice pipeline uses three independently swappable components. STT: `whisper.cpp` (portable, real-time streaming) or `faster-whisper` (CTranslate2-optimized for NVIDIA GPU pipelines). TTS: Piper, a fast neural engine running in real time on CPU alone with 20+ voice packs.[^108][^124][^107]

| Layer | Repo | Rationale |
|---|---|---|
| Speech-to-text (GPU-optimized) | SYSTRAN/faster-whisper | Best fit for NVIDIA GPU Python pipelines[^107][^108] |
| Speech-to-text (CPU/portable) | ggerganov/whisper.cpp | C/C++ port, lowest-dependency option, real-time streaming[^107][^108] |
| Text-to-speech | OHF-Voice/piper1-gpl (Piper) | Real-time CPU-only neural TTS, 20+ voice packs[^107][^108][^124] |

Wire voice as an alternate frontend adapter alongside the browser UI: mic → STT → the same `Conversation`/`Agent` core used by the GUI → TTS → speaker.[^108]

## Learning From Failures and Successes

The learning loop closes across telemetry (MLflow), persistent memory (Letta), evaluation harnesses, and now optionally local fine-tuning (Axolotl/Unsloth). Failed runs feed root-cause analysis (planning vs. execution failure) and the fix is written back into Letta's self-editing memory before the next attempt, using the ACE generation-reflection-curation cycle rather than a blunt overwrite; successful runs are mined for reusable few-shot examples, "what worked" memory blocks, or curated fine-tuning data.[^125][^13][^38][^36][^42]

## Observability and Tracing

MLflow's experiment tracking answers whether a new version performed better in aggregate, but it does not answer why a specific run failed step-by-step — that requires request-level tracing. Langfuse, self-hostable and OpenTelemetry-native, captures full traces of prompts, tool calls, token usage, and cost per step, exposing an OTLP endpoint that any OTel-instrumented library can send to. Note that the OpenTelemetry GenAI semantic conventions (the `gen_ai.*` span/attribute namespace Langfuse and comparable backends consume) remain in **Development** status as of 2026 with no stabilization date committed — pin the semconv version explicitly in the `TraceCollector` adapter and treat schema drift as an expected adapter-level maintenance item, not a one-time integration, given the system's 10-20 year horizon.[^162] Model this as a `TraceCollector` port alongside the existing `MemoryStore` and telemetry ports: the agent core emits OTel spans around every LLM call and tool invocation, and Langfuse (or any other OTel-compatible backend) consumes them without the core knowing which backend is attached. This closes the debugging gap left by aggregate-only metrics — a failed run can be traced turn-by-turn to find exactly which tool call or prompt caused the failure, then fed into the failure-learning loop already defined.[^126][^109][^127][^64][^42]

## Secrets Management

The design specifies API keys, model credentials, and notification tokens (SMTP, Slack, Telegram) but never states how they are stored, which is a real gap for a system meant to be vendored, forked, and run for 10-20 years. SOPS (`getsops/sops`) encrypts secrets-as-code in YAML/JSON/ENV formats using `age` or PGP keys, keeping secrets safely committable to the same repo as everything else rather than requiring a separate vault service — consistent with the single-user, local-first mandate and avoiding the cloud-control-plane dependency a hosted vault would introduce. Treat secrets as a `SecretsStore` port: the default adapter is SOPS-encrypted files decrypted at process start via an `age` key held only on the local workstation, with the option to swap in a different backend later without touching any code that consumes secrets.[^5][^110]

## Context Window Management and Compaction

Long autonomous sessions inevitably approach context limits, and the design as written has no explicit answer for this. Production agents (Codex, Claude Code) implement compaction: when context crosses a high-water mark (commonly ~75% of budget), a dedicated model call collapses old turns into a structured summary — goals, decisions made, files changed, open TODOs — rather than silently truncating or losing early instructions. This is a distinct concern from the `MemoryStore` port already defined for cross-session memory; compaction is intra-session, keeping a single long-running task coherent, whereas Letta's memory blocks are inter-session, carrying lessons across tasks. `mem0ai/mem0` provides a directly usable OSS memory layer that externalizes conversational state outside the active context window, and `gkamradt/LLMTest_NeedleInAHaystack` is the standard benchmark for verifying how much of a model's stated context window is actually usable before recall degrades ("lost in the middle"). Wire compaction as a `Condenser` component inside the agent core, implementing the write/select/compress/isolate cascade — deterministic truncation and eviction first, LLM summarization only as the expensive backstop — triggered automatically at the high-water mark rather than left to the model to self-manage.[^29][^111][^31][^18][^36]

## Parallel Agent Execution

The design as written assumes one agent working one task at a time, but real workloads benefit from running several agent instances concurrently — e.g., building three independent features from the same spec-kit task breakdown simultaneously. The established OSS pattern is git-worktree-per-agent isolation: each parallel agent instance gets its own working directory and branch checked out via `git worktree add`, so agents never collide on the same files, and a single orchestrating session tracks all active worktrees. This composes directly with the orchestrator-worker loop pattern established above: the supervisor node delegates independent worktree-scoped tasks to worker sub-agents, each with an isolated context window per the "Isolate" context-engineering strategy. `rielj/pi-git-worktrees` is a direct reference implementation of this orchestration pattern and can be vendored rather than rebuilt. This composes cleanly with the existing sandbox design: each worktree gets its own ephemeral container/gVisor sandbox, so parallelism adds no new isolation risk beyond what is already specified.[^33][^68][^43][^67][^19]

## Deployment Target for Generated Applications

The spec-to-build pipeline (GTPlanner → spec-kit → implementation) builds and tests applications, but must also specify how those generated apps actually get run afterward. Given the single-workstation, local-first mandate, the correct default is for the pipeline's final implementation stage to always emit a `docker-compose.yml` alongside the generated code, giving every built application a self-contained, portable run target with no manual deployment configuration required. This is a pipeline convention rather than a new dependency — spec-kit's `Implement` phase treats "generate and validate `docker-compose.yml`" as a standard task in every build's task list, verified by actually running `docker compose up` as part of the self-verification loop.[^18][^24]

## Design for Swappability: Hexagonal Architecture

Every external dependency is a **port** — a stable interface in domain vocabulary — never importing a vendor SDK directly into the agent core. Adapters implement ports: swapping vLLM for llama.cpp, LanceDB for Chroma, Apprise's email adapter for Slack, or llm-guard for vigil-llm, means writing a new adapter, not touching the reasoning loop. This is the pattern that let Netflix and other long-lived systems swap databases, UIs, and technologies without rewriting core logic. Key ports: `ModelClient`, `VectorStore`, `LSPClient`, `SandboxRuntime`, `MemoryStore`, `ToolProtocol`, `KnowledgeSearch`, `NotificationChannel`, `VoiceIO`, `TraceCollector`, `SecretsStore`, `InputGuard`/`OutputFilter`, `DependencyGuard`, and `Condenser`.[^20][^128][^21][^15][^106][^48][^5][^151][^153]

## Design for Fast Development

Provider adapters do pure serialization; backend adapters do pure execution wiring — both mechanical and fast to write and test in isolation. Vendoring OpenHands' SDK, LangGraph's checkpointer, VectorCode, spec-kit, MLflow, Apprise, Langfuse, SOPS, mem0, llm-guard, and the whisper.cpp/Piper voice stack means most of the hexagon's "boring" adapters already exist. Forking OpenHands' React/Vite/Monaco/Xterm skeleton and layering `shadcn/ui`, `assistant-ui`, Aceternity, and Magic UI gives the same speed advantage for a visually polished frontend without rebuilding from scratch. Adopting AGENTS.md as the single static-knowledge format, rather than maintaining separate CLAUDE.md/.cursorrules variants, avoids duplicated maintenance across whichever coding agent or IDE integration is used during the build itself.[^129][^84][^83][^86][^93][^20][^47][^25][^5]

## Design for a 10-20 Year Lifespan

The domain core has zero framework dependencies and is testable without any live LLM, database, or sandbox running. Rules: keep tool contracts versioned and owned by the project; never let the domain import an adapter directly; expect wholesale adapter replacement over a decade while domain contracts persist; avoid over-abstraction — more than 2-4 adapters per port signals speculative future-proofing. Prefer copy-in component source (shadcn/ui, Aceternity, Magic UI) over black-box npm dependencies so UI code remains fully owned a decade out. Notification, voice, search, tracing, secrets, and injection-defense integrations (Apprise, whisper.cpp/Piper, SearXNG, Langfuse, SOPS, llm-guard) are all single-purpose, dependency-light OSS projects with no vendor lock-in. Database schema changes ship as versioned Alembic migrations rather than ad-hoc drift, keeping persisted state traceable across a decade of evolution the same way tool contracts are. Review and update harness middleware (compaction triggers, reasoning-optimization layers) with every major underlying model update — a middleware layer tuned for one model generation can become counterproductive against the next.[^130][^128][^21][^131][^84][^85][^93][^20][^107][^106][^118][^64][^110][^48][^22][^5][^56]

## Design for Continuous Improvement Through Use

A feedback/telemetry port routes every completed task's structured outcomes into MLflow as a durable, queryable store. Langfuse's request-level traces supply the step-by-step detail MLflow's aggregate metrics cannot, letting root-cause analysis pinpoint exactly which tool call or prompt caused a failure. Letta's self-editing memory blocks act on that feedback at the prompt/memory level via the ACE generation-reflection-curation cycle, while Axolotl/Unsloth close the loop at the weights level for curated successful trajectories. Periodic evaluation sweeps (pass@k/pass^k, Agent-as-a-Judge) against logged trajectories gate any self-modification — prompt, memory, or fine-tune — through the champion/challenger promotion pattern before it becomes default behavior.[^132][^133][^127][^63][^37][^64][^13][^38][^36][^5][^42]

## Recommended Free, OSS, Linux-Native Tech Stack

### Backend

| Layer | Recommended OSS | Rationale |
|---|---|---|
| Agent core / orchestration | OpenHands Software Agent SDK or LangGraph | Purpose-built coding-agent abstractions with immutable typed components and deterministic replay[^16][^18]; LangGraph adds richest checkpointing and interrupt-based approval if built from scratch[^45][^46] |
| LLM interface | LiteLLM | Unified provider-agnostic interface across local and hosted models[^18] |
| Local inference (single-agent) | llama.cpp / Ollama | Lowest TTFT for single-user agentic tool-call patterns[^70][^72] |
| Local inference (multi-agent) | vLLM | Continuous batching + PagedAttention scale under concurrent load[^71][^72] |
| Sandboxing (default) | Docker + hardened seccomp/AppArmor | Sufficient for ~95% of self-hosted, single-user agent workloads[^68] |
| Sandboxing (escalated) | gVisor (`runsc`) | Userspace kernel interception, near-container speed[^67][^68] |
| Code retrieval / embeddings | VectorCode or LanceDB | File-based, dependency-light vector stores purpose-fit for codebase RAG[^75][^76] |
| Persistent agent memory | Letta | Apache 2.0, self-editing memory blocks, ACE-style curation[^65][^38] |
| Tool execution primitives | `libtmux`, `browser-use` | Standard tool backends used in OpenHands' tools package[^16] |
| Server/API layer | FastAPI + WebSockets, SQLAlchemy | Matches OpenHands agent-server design[^16][^18] |
| Database migrations | Alembic | Versioned, ordered schema migrations for all persisted state[^56] |
| External tool protocol | Model Context Protocol (MCP) | Standardized, vendor-neutral tool integration[^17] |
| Static agent knowledge layer | AGENTS.md standard | Hierarchical, tool-agnostic repository instructions[^25][^26] |
| Spec-to-build pipeline | spec-kit + spec-kit-bdd + GTPlanner | Idea → PRD → spec → plan → tasks → tested implementation[^24][^114][^115] |
| Local-first retrieval fallback | SearXNG | Self-hosted, no-tracking metasearch[^55][^118] |
| Prompt injection / adversarial content defense | llm-guard or vigil-llm | Layered input/output scanning against injected instructions[^48][^121] |
| Experiment tracking / self-upgrade gating | MLflow | Run tracking, model/prompt registry, champion/challenger promotion[^63][^37] |
| Evaluation harness | lighteval, continuous-eval, awesome-evals patterns | pass@k/pass^k, trajectory grading, retrieval-specific metrics[^42] |
| Local fine-tuning | Axolotl or Unsloth | Single-GPU LoRA/QLoRA fine-tuning on curated trajectories[^13] |
| Notification | Apprise | 100+ channel notification library[^106] |
| Voice STT/TTS | faster-whisper / whisper.cpp + Piper | Fully local, offline speech pipeline[^107][^108][^124] |
| Observability / tracing | Langfuse (self-hosted, OpenTelemetry-native) | Request-level trace of prompts, tool calls, tokens, cost per step[^64][^109] |
| Secrets management | SOPS (`getsops/sops`) + `age` | Encrypted secrets-as-code, no separate vault service required[^110] |
| Context compaction / long-session memory | `mem0ai/mem0` + OpenHands SDK `Condenser` | Externalized conversational state, write/select/compress/isolate cascade[^31][^18][^29] |
| Parallel agent orchestration | Git worktrees (`rielj/pi-git-worktrees` pattern) | Per-agent working directory/branch isolation for concurrent tasks[^43] |
| Generated-app deployment target | Docker Compose (pipeline-generated `docker-compose.yml`) | Self-contained, portable run target for every spec-built application[^18][^24] |
| Symbol-precise code retrieval | oraios/serena (LSP-based, MCP-exposed) | Definitions, references, safe renames beyond embedding/grep recall[^151] |
| Dependency/supply-chain verification | Custom `DependencyGuard` (registry-age + lockfile pinning) | Blocks slopsquatting attacks from AI-hallucinated package names[^153][^154] |
| Durable side-effect execution | SQLite idempotency ledger (or Temporal for stricter guarantees) | Exactly-once guarantee for side effects across checkpoint replay[^155][^156] |
| Tool invocation efficiency | Code-execution-with-MCP pattern + Agent Skills progressive disclosure | Up to 98.7% token reduction on tool-heavy phases[^158][^159] |

### Frontend

| Layer | Recommended OSS | Rationale |
|---|---|---|
| App framework | React 19 + React Router 7 + Vite | File-based routing, fast HMR[^83] |
| Server state | TanStack Query | Streaming/event-sourced agent state[^83] |
| Client state | Zustand | Lightweight UI-only state[^83] |
| Styling/components | Tailwind CSS v4 + shadcn/ui | Copy-in, fully-owned component source[^84][^85] |
| Chat/agent UI primitives | assistant-ui | Composable primitives with native streaming[^86] |
| Agent-specific components | 21st.dev agent-elements | Pre-built tool-call cards and plan/todo components[^81] |
| Code editor | Monaco Editor | Same engine as VS Code, inline diff view[^83][^87] |
| Terminal emulator | Xterm.js | Browser terminal paired with backend `libtmux`[^83] |
| Animation engine | Motion for React | Spring/gesture physics, layout transitions[^91][^90] |
| Animated component source | Aceternity UI + Magic UI | Copy-in signature visual components[^92][^95] |
| Testing | Vitest + Playwright | Fast, Linux-native unit and e2e testing[^83] |

## Recommended Repos to Vendor / Port From

### Backend

| Component | Repo | License | What to take |
|---|---|---|---|
| Agent core/SDK | OpenHands/software-agent-sdk | MIT | `Agent`, `Conversation`, `Condenser`, `SecurityAnalyzer` classes[^134][^135] |
| Full reference product | OpenHands/OpenHands | MIT | Complete app wiring (agent server + frontend)[^136][^137] |
| Agent server (REST/WS) | `openhands-agent-server` | MIT | FastAPI + WebSocket server exposing the SDK[^138] |
| Graph orchestration + checkpointing | langchain-ai/langgraph | MIT | `StateGraph`, Postgres checkpointers, `interrupt_before`/`interrupt_after` for approval gates[^139][^140][^46] |
| Persistent agent memory | letta-ai/letta | Apache 2.0 | Self-editing memory-block architecture; `letta-ai/agent-file` for `.af` serialization[^36][^132] |
| Memory-first CLI harness | letta-ai/letta-code | — | Reference for wiring Letta memory into a coding-agent CLI[^141] |
| Codebase RAG/indexing | Davidyz/VectorCode | — | Tree-sitter chunking + Chroma-backed indexing, MCP server wrapper[^78] |
| Embedded vector store | lancedb/lancedb | Apache 2.0 | Rust-backed embedded vector DB with hybrid search[^77][^142] |
| Browser tool | browser-use/browser-use | MIT | Playwright-based browser-control tool[^143][^144] |
| Terminal tool | tmux-python/libtmux | MIT | Typed Python wrapper over tmux[^145] |
| Sandbox runtime | google/gvisor | Apache 2.0 | `runsc` OCI-compliant runtime, drop-in Docker swap[^146][^147][^148] |
| Database migrations | sqlalchemy/alembic | MIT | Versioned schema migration scripts for all persisted state[^56] |
| AGENTS.md reference/spec | agentsmd/agents.md | Open standard | Hierarchical repository instruction format specification[^25][^26][^27] |
| Idea → PRD generation | OpenSQZ/GTPlanner | — | Natural-language idea → structured PRD generator[^115] |
| Spec-driven build pipeline | github/spec-kit | MIT-style OSS | `specify` CLI driving Constitution/Specify/Plan/Tasks/Implement[^24][^117] |
| Spec → executable tests | spec-kit-bdd | Community extension | Acceptance criteria → Gherkin scenarios and step-definition stubs[^114] |
| Self-hosted web search fallback | searxng/searxng | AGPL | No-tracking metasearch, Docker Compose deployable[^118][^119] |
| SearXNG-agent integration reference | LearningCircuit/local-deep-research | — | Reference for wiring SearXNG into an agent's retrieval loop[^120] |
| Prompt injection defense | protectai/llm-guard | — | Modular input/output scanners for injection, PII leakage, toxic output[^48] |
| Stacked injection detection | deadbits/vigil-llm | — | Vector-similarity, YARA-rule, and transformer-classifier scanning layers[^48][^121] |
| Experiment tracking / model registry | mlflow/mlflow | Apache 2.0 | Run tracking, champion/challenger registry[^63][^122] |
| Curated eval tooling index | benchflow-ai/awesome-evals | — | Pass@k/pass^k patterns, Agent-as-a-Judge references[^42] |
| Cross-backend eval harness | huggingface/lighteval | — | Evaluation harness across model backends, 1000+ tasks[^42] |
| Retrieval-specific eval | relari-ai/continuous-eval | — | Modular metrics separating retriever vs. generator errors[^42] |
| Local fine-tuning | axolotl-ai-cloud/axolotl or unslothai/unsloth | Apache 2.0 | Single-GPU LoRA/QLoRA fine-tuning, registered via MLflow[^13] |
| Notification | caronc/apprise | — | 100+ notification services (email, Slack, Telegram, Discord)[^106][^123] |
| Speech-to-text (GPU) | SYSTRAN/faster-whisper | — | CTranslate2-optimized Whisper inference[^107][^108] |
| Speech-to-text (CPU/portable) | ggerganov/whisper.cpp | MIT | C/C++ Whisper port, real-time streaming[^107][^108] |
| Text-to-speech | OHF-Voice/piper1-gpl | GPL | Real-time CPU-only neural TTS[^107][^108][^124] |
| Observability / tracing | langfuse/langfuse | Self-host OSS | Self-hosted OTel-native tracing backend, OTLP ingestion endpoint[^64][^109] |
| Secrets management | getsops/sops | MPL-2.0 | Encrypted secrets-as-code (YAML/JSON/ENV) via `age`/PGP[^110] |
| Long-session memory / compaction | mem0ai/mem0 | Apache 2.0 | Externalized memory layer for context compaction beyond the active window[^31] |
| Context-window benchmarking | gkamradt/LLMTest_NeedleInAHaystack | — | Standard benchmark for verifying effective (not stated) context window size[^31] |
| Parallel agent orchestration | rielj/pi-git-worktrees | — | Reference implementation of per-agent git-worktree isolation[^43] |
| Symbol-precise code retrieval | oraios/serena | — | LSP-wrapped MCP server for definitions/references/renames[^151] |
| Edit-format reference | Aider (`aider-AI/aider`) | Apache 2.0 | Search/replace vs. whole-file edit-format benchmarking reference[^157] |
| Code-execution-with-MCP reference | Anthropic engineering blog pattern (no single canonical repo) | — | Agent-writes-code-to-call-tools pattern for token-efficient tool use[^158] |
| Benchmark tracking | princeton-nlp/SWE-bench, laude-institute/terminal-bench | MIT | Named, versioned public benchmarks for capability claims[^160][^161] |

### Frontend

| Component | Repo | License | What to take |
|---|---|---|---|
| Full frontend reference | `All-Hands-AI/OpenHands` `frontend/` | MIT | Entire React/Vite/Monaco/Xterm wiring, fork as starting skeleton[^83][^82] |
| Standalone UI component library | `openhands-ui` | MIT | Decoupled React component library[^82] |
| Component system | `shadcn-ui/ui` | MIT | Copy-in accessible component source[^84] |
| Chat/thread primitives | `assistant-ui/assistant-ui` | MIT | Streaming message list, thread, composer, toolbar[^86] |
| Agent tool-call UI | 21st.dev `agent-elements` registry | Open registry | Pre-built tool-call cards, plan/todo components[^81] |
| Code editor integration | `@monaco-editor/react` | MIT | Drop-in React wrapper around Monaco[^83] |
| Terminal integration | `xtermjs/xterm.js` | MIT | Browser terminal emulator paired with backend `libtmux`[^83] |
| Diff viewing reference | `wtnqk/ftdv` | — | Reference for file-tree + diff navigation UX[^149] |
| Animation engine | `motiondivision/motion` | MIT | Core `motion.div` primitives, spring physics, layout transitions[^91][^90] |
| Copy-in animated components | Aceternity UI component source | Open/copy-paste | 3D card, spotlight, globe, beam effects[^92][^93] |
| Copy-in animated components | `magicuidesign/magicui` | MIT | Marquee, bento-grid, particles, animated-list components[^95][^96][^150] |
| Aurora/gradient background reference | Community aurora-background component | Copy-in | Animated hero background using layered radial gradients[^97] |
| 3D/WebGL (optional) | `pmndrs/react-three-fiber` | MIT | React renderer for Three.js, one deliberate 3D centerpiece[^92] |

## Porting Priority

Backend: fork `software-agent-sdk` directly as the core, bolt on LangGraph's Postgres checkpointer only if richer time-travel debugging is needed beyond `Conversation.fork()`, vendor VectorCode for retrieval, install `runsc` as a Docker runtime, wire spec-kit's Implement phase directly into the agent's task queue, write the initial AGENTS.md alongside the spec-kit constitution before any code is generated, and stand up MLflow, Apprise, Langfuse, SOPS, and llm-guard early since all five are consumed by every other subsystem's telemetry, notification, tracing, secrets, and safety calls. Add Alembic as soon as the agent-server database schema is defined, not retroactively. Build the minimal evaluation harness (four scores, ~50 examples) before adding the Reflexion loop or any multi-agent orchestration, since loop complexity without an evaluation harness makes regressions invisible.[^134][^139][^146][^78][^74][^16][^63][^106][^64][^110][^48][^35][^25][^24][^56][^18]

Frontend: fork OpenHands' `frontend/` as the skeleton, layer `shadcn/ui` for new components, replace or extend the chat surface with `assistant-ui` primitives, pull tool-call card designs from 21st.dev's `agent-elements` registry, and layer in Aceternity/Magic UI plus Motion for the signature visual moments — reserving them for low-frequency, high-impact surfaces rather than the entire app.[^84][^83][^86][^93][^80][^81][^82][^88]

Voice, search, and orchestration: SearXNG, the whisper.cpp/Piper stack, mem0, and the git-worktree parallelism pattern are self-contained additions with no dependency on the rest of the build, so they can be stood up and integrated in parallel with core development rather than gating it. Fine-tuning (Axolotl/Unsloth) is a later-stage addition, deferred until enough curated successful trajectories exist in MLflow/Letta to make a fine-tuning pass meaningful.[^107][^118][^31][^43][^13]

## Key Trade-offs and Open Risks

The single biggest architectural tension is isolation depth versus latency/complexity: stronger sandboxing (Firecracker, gVisor) adds startup latency and operational overhead a single-user local agent often does not need, while weaker isolation (plain Docker) is explicitly called out by OWASP's Agentic AI Top 10 as insufficient for any code the agent did not write itself. The second major trade-off is inference engine choice: llama.cpp/Ollama optimizes for the common case but caps out under concurrency, while vLLM's throughput advantage only materializes past roughly 4 concurrent requests. Framework selection carries a similar caveat: LangGraph's checkpointing is unmatched for resumability, but CrewAI scaffolds faster for teams of specialist sub-agents, and OpenHands SDK's software-engineering-specific tool set gives a head start a generic framework would require rebuilding. Spec-kit itself is described as "greenfield-optimized," with its branch-per-spec model treating specs as change artifacts rather than long-lived capability contracts — a real friction point for a system meant to run for 10-20 years. Self-improvement introduces its own risk: without disciplined champion/challenger gating, an agent that "learns" from noisy or small-sample outcomes can degrade rather than improve, which is why the MLflow promotion pattern and pass^k reliability metric are treated as mandatory — and the same gating now extends to fine-tuned weights, not just prompts and memory. On the visual side, the same discipline applies: 2026's own trend data shows constant animation and decorative gloss actively work against user trust, so signature "wow" moments must remain sparse and purposeful rather than pervasive. Aggressive context compaction carries its own risk of losing subtle but important early instructions if the summarization step is not carefully designed, which is why compaction is modeled as an explicit, inspectable `Condenser` step implementing the write/select/compress/isolate cascade rather than an invisible background process. Parallel agent execution via git worktrees eliminates file collisions but does not eliminate resource contention (GPU/VRAM, LLM serving capacity), so concurrent agent count should be bounded by the local inference engine's proven concurrency ceiling established earlier. Prompt injection defense is inherently probabilistic — no scanner catches every adversarial pattern, so layered defense (input scanning, output filtering, least-privilege tool authorization) reduces but does not eliminate risk, meaning the human-approval-gate design remains the last line of defense.[^113][^121] Supply-chain risk from AI-hallucinated dependencies is likewise probabilistic and additive to prompt-injection risk rather than a subset of it — a registry-age/allowlist check reduces but does not eliminate slopsquatting exposure, since a sufficiently aged malicious package would pass an age-based filter.[^153][^154] Durable-execution guarantees for side effects add a small but real latency/complexity cost (idempotency-key generation and a completion ledger on every state-changing call) that must be weighed against the correctness gap it closes; for a genuinely single-user local system, this cost is worth paying once, since duplicate side effects (double-sent notifications, double-applied file edits) are a worse failure mode than the added latency. Finally, the LSP-layer addition to retrieval introduces its own operational cost — language servers must be started and kept warm per language in the target codebase — so the `LSPClient` port should lazy-start servers only for languages actually present in the active worktree rather than eagerly for every supported language.se for consequential actions. Adding Reflexion or plan-and-execute to the loop increases latency (~30% typical) and cost, so these additions must be evaluation-gated — added only where the baseline ReAct loop demonstrably fails, not by default. Finally, the hexagonal boundary itself carries a discipline cost: over-abstracting ports that never receive a second adapter adds indirection without payoff, so ports should be introduced only where a real, foreseeable swap exists.[^72][^128][^116][^16][^71][^103][^37][^89][^111][^31][^43][^48][^113][^13][^29][^35][^45][^67][^42][^88][^18]

---

## References

1. [vLLM vs TensorRT-LLM vs Ollama vs llama.cpp](https://explore.n1n.ai/blog/vllm-vs-tensorrt-llm-vs-ollama-vs-llamacpp-rtx-5090-2026-03-14) - An in-depth technical comparison of leading LLM inference engines on the NVIDIA RTX 5090, With 32GB ...

2. [Platform Abstraction and Backend Selection | koush/vllm ...](https://deepwiki.com/koush/vllm/4.1-platform-abstraction-and-backend-selection) - The Platform Abstraction layer provides a unified interface for vLLM to interact with diverse hardwa...

3. [Hardware and Platform Support | vllm-project/vllm | DeepWiki](https://deepwiki.com/vllm-project/vllm/6-advanced-features) - This document covers vLLM's multi-platform hardware abstraction system, which enables vLLM to run ef...

4. [vLLM](https://vllm.ai/) - High-throughput and memory-efficient inference and serving engine for Large Language Models. Deploy ...

5. [Ports and Adapters for Agents: Why Your Tool Schemas ...](https://tianpan.co/blog/2026-07-02-ports-and-adapters-for-agents) - Provider migrations break at the tool layer, not the prompt. Treat tool schemas as ports you own — w...

6. [Working GPU setup with torch 2.9.0 cu128](https://discuss.vllm.ai/t/vllm-on-rtx5090-working-gpu-setup-with-torch-2-9-0-cu128/1492) - Your summary is accurate: for RTX 5090 (Blackwell, sm_120), the only reliable way to run vLLM as of ...

7. [RTX 5090 for local LLM inference: the new watermark · MadCoolStuff](https://madcoolstuff.com/reviews/rtx-5090-local-inference) - 32 GB VRAM and Blackwell sm_120, enough to run 32B-class models at high quants without paging or 70B...

8. [malkaf/vllm-blackwell-optimizer repository overview](https://hub.docker.com/r/malkaf/vllm-blackwell-optimizer)

9. [Running a Local LLM with Claude Code and llama.cpp on ...](https://forums.developer.nvidia.com/t/running-a-local-llm-with-claude-code-and-llama-cpp-on-jetson-thor-and-rtx-5090/364740) - Hey everyone! I wanted to share my setup for running Qwen3.5-27B (Claude 4.6 Opus reasoning-distille...

10. [vLLM vs TensorRT-LLM vs Ollama vs llama.cpp — Choosing the Right Inference Engine on RTX 5090](https://www.youtube.com/watch?v=Lp3eGBmGgUI) - A practical, experience-based comparison of four LLM inference engines on RTX 5090 (32GB VRAM). Why ...

11. [Why I Ditched llama.cpp for vLLM on My RTX 5090](https://www.reddit.com/r/LocalLLaMA/comments/1pll1if/why_i_ditched_llamacpp_for_vllm_on_my_rtx_5090/) - TL;DR: Switched from llama.cpp to vLLM on RTX 5090 for a 915 LoC NextJS refactor and saw massive imp...

12. [Best RTX 5090 AI Stack: 5 Tools Tested for Local LLM Inference](https://markaicode.com/best/best-rtx-5090-ai-stack/) - Find the best AI stack for RTX 5090 GPU. We test Ollama, vLLM, LM Studio, LLaMA.cpp, and ExLlamaV2 f...

13. [axolotl/docs/unsloth.qmd at main · axolotl-ai-cloud/axolotl](https://github.com/axolotl-ai-cloud/axolotl/blob/main/docs/unsloth.qmd) - Go ahead and axolotl questions. Contribute to axolotl-ai-cloud/axolotl development by creating an ac...

14. [aliez-ren/vllm-qwen3.5-nvfp4-sm120](https://github.com/aliez-ren/vllm-qwen3.5-nvfp4-sm120) - Contribute to aliez-ren/vllm-qwen3.5-nvfp4-sm120 development by creating an account on GitHub.

15. [Implementing Hexagonal Architecture - Agentic Design](https://agentic-design.ai/ai-driven-dev/hexagonal-architecture) - Step-by-step guide to implementing hexagonal architecture patterns with AI-assisted code generation.

16. [OpenHands/software-agent-sdk | DeepWiki](https://deepwiki.com/OpenHands/software-agent-sdk/1-overview) - The OpenHands Software Agent SDK is a set of Python and REST APIs for building AI agents that work w...

17. [Design Principles](https://docs.openhands.dev/sdk/arch/design)

18. [Overview](https://docs.openhands.dev/sdk/arch/overview)

19. [Modern Agent Harness Blueprint 2026 - Github-Gist](https://gist.github.com/amazingvince/52158d00fb8b3ba1b8476bc62bb562e3) - Modern Agent Harness Blueprint 2026. GitHub Gist: instantly share code, notes, and snippets.

20. [Hexagonal Architecture - Ports ans Adapters Pattern](https://jmgarridopaz.github.io/content/hexagonalarchitecture.html) - An article explaining Hexagonal Architecture

21. [Hexagonal architecture (software) - Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))

22. [Harness Engineering Guide: Build Systems That Make AI… | NxCode](https://www.nxcode.io/resources/news/harness-engineering-complete-guide-ai-agent-codex-2026) - Harness engineering is the new discipline of designing environments, constraints, and feedback loops...

23. [Harness Engineering for AI Agents in 2026: Guide & Tools](https://ones.com/blog/solution-guide/harness-engineering-ai-agents-2026-3/) - Learn how harness engineering transforms LLMs into reliable AI agents in 2026. Discover core compone...

24. [github/spec-kit: 💫 Toolkit to help you get started with ...](https://github.com/github/spec-kit) - 💫 Toolkit to help you get started with Spec-Driven Development - github/spec-kit

25. [Agents Standard — The AGENTS.md Hierarchical Configuration Standard](https://agentsstandard.com/) - The open standard for AI agent configuration. AGENTS.md files cascade from global → project → folder...

26. [Format Specification | openai/agents.md | DeepWiki](https://deepwiki.com/openai/agents.md/5.1-format-specification) - This document provides the technical specification for the AGENTS.md format, including file structur...

27. [AGENTS.md Specification | agentsmd/agents.md | DeepWiki](https://deepwiki.com/agentsmd/agents.md/7-agents.md-specification) - This document describes the AGENTS.md file format specification that AI coding agents use to underst...

28. [Context Engineering for AI Agents: The 2026 Stack That ...](https://agentmelt.com/blog/ai-agent-context-engineering-guide/) - Context engineering is the 2026 shift from clever prompts to deliberately assembled context — system...

29. [Context Engineering for Long-Running AI Agents | Zylos Research](https://zylos.ai/research/2026-06-20-context-engineering-long-running-agents/) - How production AI agents manage their context windows — from dynamic assembly and compression to mul...

30. [Context Engineering: A Practical Guide for AI Agents (2026)](https://sourcegraph.com/blog/context-engineering) - A practical guide to context engineering for AI agents: the four pillars, how it differs from prompt...

31. [Context Engineering & Management — The LLM Stack](https://prakashkagitha.github.io/llm-stack-book/08-agents-harness/04-context-engineering.html) - The context window as the scarce resource: what to put in it, retrieval vs stuffing, compaction/summ...

32. [Agent Harness Design Patterns - Zylos Research](https://zylos.ai/research/2026-03-31-agent-harness-design-patterns/) - A deep technical analysis of emerging agent harness design patterns — from Anthropic's GAN-inspired ...

33. [Context Engineering for LLM Agents (Production-Ready Agents #3)](https://www.youtube.com/watch?v=cD2D_gRESaA) - Context windows fill up fast in long-running agent tasks. When agents hit their token limits, they l...

34. [AI Agent Determinism and Control: A Practical Guide - Gravity](https://gravity.fast/blog/ai-agent-determinism-and-control/) - LLM-based agents are probabilistic by default. Learn the practical levers teams use to add determini...

35. [Agent Architecture Patterns: 2026 Taxonomy Guide](https://www.digitalapplied.com/blog/agent-architecture-patterns-taxonomy-2026) - ReAct, Reflexion, plan-execute, multi-agent debate, swarm, hierarchy, blackboard, graph-orchestrated...

36. [letta-ai/letta: Platform for stateful agents: AI with advanced ...](https://github.com/letta-ai/letta) - This repository contains the legacy Letta server. Active development has moved to the Letta Agent re...

37. [MLflow Production Guide: Experiment Tracking, Model Registry, and ...](https://www.youngju.dev/blog/ai-platform/2026-03-07-ai-platform-mlflow-experiment-tracking-model-registry.en) - A comprehensive guide to MLflow covering experiment tracking at scale, model registry lifecycle mana...

38. [Agentic Context Engineering: Evolving Contexts for Self-Improving ... - arXiv](https://arxiv.org/abs/2510.04618) - Large language model (LLM) applications such as agents and domain-specific reasoning increasingly re...

39. [Re-Act Style Agent Loops: Think–Act–Observe and 9+ Patterns You Should Know.   Part 2](https://www.youtube.com/watch?v=gH3kpzFWIAA) - AI Agent Loop Patterns — Part 2: Iterate, Reflect, Memory & Planning

Welcome back. Part 2 is where ...

40. [ReAct + Reflexion Agentic Design Patterns for Explicit ...](https://gm-spacagna.medium.com/react-reflexion-agentic-design-patterns-for-explicit-reasoning-1bb60dcdb611) - Why think and reflect steps matter for traceability, planning, and error recovery.

41. [Re-Act Style Agent Loops: Think–Act–Observe and 9+ Patterns You Should Know. Build Better Agents!](https://www.youtube.com/watch?v=hjbZfVP6g2Q) - AI Agent Loop Patterns: ReAct, Memory, Planning, Reflection and More (Part 1)

Most “AI agents” are ...

42. [benchflow-ai/awesome-evals: A curated, non ...](https://github.com/benchflow-ai/awesome-evals) - A curated, non-BS library of the best resources for building and evaluating AI agents — papers, blog...

43. [Usage](https://github.com/rielj/pi-git-worktrees) - Contribute to RielJ/pi-git-worktrees development by creating an account on GitHub.

44. [LangGraph in Production: Building Stateful AI Agents](https://www.kalviumlabs.ai/blog/langgraph-in-production-stateful-multi-step-agents/) - State schema design is the most consequential decision in a LangGraph project. Two patterns to know ...

45. [Open-Source Agent Frameworks: 5 Tools Compared for 2026](https://www.digitalapplied.com/blog/open-source-agent-frameworks-5-compared-2026) - LangGraph vs AutoGen vs CrewAI vs OpenAI Swarm vs HuggingFace Smolagents — architecture, ergonomics,...

46. [Build Production AI Agents with Stateful Workflows (2026)](https://huzaifatahir.com/blog/langgraph-complete-guide) - Master LangGraph from first graph to production deployment. Complete guide covering state schemas, n...

47. [Software Development with AI: What Actually Works in 2026](https://securityboulevard.com/2026/05/software-development-with-ai-what-actually-works-in-2026/) - An honest practitioner's view of AI-assisted software development in 2026: what Cursor, Claude Code,...

48. [scadastrangelove/awesome-ai-security-tools](https://github.com/scadastrangelove/awesome-ai-security-tools) - A curated list of public-source, research, and commercial tools for AI security and AI-assisted cybe...

49. [AI-Powered Dev Workflows: How SWEs Are Shipping Faster in 2026](https://dev.to/jubinsoni/ai-powered-dev-workflows-how-swes-are-shipping-faster-in-2026-53ml) - By 2026, the role of the Software Engineer (SWE) has shifted from manual code authorship to...

50. [AI-Driven Development: A Practical 2026 Guide for Engineering ...](https://www.testmuai.com/blog/ai-driven-development/) - AI-driven development guide: spec-driven workflows, agent integration, QA pipelines, adoption roadma...

51. [7 AI Software Development Best Practices for 2026](https://blog.exceeds.ai/ai-software-development-best-practices/) - 1. Plan Before Coding (Tactical) · 2. Iterate in Small Modular Steps (Tactical) · 3. Master Multi-To...

52. [Agentic AI vs Deterministic Workflows with LLM Components](https://www.reddit.com/r/ExperiencedDevs/comments/1nqlm09/agentic_ai_vs_deterministic_workflows_with_llm/) - Best practices for governing agent workflows. Differences between AI agents and LLMs. Optimizing AI ...

53. [A Practical Guide for Designing, Developing, and ...](https://arxiv.org/html/2512.08769v1) - We introduce a structured methodology for designing, developing, and deploying agentic systems using...

54. [How do you decide what stays in model reasoning vs ...](https://community.openai.com/t/how-do-you-decide-what-stays-in-model-reasoning-vs-deterministic-workflow/1381280) - I’m trying to formalize a design pattern for production AI agents. My current split: High-value if: ...

55. [SearXNG](https://github.com/searxng) - Metasearch engine. SearXNG has 12 repositories available. Follow their code on GitHub.

56. [Alembic: The Ultimate Database Migration Tool](https://medium.com/@utkarshshukla.author/alembic-the-ultimate-database-migration-tool-f49348e86146) - Databases are an integral part of any software application, and as an application evolves over time,...

57. [【Rethinking Agent Harness，如何更好設計LLM Agent】Part1](https://axk51013.medium.com/rethinking-agent-harness-%E5%A6%82%E4%BD%95%E6%9B%B4%E5%A5%BD%E8%A8%AD%E8%A8%88-llm-agent-part1-behind-function-calling-e17c419c8e96) - 模型如何高效輸出合法的 function call 結構？

58. [How to design a multi-agent system that skips the LLM](https://www.youtube.com/watch?v=Fzd0BWMH65s) - Github repo → https://goo.gle/race-condition
Previous episode → https://goo.gle/marathonagent

A tho...

59. [LLM Tool Calling And Agent Orchestration — Tech Interview ...](https://prachub.com/concepts/llm-tool-calling-and-agent-orchestration)

60. [1. Autonomous Agent Loop](https://www.linkedin.com/pulse/deterministic-ai-architecture-when-let-llms-agents-decide-walid-negm-a9nye) - When building production-grade LLM applications, we seek to balance flexibility against predictabili...

61. [Agent system design patterns - Azure Databricks](https://learn.microsoft.com/en-us/azure/databricks/generative-ai/guide/agent-system-design-patterns) - An overview of recommended design patterns for generative AI agent systems. Includes practical advic...

62. [Agent system design patterns | Databricks on AWS](https://docs.databricks.com/aws/en/agents/agent-system-design-patterns) - Deterministic chains augment AI models with tool calling, but the developer defines which tools or m...

63. [GitHub - mlflow/mlflow: Open source platform for the machine learning lifecycle](https://github.com/mlflow/mlflow/tree/master) - Open source platform for the machine learning lifecycle - mlflow/mlflow

64. [Langfuse Intro - Observability & Tracing Deep Dive](https://www.youtube.com/watch?v=pTneXS_m1rk) - In this video our Co-Founder and CEO Marc walks you through the Observability and Tracing product of...

65. [Comparing Open-Source AI Agent Frameworks in 2026](https://futureagi.com/blog/oss-agent-frameworks-2026/) - Compare seven OSS agent frameworks for production teams in 2026, with architecture, license, maturit...

66. [Comparing Open-Source AI Agent Frameworks](https://langfuse.com/blog/2025-03-19-ai-agent-comparison) - Compare the leading open-source AI agent frameworks in 2026, including LangGraph, OpenAI Agents SDK,...

67. [Agent Sandboxing and Secure Code Execution: Matching ...](https://tianpan.co/blog/2026-03-09-agent-sandboxing-secure-code-execution) - A practical guide to the agent sandbox spectrum — from Docker containers to Firecracker microVMs — c...

68. [How to sandbox AI agent code execution on a self-hosted setup](https://openclawai.io/blog/how-to-sandbox-ai-agent-code-execution) - A practical 2026 guide to sandboxing AI agent code execution on your own hardware. Compares Docker, ...

69. [Sandbox & Isolation Patterns — Deep-Dives](https://menuagentic.com/deep-dives/agent-security/sandbox-and-isolation-patterns/) - Shared-kernel containers are no longer enough for agent-generated code — the 2026 tiers are microVMs...

70. [llama.cpp vs. vLLM: Choosing the right local LLM inference ...](https://developers.redhat.com/articles/2026/06/15/llamacpp-vs-vllm-choosing-right-local-llm-inference-engine) - Learn when to use llama.cpp and vLLM for local inference of large language models (LLMs). Discover t...

71. [Fastest Local LLM Setup: Ollama vs vLLM vs llama.cpp ...](https://insiderllm.com/pdfs/llamacpp-vs-ollama-vs-vllm.pdf)

72. [Local LLM Serving Stacks: vLLM vs Ollama vs llama.cpp for Agents](https://www.youtube.com/watch?v=rdUjuFhBE-I) - The serving layer — the software that loads a model, holds it resident, and manages concurrent reque...

73. [Llama.cpp vs vLLM: Which Local LLM Engine Actually Scales?](https://www.youtube.com/watch?v=0ujh7hfutq0) - Cedric Clyburn breaks down Llama.cpp versus vLLM for real‐world local inference. Learn which tool fi...

74. [How to Build LLM Agents 2026: Production Guide](https://futureagi.com/blog/build-llm-agents/) - Build production LLM agents in 2026: task scoping, model selection (gpt-5, claude-opus-4.5), tools, ...

75. [VectorCode: Code Repository Indexing for LLM RAG](https://dev.co/ai/rag/vectorcode) - Open-source Python tool for code repository indexing, embedding, and semantic retrieval to augment L...

76. [ggozad/haiku.rag: Retrieval Augmented Generation based ...](https://github.com/ggozad/haiku.rag) - Retrieval Augmented Generation based on LanceDB. Contribute to ggozad/haiku.rag development by creat...

77. [lancedb/lancedb: Developer-friendly OSS embedded ...](https://github.com/lancedb/lancedb) - LanceDB is a central location where developers can build, train and analyze their AI workloads. Demo...

78. [Davidyz/VectorCode: A code repository indexing tool ...](https://github.com/davidyz/vectorcode) - VectorCode is a code repository indexing tool. It helps you build better prompt for your coding LLMs...

79. [The best open source frameworks for building AI agents in ...](https://www.firecrawl.dev/blog/best-open-source-agent-frameworks) - Ten open source agent frameworks compared: LangGraph, CrewAI, AutoGen, Google ADK, Dify, OpenAI Agen...

80. [Best AI coding agent UX examples in 2026 - AYDesign](https://www.aydesign.ai/blog/best-ai-coding-agent-ux-examples-2026) - We made designs for future.

81. [birobirobiro/awesome-shadcn-ui](https://github.com/birobirobiro/awesome-shadcn-ui) - Agents UI is LiveKit's open source component library built with React and shadcn for designing voice...

82. [Project Structure and Technology Stack](https://deepwiki.com/All-Hands-AI/OpenHands/1.1-project-structure-and-technology-stack) - This document describes the physical organization of the OpenHands monorepo and the technology stack...

83. [Frontend Architecture and Technology Stack](https://deepwiki.com/All-Hands-AI/OpenHands/9.1-frontend-architecture-and-technology-stack) - This document describes the frontend application architecture, core technologies, and development in...

84. [GitHub - shadcn-ui/ui: A set of beautifully-designed, accessible components and a code distribution platform. Works with your favorite frameworks. Open Source. Open Code.](https://github.com/shadcn-ui/ui) - A set of beautifully-designed, accessible components and a code distribution platform. Works with yo...

85. [Your project is ready! - Shadcn UI](https://ui.shadcn.com/docs/new) - You've created a new project with shadcn/ui.

86. [assistant-ui/assistant-ui: Typescript/React Library for AI Chat](https://github.com/assistant-ui/assistant-ui) - The UX of ChatGPT in your React app. assistant-ui is an open-source TypeScript/React library to buil...

87. [GitHub - zoutepopcorn/simpIDE: Test to browser IDE: xterm + monaco + treejs](https://github.com/zoutepopcorn/simpIDE) - Test to browser IDE: xterm + monaco + treejs. Contribute to zoutepopcorn/simpIDE development by crea...

88. [What's Next: 7 UI Design Trends of 2026](https://tubikstudio.com/blog/ui-design-trends-2026/) - If the early 2020s were all about the glow-up—neumorphism, maximalism, glassmorphism—then 2026 is ab...

89. [10 UI/UX Trends Defining AI Apps in 2026](https://www.groovyweb.co/blog/ui-ux-design-trends-ai-apps-2026) - 12 UI/UX design trends shaping AI apps in 2026 — with real examples and why they matter. Design AI p...

90. [Motion for React: Get started - React Animation Library](https://motion.dev/docs/react) - Motion for React (previously Framer Motion) is a React animation library for building smooth, produc...

91. [README.md](https://cdn.jsdelivr.net/npm/framer-motion@12.23.9/README.md)

92. [GitHub Globe | Aceternity UI Components](https://ui.aceternity.com/components/github-globe) - A globe animation as seen on GitHub's homepage. Interactive and customizable.

93. [GitHub - hchiam/learning-aceternity](https://github.com/hchiam/learning-aceternity) - Contribute to hchiam/learning-aceternity development by creating an account on GitHub.

94. [Aceternity UI's design principles and aesthetics](https://gist.github.com/eonist/f131274670b1481ccfd5eb1450071461) - Aceternity UI's design principles and aesthetics. GitHub Gist: instantly share code, notes, and snip...

95. [Magic UI](https://github.com/orgs/magicuidesign/repositories) - Magic UI has 4 repositories available. Follow their code on GitHub.

96. [Build software better, together](https://github.com/topics/magicui) - GitHub is where people build software. More than 150 million people use GitHub to discover, fork, an...

97. [Aurora Background — Free React Component](https://ui.froiden.com/components/aurora-background/) - Mesmerizing aurora borealis gradient animation for hero sections. Free, production-ready React & HTM...

98. [The Best LLMs for Agentic Coding in 2026 (Real-World ...](https://dev.to/danishashko/the-best-llms-for-agentic-coding-in-2026-real-world-not-just-benchmarks-96n) - It's May 2026 and there are a lot of coding models to choose from. Everything below is based on my.....

99. [Top 50 AI Coding Agent Frameworks (Benchmarked May 2026)](https://o-mega.ai/articles/top-50-ai-coding-agent-frameworks-benchmarked-may-2026) - Ranked benchmark of 50+ AI coding agent frameworks in 2026. Compare real costs, performance insights...

100. [Best AI Coding Agents for 2026: Real-World Developer ...](https://www.faros.ai/blog/best-ai-coding-agents-2026) - TL;DR: The front-runners for 2026 are Cursor, Claude Code, Codex, GitHub Copilot, and Cline, and the...

101. [Best AI Coding Agents in 2026: Harness, Cost, and ...](https://www.firecrawl.dev/blog/best-ai-coding-agents) - A sourced comparison of the 8 best AI coding agents in 2026, ranked on harness depth, remote agents,...

102. [19 Top AI Coding Agents and Autonomous Systems (2026)](https://aiagentskit.com/blog/top-ai-coding-agents-autonomous-systems/) - Discover the 19 top AI coding agents and autonomous systems in 2026. Compare GitHub Copilot, Cursor,...

103. [Safe Code Execution Sandboxes for AI Agents: A 2026 ...](https://callsphere.ai/blog/vw5g-safe-code-execution-sandbox-agents-2026)

104. [Spec-driven development with AI: Get started with a new ...](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/) - Developers can use their AI tool of choice for spec-driven development with this open source toolkit...

105. [Spec-kit/spec-driven.md at main](https://github.com/github/spec-kit/blob/main/spec-driven.md) - 💫 Toolkit to help you get started with Spec-Driven Development - github/spec-kit

106. [caronc/apprise: Apprise - Push Notifications that work with ...](https://github.com/caronc/apprise) - Apprise - Push Notifications that work with just about every platform! - caronc/apprise

107. [Building a Local Voice Assistant: Whisper + LLM + TTS](https://www.local-llm.net/guides/local-voice-assistant/) - Build a fully local voice assistant pipeline with speech-to-text (Whisper.cpp), an LLM for processin...

108. [Local Voice Assistant 2026: Whisper + LLM + Piper TTS - PromptQuorum](https://www.promptquorum.com/power-local-llm/build-local-voice-assistant-2026) - whisper.cpp for STT, Ollama + Llama 3.3 8B for reasoning, Piper TTS for speech. 1–2 sec GPU latency....

109. [Observability via OpenTelemetry](https://langfuse.com/self-hosting/configuration/observability) - You can use OpenTelemetry for observability into the Langfuse application.

110. [getsops/sops: Simple and flexible tool for managing secrets](https://github.com/getsops/sops) - SOPS is an editor of encrypted files that supports YAML, JSON, ENV, INI and BINARY formats and encry...

111. [Codex - LLM Agent Research - lin-guanguo.github.io](https://lin-guanguo.github.io/llm-memory-research/codex-context.research/) - Memory, context management, and continuous learning in LLM agents

112. [anmolksachan/AI-ML-Free-Resources-for- ...](https://github.com/anmolksachan/AI-ML-Free-Resources-for-Security-and-Prompt-Injection) - Manipulating LLM behavior through crafted inputs; Indirect Prompt Injection (IPI) — Attacks via docu...

113. [Prompt Injection Defense for AI Agents: 4-Layer Guardrails (LangGraph)](https://www.youtube.com/watch?v=oqCApwxM7wc) - Prompt injection is the #1 vulnerability in agentic AI systems — and most agents in production have ...

114. [Spec-Kit BDD | SpecKit Extensions](https://speckit-community.github.io/extensions/bdd) - ATDD/BDD extension: convert specs to Gherkin scenarios, scaffold step definitions, and verify accept...

115. [OpenSQZ/GTPlanner - AI-Powered PRD Generation Tool](https://github.com/OpenSQZ/GTPlanner) - An intelligent Agent PRD generation tool that transforms natural language descriptions into structur...

116. [Spec Kit vs BMAD vs OpenSpec: Choosing an SDD Framework in 2026](https://dev.to/willtorber/spec-kit-vs-bmad-vs-openspec-choosing-an-sdd-framework-in-2026-d3j) - If the AI writes the code, the spec is the artifact. That's the entire thesis. Everything else is...

117. [GitHub Spec Kit | Spec Kit Documentation](https://github.github.com/spec-kit/)

118. [SearXNG is a free internet metasearch engine which ...](https://github.com/searxng/searxng) - SearXNG is a free internet metasearch engine which aggregates results from various search services a...

119. [SearXNG Documentation (2026.8.4+c63835bd2)](https://docs.searxng.org/) - SearXNG is a free internet metasearch engine which aggregates results from up to 274 search services...

120. [local-deep-research/docs/SearXNG-Setup.md at main · LearningCircuit/local-deep-research](https://github.com/LearningCircuit/local-deep-research/blob/main/docs/SearXNG-Setup.md) - Local Deep Research achieves ~95% on SimpleQA benchmark (tested with GPT-4.1-mini) and includes benc...

121. [avdvg/InjectGuard: LLM Prompt Injection Attack Guard](https://github.com/avdvg/InjectGuard) - LLM Prompt Injection Attack Guard. Contribute to avdvg/InjectGuard development by creating an accoun...

122. [GitHub - mlflow/mlflow: The open source AI engineering platform for agents, LLMs, and ML models. MLflow enables teams of all sizes to debug, evaluate, monitor, and optimize production-quality AI applications while controlling costs and managing access to models and data.](https://github.com/mlflow/mlflow) - The open source AI engineering platform for agents, LLMs, and ML models. MLflow enables teams of all...

123. [Wiki](https://github.com/caronc/apprise/wiki) - Apprise - Push Notifications that work with just about every platform! - caronc/apprise

124. [OHF-Voice/piper1-gpl: Fast and local neural text-to-speech ...](https://github.com/OHF-voice/piper1-gpl) - Fast and local neural text-to-speech engine. Contribute to OHF-Voice/piper1-gpl development by creat...

125. [Monitor Performance and Evaluate Agent Quality - Microsoft ...](https://microsoft.github.io/mcs-labs/labs/core-concepts-analytics-evaluations/) - Learn how to use analytics to measure agent performance, create evaluation test sets to systematical...

126. [OpenTelemetry (OTEL) for LLM Observability](https://langfuse.com/integrations/native/opentelemetry) - Connect Langfuse to OpenTelemetry (OTEL) and send OTLP traces from your application or collector to ...

127. [How to monitor your AI application with Langfuse & OpenTelemtry](https://www.youtube.com/watch?v=V7nugySdrgw) - 🔍 Monitor Your AI Agent with Langfuse & OpenTelemetry

🔗 Resources:
📜 Code:  https://github.com/XamH...

128. [Hexagonal Architecture: Ports and Adapters](https://bitloops.com/resources/software-architecture/hexagonal-architecture) - Design your application first, then plug in external systems via ports. Swap a database adapter with...

129. [Hexagonal Architecture - Episode 2 - Ports & Adapters](https://www.youtube.com/watch?v=bw7So5GMkyg) - Hexagonal Architecture does NOT prescribe layers. It ONLY prescribes dependency inversion.

What is ...

130. [The Hexagonal - Ports & Adapters Architecture | Alistair Cockburn | SAG 2025](https://www.youtube.com/watch?v=ChUlRa0xsWo) - In this 45-minute keynote, Alistair Cockburn – co-author of the "Agile Manifesto" and creator of "He...

131. [Hexagonal architecture & AI Workshop](https://www.ableneo.com/insight/hexagonal-architecture-for-ai-integration/) - Hexagonal Architecture for AI Integration: How to Build Maintainable LLM-Powered Enterprise Apps wit...

132. [Letta](https://github.com/letta-ai) - Letta is an AI lab building machines that learn. Letta has 55 repositories available. Follow their c...

133. [Hexagonal Architecture Is the Best Gift You Can Give an AI ...](https://djamel-bougouffa.com/blog/hexagonal-architecture-ai-agents/) - Ports and adapters weren't designed for AI. But isolating your business logic behind clean boundarie...

134. [OpenHands/software-agent-sdk](https://github.com/OpenHands/software-agent-sdk) - A clean, modular SDK for building AI agents with OpenHands V1. - OpenHands/software-agent-sdk

135. [The OpenHands Software Agent SDK: A Composable and ...](https://arxiv.org/html/2511.03690v1)

136. [OpenHands: AI-Driven Development - GitHub](https://github.com/OpenHands/openhands) - 🙌 OpenHands: AI-Driven Development. Contribute to OpenHands/OpenHands development by creating an acc...

137. [GitHub - OpenHands/OpenHands: 🙌 OpenHands: AI-Driven Development](https://github.com/OpenHands/OpenHands) - 🙌 OpenHands: AI-Driven Development. Contribute to OpenHands/OpenHands development by creating an acc...

138. [Agent Server Package](https://docs.openhands.dev/sdk/arch/agent-server)

139. [How to use Postgres checkpointer for persistence¶](https://langchain-ai.github.io/langgraph/how-tos/persistence_postgres/) - Build reliable, stateful AI systems, without giving up control

140. [langgraph/libs/checkpoint-postgres/langgraph/checkpoint/postgres/__init__.py at main · langchain-ai/langgraph](https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint-postgres/langgraph/checkpoint/postgres/__init__.py) - Build resilient language agents as graphs. Contribute to langchain-ai/langgraph development by creat...

141. [letta-ai/letta-code: Stateful agents that are like people, with ...](https://github.com/letta-ai/letta-code) - Letta Code is a stateful agent harness for creating agents that are more like people than tools. Let...

142. [https://github.com/lancedb/lancedb | Ecosyste.ms: Awesome](https://awesome.ecosyste.ms/projects/github.com%2Flancedb%2Flancedb) - Developer-friendly OSS embedded retrieval library for multimodal AI. Search More; Manage Less.

143. [Browser Use](https://github.com/orgs/browser-use/repositories) - Browser Use has 10 repositories available. Follow their code on GitHub.

144. [8888/github.com/browser-use](https://cnb.cool/8888/github.com/browser-use) - https://github.com/browser-use/browser-use

145. [tmux-python/libtmux: ⚙️ Python API / wrapper for tmux](https://github.com/tmux-python/libtmux) - libtmux is a typed Python API over tmux, the terminal multiplexer. Instead, interact with real Pytho...

146. [gvisor/runsc/cmd/do.go at master · google/gvisor](https://github.com/google/gvisor/blob/master/runsc/cmd/do.go) - Application Kernel for Containers. Contribute to google/gvisor development by creating an account on...

147. [GitHub - AmpereComputing/gVisor-on-ampere: Building and installing gVisor on Ampere](https://github.com/AmpereComputing/gVisor-on-ampere) - Building and installing gVisor on Ampere. Contribute to AmpereComputing/gVisor-on-ampere development...

148. [gVisor и runsc](https://sysadmin.pm/gvisor-runsc/) - gVisor (runsc) - песочница, которая позволяет работать с контейнерами, но обеспечить, при этом, сход...

149. [wtnqk/ftdv: FILE TREE DIFF VIEWER](https://github.com/wtnqk/ftdv) - ftdv (File Tree Diff Viewer) is a terminal-based diff viewer inspired by diffnav and lazygit, built ...

150. [magicui/content/blog/component-libraries.mdx at main · magicuidesign/magicui](https://github.com/magicuidesign/magicui/blob/main/content/blog/component-libraries.mdx) - UI Library for Design Engineers. Animated components and effects you can copy and paste into your ap...

151. [oraios/serena: A powerful MCP toolkit for coding](https://github.com/oraios/serena) - Semantic code retrieval, editing, refactoring via Language Server Protocol.

152. [Why Coding Agents Still Use grep as Their Search Backbone](https://menuagentic.com) - Layered retrieval: grep for broad search, LSP for symbol-precision.

153. [The Rise of Slopsquatting](https://www.arxiv.org/abs/2025) - AI hallucinated package names exploited via pre-registration on public registries.

154. [AI Code Hallucinations Fuel Supply Chain Attacks](https://openclawai.io) - Lockfile pinning, allowlist gating, and registry-age checks as mitigations.

155. [LangGraph Checkpointing vs Durable Execution](https://tianpan.co) - Checkpointers save state between nodes, not inside one; resuming can re-run side effects.

156. [Building Durable AI Agents with Temporal and LangGraph](https://temporal.io) - Pairing LangGraph reasoning state with Temporal's durable execution for side effects.

157. [Edit Formats: Whole vs. Diff vs. Search/Replace](https://aider.chat/docs/more/edit-formats.html) - Benchmarked comparison of code-edit formats and reliability across model classes.

158. [Anthropic: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) - Agents write code to call tools instead of direct tool calls, cutting token usage up to 98.7%.

159. [Agent Skills: Progressive Disclosure as a System Design Pattern](https://www.anthropic.com/engineering/agent-skills) - Three-tier SKILL.md loading (metadata, body, references) to keep context lean.

160. [SWE-bench Verified Leaderboard](https://www.swebench.com) - Human-filtered 500-instance benchmark; standard target for coding-agent capability claims.

161. [Terminal-Bench 2.0 Leaderboard](https://www.tbench.ai) - 89-task shell-agent benchmark scored by deterministic exit codes/diffs/output strings.

162. [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) - gen_ai.* namespace for LLM/agent spans; remains in Development status as of 2026.
