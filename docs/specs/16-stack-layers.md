# 16 — Stack Layers

**Status:** Phase 1 · binding for component selection
**Governing ADRs:** ADR-026 (extension-only posture, tier allocation), ADR-027 (OpenHands is the
harness), ADR-015 (native fidelity)

## Why this file exists

The swappable-layer stack has been supplied by the operator more than once and has repeatedly
failed to survive spec iteration. A scan on 2026-08-09 of a 44-component list against
`docs/specs/`, `adrs/`, `docs/donor-specs/`, and shipped code found an entire layer — memory and
retrieval — present only in donor material and adopted nowhere, along with the whole MCP tool tier.

This file is the register of record. Every component gets one status. Nothing enters `apps/` or
`services/` without an entry here, and nothing leaves this list silently.

## Status vocabulary

| Status | Meaning |
|---|---|
| **ADOPTED** | In shipped code, or specced with a named phase |
| **CANDIDATE** | Approved direction, no adopting spec or ADR yet |
| **NATIVE-FIRST PENDING** | Cannot be adopted until a cited finding shows OpenHands does not already carry it (ADR-027 clause 3) |
| **REJECTED** | Refused, with reason. Reversal requires an ADR |

## Registers

### Inference

| Component | Status | Note |
|---|---|---|
| SGLang | CANDIDATE | Shared-prefix workload favours RadixAttention; settle by bake-off, not literature (`01-integrated-design-and-development-spec.md:33`) |
| vLLM | CANDIDATE | Council-Synthesis slice 7.0 infra bundle |
| llama.cpp | CANDIDATE | Fallback for quantisations the servers will not host |
| Ollama | ADOPTED | Present in shipped config |

Selection is deferred to ADR-016's unrun baseline benchmark. No superiority claim may be made
without an ADR-013-compliant run.

### Platform

| Component | Status | Note |
|---|---|---|
| Git | ADOPTED | |
| Docker | ADOPTED | Per-session sandbox isolation via NVIDIA Container Toolkit |
| Podman | REJECTED | Rootless is the only advantage and this is a single-user workstation. Two container runtimes is two sandbox-escape surfaces. Reversal: an ADR, if Docker's daemon becomes a problem |
| LiteLLM | CANDIDATE | Donor Phase 4, explicitly "optional, after baseline validation" (`01-...:47`) |

### Observability

| Component | Status | Note |
|---|---|---|
| OpenTelemetry | ADOPTED | Present in code |
| Langfuse | CANDIDATE | LLM-trace layer above OTel; adopt only once there are traces worth reading |

### Memory and retrieval — the missing layer

OpenHands 1.41.0 ships the *weakest* option in this row of its own stack. `sdk/context/memory.py`
is a 97-line two-tier loader that reads `~/.openhands/memory/MEMORY.md` and
`<workspace>/.openhands/memory/MEMORY.md` into a prompt string under a 6000-character budget
(`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/context/memory.py:23`). There is no
embedding, no vector store, no semantic recall anywhere in the four packages. Compaction is
LLM summarisation (`sdk/context/condenser/llm_summarizing_condenser.py`); the nearest thing to
retrieval is skill triggering by keyword, task, or path
(`openhands_sdk-1.41.0/openhands/sdk/skills/trigger.py:19`).

So this is a genuine gap and not a duplication — the native-first burden is discharged for the
layer as a whole. It is **not** discharged per component.

| Component | Status | Note |
|---|---|---|
| Mem0 | NATIVE-FIRST PENDING | |
| Letta | NATIVE-FIRST PENDING | Stateful-agent framework; check clause 4 — if it owns the loop it is a second harness |
| Qdrant | NATIVE-FIRST PENDING | |
| Chroma | NATIVE-FIRST PENDING | |
| Zep | NATIVE-FIRST PENDING | |
| Graphiti | NATIVE-FIRST PENDING | Temporal knowledge graph |

Binding constraint on all six: whatever is adopted sits behind a port and **augments**
`MEMORY.md` rather than replacing it. The agent maintains that file natively; a memory layer that
diverges from it gives the agent two memories that disagree. Writes carry `provenance` and
`confidence` per the zero-trust MemoryPort rule.

### Orchestration

| Component | Status | Note |
|---|---|---|
| LangGraph | REJECTED | ADR-027 clause 4 — runs its own loop. A second harness inside the first |
| CrewAI | REJECTED | ADR-027 clause 4 |
| AutoGen | REJECTED | ADR-027 clause 4 |
| Temporal | CANDIDATE | Durable-execution engine, not an agent loop, so clause 4 does not bite. Deferred until there is a workflow whose crash-recovery the SDK's own event store cannot carry |

The first three are the same conclusion the Council-Synthesis reached independently: "Do NOT
build … a custom plan-and-execute harness" (`05-improvements-model-council-synthesis.md:122`).
Adopting a framework to do it is the same decision as writing it.

### Frontend

| Component | Status | Note |
|---|---|---|
| React | ADOPTED | |
| TypeScript | ADOPTED | |
| Vite | ADOPTED | |
| Tailwind | ADOPTED | |
| Monaco | CANDIDATE | Specced, not yet in code |
| Xterm | CANDIDATE | Specced, not yet in code |
| WebSocket | ADOPTED | |
| TanStack Query | CANDIDATE | Server-state cache for agent-server reads |
| Zustand | CANDIDATE | Client-only state. Scope it to what TanStack Query does not own, or it becomes a second source of truth for server data |
| Framer Motion | ADOPTED | |
| GSAP | REJECTED | Overlaps Framer Motion, which is already shipping. Two animation runtimes is bundle weight and two idioms for one job |
| Lottie | CANDIDATE | Only for designed illustrative motion; not a Framer Motion substitute |
| D3 | CANDIDATE | Referenced once in specs |
| Playwright | ADOPTED | 12 files. Operator requirement: headed, watchable |

### Graph visualisation

Absent from every surface — live specs, donor specs, and code all score zero. This is a new layer,
not recovered drift, so it needs a target before it needs a library.

| Component | Status | Note |
|---|---|---|
| React Flow | CANDIDATE | Node-and-edge editors — plan graphs, pipeline views |
| Cytoscape | CANDIDATE | Large static graph analysis |
| Sigma | CANDIDATE | WebGL, large graphs |
| react-force-graph | CANDIDATE | Force-directed, 2D/3D |
| three-forcegraph | CANDIDATE | The 3D engine under react-force-graph; adopting both is one choice, not two |

Exactly one force-directed renderer should survive selection, and it should be chosen against a
named view in a spec. Five candidates for one job is how a dependency list becomes a museum.

### External capability (MCP tier)

ADR-026 D3 puts these at the cheapest tier that can carry them. All were dropped from the live
corpus despite `01-integrated-design-and-development-spec.md:37` naming them as MCP servers
"rather than embedded code".

| Component | Status | Note |
|---|---|---|
| Serena | CANDIDATE | Semantic code navigation. Overlaps Council-Synthesis slice 7.4 tree-sitter localisation and Kosmos `plugins/tektos/repomap/` — resolve the overlap before adopting either |
| Context7 | CANDIDATE | Documentation grounding |
| Chrome DevTools MCP | CANDIDATE | Browser debugging; distinct from Playwright automation |
| SearXNG | CANDIDATE | Self-hosted search, already referenced in live specs |
| GitHub | ADOPTED | Repo ops. Local-first constraint stands: no GitHub-native CI |

## Standing rules

1. A component with no entry here may not be added to `apps/` or `services/`.
2. NATIVE-FIRST PENDING clears only by a cited `review/_sdk_src/<version>/...:<line>` finding, which
   `cited_evidence_paths_resolve` verifies resolves at the cited line.
3. REJECTED reverses only by ADR.
4. Every adoption is logged in `PORTING_LEDGER.md` with source URL, commit or version, SPDX licence,
   and modification notes.
