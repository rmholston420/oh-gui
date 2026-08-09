# 16 — Stack Layers

**Status:** Phase 1 · binding for component selection
**Governing ADRs:** ADR-026 (extension-only posture, tier allocation), ADR-027 (OpenHands is the
harness), ADR-015 (native fidelity)

## Why this file exists

The swappable-layer stack has been supplied by the operator more than once and has repeatedly
failed to survive spec iteration. A scan on 2026-08-09 of a 44-component list against
`docs/specs/`, `adrs/`, `docs/donor-specs/`, and shipped code found an entire layer — memory and
retrieval — present only in donor material and adopted nowhere, along with the whole MCP tool tier.

This file is the register of record. Every component gets one status. Nothing enters `apps/` or <!-- [REQ-16-001] -->
`services/` without an entry here, and nothing leaves this list silently.

## Status vocabulary

| Status | Meaning |
|---|---|
| **ADOPTED** | In shipped code, or specced with a named phase | <!-- [REQ-16-002] -->
| **CANDIDATE** | Approved direction, no adopting spec or ADR yet | <!-- [REQ-16-003] -->
| **NATIVE-FIRST PENDING** | Cannot be adopted until a cited finding shows OpenHands does not already carry it (ADR-027 clause 3) | <!-- [REQ-16-004] -->
| **REJECTED** | Refused, with reason. Reversal requires an ADR | <!-- [REQ-16-005] -->

## Registers

### Inference

| Component | Status | Note |
|---|---|---|
| SGLang | CANDIDATE | Shared-prefix workload favours RadixAttention; settle by bake-off, not literature (`01-integrated-design-and-development-spec.md:33`) | <!-- [REQ-16-006] -->
| vLLM | CANDIDATE | Council-Synthesis slice 7.0 infra bundle | <!-- [REQ-16-007] -->
| llama.cpp | CANDIDATE | Fallback for quantisations the servers will not host | <!-- [REQ-16-008] -->
| Ollama | ADOPTED | Present in shipped config | <!-- [REQ-16-009] -->

Selection is deferred to ADR-016's unrun baseline benchmark. No superiority claim may be made <!-- [REQ-16-010] -->
without an ADR-013-compliant run.

### Platform

| Component | Status | Note |
|---|---|---|
| Git | ADOPTED | | <!-- [REQ-16-011] -->
| Docker | ADOPTED | Per-session sandbox isolation via NVIDIA Container Toolkit | <!-- [REQ-16-012] -->
| Podman | REJECTED | Rootless is the only advantage and this is a single-user workstation. Two container runtimes is two sandbox-escape surfaces. Reversal: an ADR, if Docker's daemon becomes a problem | <!-- [REQ-16-013] -->
| LiteLLM | CANDIDATE | Donor Phase 4, explicitly "optional, after baseline validation" (`01-...:47`) | <!-- [REQ-16-014] -->

### Observability

| Component | Status | Note |
|---|---|---|
| OpenTelemetry | ADOPTED | Present in code | <!-- [REQ-16-015] -->
| Langfuse | CANDIDATE | LLM-trace layer above OTel; adopt only once there are traces worth reading | <!-- [REQ-16-016] -->

### Memory and retrieval — the missing layer

OpenHands 1.41.0 ships the *weakest* option in this row of its own stack. `sdk/context/memory.py`
is a 97-line two-tier loader that reads `~/.openhands/memory/MEMORY.md` and
`<workspace>/.openhands/memory/MEMORY.md` into a prompt string under a 6000-character budget
(`review/_sdk_src/1.41.0/openhands_sdk-1.41.0/openhands/sdk/context/memory.py:23`). There is no
embedding, no vector store, no semantic recall anywhere in the four packages. Compaction is
LLM summarisation (`sdk/context/condenser/llm_summarizing_condenser.py`); the nearest thing to
retrieval is skill triggering by keyword, task, or path
(`openhands_sdk-1.41.0/openhands/sdk/skills/trigger.py:19`).

So this is a genuine gap and not a duplication — the native-first burden is discharged for the <!-- [REQ-16-017] -->
layer as a whole. It is **not** discharged per component.

| Component | Status | Note |
|---|---|---|
| Mem0 | NATIVE-FIRST PENDING | | <!-- [REQ-16-018] -->
| Letta | NATIVE-FIRST PENDING | Stateful-agent framework; check clause 4 — if it owns the loop it is a second harness | <!-- [REQ-16-019] -->
| Qdrant | NATIVE-FIRST PENDING | | <!-- [REQ-16-020] -->
| Chroma | NATIVE-FIRST PENDING | | <!-- [REQ-16-021] -->
| Zep | NATIVE-FIRST PENDING | | <!-- [REQ-16-022] -->
| Graphiti | NATIVE-FIRST PENDING | Temporal knowledge graph | <!-- [REQ-16-023] -->

Binding constraint on all six: whatever is adopted sits behind a port and **augments** <!-- [REQ-16-024] -->
`MEMORY.md` rather than replacing it. The agent maintains that file natively; a memory layer that
diverges from it gives the agent two memories that disagree. Writes carry `provenance` and
`confidence` per the zero-trust MemoryPort rule.

### Orchestration

| Component | Status | Note |
|---|---|---|
| LangGraph | REJECTED | ADR-027 clause 4 — runs its own loop. A second harness inside the first | <!-- [REQ-16-025] -->
| CrewAI | REJECTED | ADR-027 clause 4 | <!-- [REQ-16-026] -->
| AutoGen | REJECTED | ADR-027 clause 4 | <!-- [REQ-16-027] -->
| Temporal | CANDIDATE | Durable-execution engine, not an agent loop, so clause 4 does not bite. Deferred until there is a workflow whose crash-recovery the SDK's own event store cannot carry | <!-- [REQ-16-028] -->

The first three are the same conclusion the Council-Synthesis reached independently: "Do NOT
build … a custom plan-and-execute harness" (`05-improvements-model-council-synthesis.md:122`).
Adopting a framework to do it is the same decision as writing it.

### Frontend

| Component | Status | Note |
|---|---|---|
| React | ADOPTED | | <!-- [REQ-16-029] -->
| TypeScript | ADOPTED | | <!-- [REQ-16-030] -->
| Vite | ADOPTED | | <!-- [REQ-16-031] -->
| Tailwind | ADOPTED | | <!-- [REQ-16-032] -->
| Monaco | CANDIDATE | Specced, not yet in code | <!-- [REQ-16-033] -->
| Xterm | CANDIDATE | Specced, not yet in code | <!-- [REQ-16-034] -->
| WebSocket | ADOPTED | | <!-- [REQ-16-035] -->
| TanStack Query | CANDIDATE | Server-state cache for agent-server reads | <!-- [REQ-16-036] -->
| Zustand | CANDIDATE | Client-only state. Scope it to what TanStack Query does not own, or it becomes a second source of truth for server data | <!-- [REQ-16-037] -->
| Framer Motion | ADOPTED | | <!-- [REQ-16-038] -->
| GSAP | REJECTED | Overlaps Framer Motion, which is already shipping. Two animation runtimes is bundle weight and two idioms for one job | <!-- [REQ-16-039] -->
| Lottie | CANDIDATE | Only for designed illustrative motion; not a Framer Motion substitute | <!-- [REQ-16-040] -->
| D3 | CANDIDATE | Referenced once in specs | <!-- [REQ-16-041] -->
| Playwright | ADOPTED | 12 files. Operator requirement: headed, watchable | <!-- [REQ-16-042] -->

### Graph visualisation

Absent from every surface — live specs, donor specs, and code all score zero. This is a new layer,
not recovered drift, so it needs a target before it needs a library.

| Component | Status | Note |
|---|---|---|
| React Flow | CANDIDATE | Node-and-edge editors — plan graphs, pipeline views | <!-- [REQ-16-043] -->
| Cytoscape | CANDIDATE | Large static graph analysis | <!-- [REQ-16-044] -->
| Sigma | CANDIDATE | WebGL, large graphs | <!-- [REQ-16-045] -->
| react-force-graph | CANDIDATE | Force-directed, 2D/3D | <!-- [REQ-16-046] -->
| three-forcegraph | CANDIDATE | The 3D engine under react-force-graph; adopting both is one choice, not two | <!-- [REQ-16-047] -->

Exactly one force-directed renderer should survive selection, and it should be chosen against a <!-- [REQ-16-048] -->
named view in a spec. Five candidates for one job is how a dependency list becomes a museum.

### External capability (MCP tier)

ADR-026 D3 puts these at the cheapest tier that can carry them. All were dropped from the live <!-- [REQ-16-049] -->
corpus despite `01-integrated-design-and-development-spec.md:37` naming them as MCP servers
"rather than embedded code".

| Component | Status | Note |
|---|---|---|
| Serena | CANDIDATE | Semantic code navigation. Overlaps Council-Synthesis slice 7.4 tree-sitter localisation and Kosmos `plugins/tektos/repomap/` — resolve the overlap before adopting either | <!-- [REQ-16-050] -->
| Context7 | CANDIDATE | Documentation grounding | <!-- [REQ-16-051] -->
| Chrome DevTools MCP | CANDIDATE | Browser debugging; distinct from Playwright automation | <!-- [REQ-16-052] -->
| SearXNG | CANDIDATE | Self-hosted search, already referenced in live specs | <!-- [REQ-16-053] -->
| GitHub | ADOPTED | Repo ops. Local-first constraint stands: no GitHub-native CI | <!-- [REQ-16-054] -->

## Standing rules

1. A component with no entry here may not be added to `apps/` or `services/`. <!-- [REQ-16-055] -->
2. NATIVE-FIRST PENDING clears only by a cited `review/_sdk_src/<version>/...:<line>` finding, which <!-- [REQ-16-056] -->
   `cited_evidence_paths_resolve` verifies resolves at the cited line.
3. REJECTED reverses only by ADR. <!-- [REQ-16-057] -->
4. Every adoption is logged in `PORTING_LEDGER.md` with source URL, commit or version, SPDX licence, <!-- [REQ-16-058] -->
   and modification notes.
