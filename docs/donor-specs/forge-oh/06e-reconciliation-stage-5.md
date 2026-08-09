<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Original filename : Forge-OH-reconciliation-plan-v1-stage-5.md
Origin            : Forge-OH, the predecessor project. Supplied by the operator on 2026-08-09 01:01 EDT.
Filed by          : agent, verbatim, unmodified below the marker line.
sha256 (body)     : 751a3968a644d3a7
Why filed         : Reconciliation plan, stage 5.

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


# Forge-OH Reconciliation Plan v1 — Stage 5 (Detailed)

Standalone implementation plan for Perplexity Computer. Target: Colossus (128GB RAM, RTX 5090, 32GB VRAM, Blackwell SM_120). Single-user, local-first, no cloud control planes.

**Prerequisite:** Stage 4 must be complete, its exit gate verified, and the DozerDB consolidation decision (Stage 4.5) explicitly confirmed by the project owner. Read `SESSION_HANDOFF.md` before starting — it should point here and state which consolidation option (A: shared instance, B: separate instances) was chosen.

**Governing rule (non-negotiable):** backend and frontend ship together in the same commit/session. A backend endpoint with no reachable UI path, or a UI control wired to a stub, is not "done."

**Stage 5 goal:** port Kosmos's four-tier memory architecture (`MemoryPort`, `VectorPort`, `EmbeddingsPort`, `SearchPort` foundation) into Forge-OH verbatim where possible, backed by DozerDB (temporal/episodic) and Qdrant (semantic/vector), with zero-trust provenance enforcement at the port layer and a visible memory-inspector UI. This is the largest single item in the whole reconciliation plan — treat it as its own dedicated focus, not interleaved with other work.

```bash
cd ~/dev/forge-oh
cat SESSION_HANDOFF.md
```

Confirm it names Stage 5 as the next action and states the DozerDB consolidation decision before proceeding.

---

## 5.0 Baseline inspection

```bash
find . -iname "episodic_memory*"
cat bff/db/episodic_memory.py 2>/dev/null
cat bff/db/trajectories.db 2>/dev/null || file bff/db/trajectories.db 2>/dev/null
docker ps | grep -i "dozerdb\|qdrant"
grep -n "OLLAMA_BASE_URL\|nomic-embed" bff/services/inference_backends/*.py .env* 2>/dev/null
```

If you have local filesystem or git access to the `rmholston420/kosmos` repository, clone or pull it now — every port in this stage sources directly from it:

```bash
mkdir -p ~/dev/kosmos-reference
cd ~/dev/kosmos-reference
git clone https://github.com/rmholston420/kosmos.git . 2>/dev/null || git -C . pull
git log --oneline -5
git rev-parse HEAD
```

Record the exact commit hash you're porting from — this goes into every `PORTING_LEDGER.md` entry in this stage.

```bash
find . -path "*/ports/memory.py" -o -path "*/ports/vector.py" -o -path "*/ports/embeddings.py" -o -path "*/ports/search.py"
find . -path "*adapters/vector/qdrant*"
find . -path "*adapters/embeddings/ollama*"
find . -path "*adapters/memory/dozerdb*"
```

Confirm all five source files/directories referenced by this plan actually exist at the commit you pulled — if any are missing or renamed, stop and re-locate them before writing any port code.

---

## 5.1 Port pure interfaces (ports/memory.py, vector.py, embeddings.py)

### 5.1.1 Read the source files completely before porting

```bash
cat ~/dev/kosmos-reference/ports/memory.py
cat ~/dev/kosmos-reference/ports/vector.py
cat ~/dev/kosmos-reference/ports/embeddings.py
```

Confirm these are genuinely pure Protocol/interface definitions with no Kosmos-specific import coupling (no imports from `kosmos.config`, `kosmos.app`, etc.) — if any coupling exists, note it now so 5.1.2 can strip it deliberately rather than silently.

### 5.1.2 Copy verbatim into Forge-OH's namespace

```bash
mkdir -p openhands_tools_ext/memory/ports
cp ~/dev/kosmos-reference/ports/memory.py openhands_tools_ext/memory/ports/memory.py
cp ~/dev/kosmos-reference/ports/vector.py openhands_tools_ext/memory/ports/vector.py
cp ~/dev/kosmos-reference/ports/embeddings.py openhands_tools_ext/memory/ports/embeddings.py
touch openhands_tools_ext/memory/ports/__init__.py
```

Fix only import paths (e.g., `from kosmos.ports.vector import VectorPort` → `from openhands_tools_ext.memory.ports.vector import VectorPort`), and only within these three files if they cross-reference each other. Do not modify any interface signatures, field names, or docstrings — this is a verbatim port.

```bash
grep -n "^from\|^import" openhands_tools_ext/memory/ports/*.py
```

Confirm every import resolves; fix any remaining `kosmos.*` references.

### 5.1.3 Verify the ports import cleanly and are structurally sound

```bash
python3 -c "
from openhands_tools_ext.memory.ports.memory import MemoryPort
from openhands_tools_ext.memory.ports.vector import VectorPort
from openhands_tools_ext.memory.ports.embeddings import EmbeddingsPort
print('MemoryPort methods:', [m for m in dir(MemoryPort) if not m.startswith('_')])
print('VectorPort methods:', [m for m in dir(VectorPort) if not m.startswith('_')])
print('EmbeddingsPort methods:', [m for m in dir(EmbeddingsPort) if not m.startswith('_')])
"
```

### 5.1.4 Log the port

```bash
cat >> PORTING_LEDGER.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Kosmos ports: memory.py, vector.py, embeddings.py
- Source: rmholston420/kosmos, commit $(cd ~/dev/kosmos-reference && git rev-parse HEAD)
- Source paths: ports/memory.py, ports/vector.py, ports/embeddings.py
- Destination: openhands_tools_ext/memory/ports/
- License/ownership: same-owner internal port (not third-party OSS), logged for traceability per project convention
- Modification notes: import paths only, no interface/signature changes
EOF
```

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 5.1: Kosmos pure interfaces ported
- Ported ports/memory.py, ports/vector.py, ports/embeddings.py verbatim (import paths only changed)
- Files touched: openhands_tools_ext/memory/ports/{memory.py,vector.py,embeddings.py,__init__.py}
- Verification: all three import cleanly, Protocol methods confirmed present
EOF
```

---

## 5.2 Port concrete adapters (Qdrant vector store, Ollama embeddings)

### 5.2.1 Read source adapters completely

```bash
cat ~/dev/kosmos-reference/adapters/vector/qdrant/adapter.py
cat ~/dev/kosmos-reference/adapters/embeddings/ollama/adapter.py
find ~/dev/kosmos-reference/adapters/vector/qdrant -type f
```

Confirm the `QdrantVectorAdapter`, `QdrantBackend` Protocol seam, and `InMemoryQdrantBackend` test fake are all present as described, and confirm `OllamaEmbeddingsAdapter` targets the native `/api/embed` endpoint with `nomic-embed-text` as default.

### 5.2.2 Copy verbatim, adjust only import paths and connection defaults

```bash
mkdir -p openhands_tools_ext/memory/adapters/vector/qdrant
mkdir -p openhands_tools_ext/memory/adapters/embeddings/ollama
cp -r ~/dev/kosmos-reference/adapters/vector/qdrant/* openhands_tools_ext/memory/adapters/vector/qdrant/
cp -r ~/dev/kosmos-reference/adapters/embeddings/ollama/* openhands_tools_ext/memory/adapters/embeddings/ollama/
```

Fix imports:

```bash
grep -rln "from kosmos" openhands_tools_ext/memory/adapters/
```

Replace each `from kosmos.ports.vector import VectorPort` (etc.) with the Stage 5.1 destination path `from openhands_tools_ext.memory.ports.vector import VectorPort`.

Confirm the Ollama embeddings adapter's base URL default matches your existing Colossus Ollama instance (already configured in Stage 2's `OllamaBackend`):

```bash
grep -n "base_url\|OLLAMA" openhands_tools_ext/memory/adapters/embeddings/ollama/adapter.py
```

Set the default to reuse the same env var Stage 2 already introduced (`OLLAMA_BASE_URL`), not a hardcoded duplicate:

```python
# openhands_tools_ext/memory/adapters/embeddings/ollama/adapter.py
import os

class OllamaEmbeddingsAdapter:
    def __init__(self, base_url: str = None, model: str = "nomic-embed-text"):
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.model = model
```

### 5.2.3 Confirm `nomic-embed-text` is pulled locally

```bash
curl http://localhost:11434/api/tags | grep nomic-embed-text
```

If absent:

```bash
ollama pull nomic-embed-text
```

### 5.2.4 Add Qdrant to `docker-compose.yml`

```bash
grep -n "services:" docker-compose.yml
```

```yaml
# docker-compose.yml — add under services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    restart: unless-stopped

volumes:
  qdrant_data:
```

Confirm the `volumes:` top-level key already exists in the file before adding `qdrant_data` — merge into the existing block rather than duplicating the key.

```bash
docker compose up -d qdrant
docker compose ps qdrant
curl http://localhost:6333/collections
```

### 5.2.5 Verify both adapters against live services

```bash
python3 -c "
import asyncio
from openhands_tools_ext.memory.adapters.embeddings.ollama.adapter import OllamaEmbeddingsAdapter

async def main():
    adapter = OllamaEmbeddingsAdapter()
    vec = await adapter.embed('test embedding text')
    print('Embedding dim:', len(vec))

asyncio.run(main())
"
```

Confirm output shows a 768-dim vector (nomic-embed-text's dimension).

```bash
python3 -c "
import asyncio
from openhands_tools_ext.memory.adapters.vector.qdrant.adapter import QdrantVectorAdapter

async def main():
    adapter = QdrantVectorAdapter(url='http://localhost:6333')
    await adapter.ensure_collection('test_collection', vector_size=768)
    print('Collection ready')

asyncio.run(main())
"
```

### 5.2.6 Log

```bash
cat >> PORTING_LEDGER.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Kosmos adapters: Qdrant vector, Ollama embeddings
- Source: rmholston420/kosmos, commit $(cd ~/dev/kosmos-reference && git rev-parse HEAD)
- Source paths: adapters/vector/qdrant/adapter.py, adapters/embeddings/ollama/adapter.py
- Destination: openhands_tools_ext/memory/adapters/vector/qdrant/, openhands_tools_ext/memory/adapters/embeddings/ollama/
- License/ownership: same-owner internal port
- Modification notes: import paths adjusted; Ollama base_url defaulted to reuse Stage 2's OLLAMA_BASE_URL env var instead of a duplicate
EOF
```

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 5.2: Qdrant + Ollama embeddings adapters ported and live
- Ported QdrantVectorAdapter, OllamaEmbeddingsAdapter, InMemoryQdrantBackend test fake
- Added Qdrant service to docker-compose.yml, confirmed reachable
- Confirmed nomic-embed-text pulled locally, embedding call returns 768-dim vector
- Files touched: openhands_tools_ext/memory/adapters/**, docker-compose.yml
- Verification: live embed() call and Qdrant collection creation both confirmed against running services
EOF
```

---

## 5.3 Port DozerDB-native semantic memory path

### 5.3.1 Read source completely

```bash
cat ~/dev/kosmos-reference/adapters/memory/dozerdb/semantic_memory_path.py
grep -n "search_semantic\|ADR-074" ~/dev/kosmos-reference/adapters/memory/dozerdb/*.py
```

Confirm this file is already DozerDB-native (per the Stage 4/5 handoff note) — if it references Graphiti-specific extensions, confirm those extensions are actually available in your running DozerDB image:

```bash
docker exec -it dozerdb cypher-shell -u neo4j -p CHANGE_ME_REAL_PASSWORD "CALL dbms.procedures() YIELD name WHERE name CONTAINS 'graphiti' RETURN name"
```

If Graphiti-specific procedures are absent, note this now — you may need to also port Graphiti's temporal-indexing library itself, not just the adapter that calls it. Check:

```bash
pip show graphiti-core 2>/dev/null || echo "not installed"
```

If absent:

```bash
pip install graphiti-core
```

### 5.3.2 Copy and adapt connection config per Stage 4.5's decision

```bash
mkdir -p openhands_tools_ext/memory/adapters/dozerdb
cp ~/dev/kosmos-reference/adapters/memory/dozerdb/semantic_memory_path.py openhands_tools_ext/memory/adapters/dozerdb/
```

Fix imports and connection config:

```bash
grep -n "^from kosmos\|NEO4J_URI\|DOZERDB\|bolt://" openhands_tools_ext/memory/adapters/dozerdb/semantic_memory_path.py
```

If Stage 4.5 resolved to **Option A (shared instance)**: point this adapter at the same DozerDB connection env vars (`NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASSWORD` from `.env.neo4j`) already established in Stage 4.1, and use a distinct node-label namespace (e.g., `MemoryEvent`, `MemoryNode`) to avoid colliding with RepoGraph's `Symbol` labels:

```python
# openhands_tools_ext/memory/adapters/dozerdb/semantic_memory_path.py
import os

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
MEMORY_NODE_LABEL = "MemoryEvent"  # namespaced distinctly from RepoGraph's Symbol label
```

If Stage 4.5 resolved to **Option B (separate instances)**: add a second DozerDB container and a distinct set of connection env vars (`MEMORY_NEO4J_URI`, etc.) — do not reuse Stage 4's variables.

```bash
grep -n "STAGE 4.5" SESSION_HANDOFF.md BUILD_LOG.md
```

Confirm which option was actually chosen before writing this config — do not default to Option A silently if the log says Option B.

### 5.3.3 Implement `search_semantic()` per ADR-074's pattern

Confirm the ported file already implements this function; if it needs adaptation to call the newly-ported `EmbeddingsPort`/`VectorPort` adapters from 5.2 instead of Kosmos's own instances, wire that explicitly:

```python
# inside semantic_memory_path.py, confirm/adapt
from openhands_tools_ext.memory.adapters.embeddings.ollama.adapter import OllamaEmbeddingsAdapter
from openhands_tools_ext.memory.adapters.vector.qdrant.adapter import QdrantVectorAdapter

async def search_semantic(query: str, top_k: int = 10):
    embeddings = OllamaEmbeddingsAdapter()
    vectors = QdrantVectorAdapter(url=os.getenv("QDRANT_URL", "http://localhost:6333"))
    query_vec = await embeddings.embed(query)
    results = await vectors.search(collection="memory", query_vector=query_vec, top_k=top_k)
    return results
```

### 5.3.4 Verify

```bash
python3 -c "
import asyncio
from openhands_tools_ext.memory.adapters.dozerdb.semantic_memory_path import search_semantic

async def main():
    results = await search_semantic('test query about the coding agent')
    print(results)

asyncio.run(main())
"
```

Confirm this returns (possibly empty, since no memory has been written yet — that's expected before 5.5's zero-trust write path is tested) without raising a connection error against either DozerDB or Qdrant.

### 5.3.5 Log

```bash
cat >> PORTING_LEDGER.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Kosmos adapter: DozerDB semantic memory path
- Source: rmholston420/kosmos, commit $(cd ~/dev/kosmos-reference && git rev-parse HEAD)
- Source path: adapters/memory/dozerdb/semantic_memory_path.py, ADR-074
- Destination: openhands_tools_ext/memory/adapters/dozerdb/semantic_memory_path.py
- License/ownership: same-owner internal port
- Modification notes: connection config adapted per Stage 4.5 decision ([Option A/B — fill in]); search_semantic() wired to Stage 5.2's ported EmbeddingsPort/VectorPort adapters
EOF
```

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 5.3: DozerDB semantic memory path ported
- Confirmed Graphiti temporal-indexing availability against live DozerDB
- Ported semantic_memory_path.py, wired to Stage 5.2's embeddings/vector adapters
- Connection config follows Stage 4.5 decision: [Option A/B]
- Files touched: openhands_tools_ext/memory/adapters/dozerdb/semantic_memory_path.py
- Verification: search_semantic() runs cleanly against live DozerDB + Qdrant with no connection errors
EOF
```

---

## 5.4 Zero-trust write enforcement at the port layer

### 5.4.1 Confirm the enforcement rule from the source

```bash
grep -n "provenance\|confidence" ~/dev/kosmos-reference/ports/memory.py
```

Confirm the exact validation Kosmos enforces (raise on missing `provenance` or out-of-range `confidence`) and whether it's already baked into the ported `MemoryPort` Protocol from 5.1, or needs to be added as a concrete base-class enforcement.

### 5.4.2 Implement the enforcement if not already present

```python
# openhands_tools_ext/memory/ports/memory.py — extend if the base Protocol needs a concrete enforcement mixin
from pydantic import BaseModel, field_validator

class MemoryWriteEvent(BaseModel):
    content: str
    provenance: str
    confidence: float

    @field_validator("provenance")
    @classmethod
    def provenance_required(cls, v):
        if not v or not v.strip():
            raise ValueError("provenance is required and cannot be empty")
        return v

    @field_validator("confidence")
    @classmethod
    def confidence_in_range(cls, v):
        if not (0.0 <= v <= 1.0):
            raise ValueError(f"confidence must be in [0.0, 1.0], got {v}")
        return v
```

Confirm this validation fires at the actual `write_event()`/`upsert()` call sites for every adapter (DozerDB memory path, Qdrant vector path), not just at a higher orchestration layer — grep every write path:

```bash
grep -rn "def write_event\|def upsert" openhands_tools_ext/memory/
```

Each implementation must construct a `MemoryWriteEvent` (or equivalent validated model) before persisting, so validation is non-bypassable even by internal callers:

```python
# example enforcement point inside an adapter's write_event()
async def write_event(self, content: str, provenance: str, confidence: float):
    validated = MemoryWriteEvent(content=content, provenance=provenance, confidence=confidence)  # raises if invalid
    # ... proceed with actual persistence using validated.content, validated.provenance, validated.confidence
```

### 5.4.3 Verify enforcement is non-bypassable

```bash
python3 -c "
from openhands_tools_ext.memory.ports.memory import MemoryWriteEvent
try:
    MemoryWriteEvent(content='test', provenance='', confidence=0.9)
    print('FAIL: should have raised on empty provenance')
except ValueError as e:
    print('PASS:', e)

try:
    MemoryWriteEvent(content='test', provenance='agent-self-report', confidence=1.5)
    print('FAIL: should have raised on out-of-range confidence')
except ValueError as e:
    print('PASS:', e)
"
```

Also confirm at the actual adapter call level (not just the standalone model):

```bash
python3 -c "
import asyncio
from openhands_tools_ext.memory.adapters.dozerdb.semantic_memory_path import write_event  # confirm actual function name

async def main():
    try:
        await write_event(content='test', provenance='', confidence=0.9)
        print('FAIL: adapter accepted invalid write')
    except ValueError as e:
        print('PASS:', e)

asyncio.run(main())
"
```

### 5.4.4 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 5.4: Zero-trust write enforcement shipped
- MemoryWriteEvent validator enforcing required provenance and confidence in [0.0, 1.0] at the port layer
- Confirmed enforcement fires at every adapter's write_event()/upsert() call site, non-bypassable by internal callers
- Files touched: openhands_tools_ext/memory/ports/memory.py, adapter write-path files
- Verification: confirmed rejection of missing provenance and out-of-range confidence, both at model level and live adapter call level
EOF
```

---

## 5.5 ACE-style memory curation (generation → reflection → curation)

This layers on top of the ported memory port; it is not part of Kosmos's ported code and must be built fresh, informed by ACA-v8's ACE description.

### 5.5.1 Design the curation cycle

```python
# openhands_tools_ext/memory/curation/ace_cycle.py
from dataclasses import dataclass
from openhands_tools_ext.memory.ports.memory import MemoryWriteEvent

@dataclass
class CurationResult:
    action: str  # "keep" | "merge" | "supersede" | "discard"
    reason: str
    final_event: MemoryWriteEvent | None

async def generate_candidate(raw_observation: str, provenance: str, confidence: float) -> MemoryWriteEvent:
    return MemoryWriteEvent(content=raw_observation, provenance=provenance, confidence=confidence)

async def reflect_on_candidate(candidate: MemoryWriteEvent, existing_related_memories: list[MemoryWriteEvent]) -> str:
    if not existing_related_memories:
        return "No related memory found — novel information."
    overlap = any(m.content.strip() == candidate.content.strip() for m in existing_related_memories)
    if overlap:
        return "Exact duplicate of existing memory."
    return "Related but distinct — may refine existing memory."

async def curate(candidate: MemoryWriteEvent, existing_related_memories: list[MemoryWriteEvent]) -> CurationResult:
    reflection = await reflect_on_candidate(candidate, existing_related_memories)
    if "duplicate" in reflection.lower():
        return CurationResult(action="discard", reason=reflection, final_event=None)
    if "refine" in reflection.lower():
        return CurationResult(action="merge", reason=reflection, final_event=candidate)
    return CurationResult(action="keep", reason=reflection, final_event=candidate)
```

This is intentionally a simple, deterministic first pass (string-overlap check) — avoid reaching for an LLM call here per the tool-first heuristic unless evaluation later shows the deterministic version is insufficient for real duplicate/near-duplicate detection (at which point an embedding-similarity check via the already-ported `EmbeddingsPort` is the next escalation, still before any LLM call).

### 5.5.2 Wire into the write path

```python
# openhands_tools_ext/memory/curation/ace_cycle.py — extend
from openhands_tools_ext.memory.adapters.dozerdb.semantic_memory_path import search_semantic, write_event

async def curated_write(raw_observation: str, provenance: str, confidence: float):
    candidate = await generate_candidate(raw_observation, provenance, confidence)
    related = await search_semantic(raw_observation, top_k=5)
    result = await curate(candidate, related)
    if result.action == "discard":
        return {"action": "discard", "reason": result.reason}
    if result.action in ("keep", "merge"):
        await write_event(
            content=result.final_event.content,
            provenance=result.final_event.provenance,
            confidence=result.final_event.confidence,
        )
        return {"action": result.action, "reason": result.reason}
```

Replace any direct `write_event()` calls from higher up the stack (e.g., wherever Letta-style memory-block edits would eventually hook in) with `curated_write()` instead, so every memory write goes through the cycle.

### 5.5.3 Verify

```bash
python3 -c "
import asyncio
from openhands_tools_ext.memory.curation.ace_cycle import curated_write

async def main():
    r1 = await curated_write('The build uses CUDA 12.8 on Colossus', 'agent-observation', 0.85)
    print(r1)
    r2 = await curated_write('The build uses CUDA 12.8 on Colossus', 'agent-observation', 0.85)
    print(r2)  # should discard as duplicate

asyncio.run(main())
"
```

Confirm the second identical write is discarded, not duplicated.

### 5.5.4 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 5.5: ACE-style memory curation shipped
- Implemented generate/reflect/curate cycle (ace_cycle.py), deterministic first pass using string-overlap duplicate detection
- Wired curated_write() as the standard write path, replacing direct write_event() calls
- Files touched: openhands_tools_ext/memory/curation/ace_cycle.py
- Verification: confirmed duplicate write correctly discarded on second identical observation
- Note: escalate to embedding-similarity-based duplicate detection only if deterministic string-overlap proves insufficient in practice; do not add an LLM call for this without evaluation evidence justifying it
EOF
```

---

## 5.6 Frontend exposure (mandatory — ships with 5.1-5.5, not deferred)

### 5.6.1 Surface memory-tier consultation in the run-detail timeline

```bash
grep -n "CondensationEvent" bff/services/event_normalize.py
```

Add a new normalized event kind for memory consultations, extending the same pattern used for condensation events:

```python
# bff/services/event_normalize.py
def normalize_memory_consultation(event) -> dict:
    return {
        "kind": "MemoryConsultation",
        "tier": event.tier,  # "episodic" | "semantic" | "procedural" | "retrieval"
        "query": event.query,
        "resultCount": len(event.results),
        "provenance": [r.provenance for r in event.results],
    }
```

Confirm the actual event source — this requires the agent's planning loop to emit a traceable event when it calls `search_semantic()`/`write_event()`; wire this emission at the point those functions are called from the agent's tool layer, not fabricated after the fact:

```bash
grep -rn "def search_semantic\|def curated_write" openhands_tools_ext/memory/
```

Add an event-emission hook at each call site (reuse whatever event-bus/emit mechanism the codebase already uses for other tool calls):

```python
# inside search_semantic(), after getting results
await event_bus.emit("memory_consultation", tier="semantic", query=query, results=results)
```

### 5.6.2 Frontend: render the new event kind

```bash
grep -n "case \"CondensationEvent\"" src/features/run-detail/EventCard.tsx
```

Add alongside it:

```typescript
case "MemoryConsultation":
  return (
    <div className="text-xs text-gray-500 border-l-2 border-blue-300 pl-2">
      Memory consulted ({event.tier}): "{event.query}" — {event.resultCount} result(s)
    </div>
  );
```

### 5.6.3 Memory-inspector view

```bash
find src -iname "*SecretRow*"
cat src/features/secrets/SecretRow.tsx
```

Confirm the masked-but-inspectable pattern used for secrets, then build an analogous view:

```typescript
// src/features/memory-inspector/MemoryInspectorPage.tsx
import { useQuery } from "@tanstack/react-query";

interface MemoryWriteRecord {
  id: string;
  content: string;
  provenance: string;
  confidence: number;
  createdAt: string;
}

export function MemoryInspectorPage() {
  const { data: writes } = useQuery({
    queryKey: ["memory-writes"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/memory/recent-writes`);
      return res.json();
    },
  });

  return (
    <table>
      <thead><tr><th>Content</th><th>Provenance</th><th>Confidence</th><th>Time</th></tr></thead>
      <tbody>
        {writes?.map((w: MemoryWriteRecord) => (
          <tr key={w.id}>
            <td>{w.content}</td>
            <td>{w.provenance}</td>
            <td>{w.confidence.toFixed(2)}</td>
            <td>{new Date(w.createdAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Add the corresponding backend endpoint:

```python
# bff/routers/memory.py
from fastapi import APIRouter

router = APIRouter()

@router.get("/api/memory/recent-writes")
async def get_recent_writes(limit: int = 50):
    # query DozerDB for the most recent MemoryEvent nodes
    driver = get_driver()  # reuse Stage 4's driver
    with driver.session() as session:
        result = session.run(
            "MATCH (m:MemoryEvent) RETURN m ORDER BY m.created_at DESC LIMIT $limit",
            limit=limit,
        )
        return [dict(r["m"]) for r in result]
```

Register in `bff/main.py`.

Decide placement: a new tab inside the Skills/Microagents page (Stage 6.6, not yet built) or its own settings/observability tab. Since Stage 6 hasn't landed yet, build this as its own minimal standalone route for now:

```typescript
// src/app/(dashboard)/memory-inspector/page.tsx
import { MemoryInspectorPage } from "@/features/memory-inspector/MemoryInspectorPage";
export default function Page() { return <MemoryInspectorPage />; }
```

Add a sidebar entry, matching the existing nav-item pattern.

### 5.6.4 Verify

```bash
pnpm dev
```

Trigger a real task that causes a memory write (via `curated_write()`) and a semantic search (via `search_semantic()`). Confirm:
- A `MemoryConsultation` marker appears in the run-detail timeline at the moment of the search.
- The `/memory-inspector` route (reachable via sidebar) lists the write with visible provenance and confidence.

### 5.6.5 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 5.6: Memory frontend exposure shipped
- Backend: MemoryConsultation event normalization, event-emission hooks at search_semantic()/curated_write() call sites, GET /api/memory/recent-writes
- Frontend: MemoryConsultation timeline marker, new /memory-inspector route + sidebar entry showing recent writes with provenance/confidence
- Files touched (backend): bff/services/event_normalize.py, openhands_tools_ext/memory/**, bff/routers/memory.py, bff/main.py
- Files touched (frontend): src/features/run-detail/EventCard.tsx, src/features/memory-inspector/MemoryInspectorPage.tsx, src/app/(dashboard)/memory-inspector/page.tsx, Sidebar.tsx
- Verification: real write and search confirmed visible in both the timeline marker and the inspector table
- Both halves shipped together: yes
EOF
```

---

## Stage 5 exit gate — do not proceed to Stage 6 until all pass

```bash
cd ~/dev/forge-oh
pytest bff/tests/ -q
pnpm typecheck
pnpm test:unit
pnpm build
```

Manual verification checklist:
- [ ] All three pure interfaces (`memory.py`, `vector.py`, `embeddings.py`) import cleanly.
- [ ] Qdrant and Ollama-embeddings adapters confirmed live against real running services (768-dim vectors, real collection creation).
- [ ] DozerDB semantic memory path confirmed running `search_semantic()` cleanly against the connection config resolved by Stage 4.5.
- [ ] A write missing `provenance` or with out-of-range `confidence` is rejected at the port layer, confirmed both at the model level and the live adapter call level — not bypassable.
- [ ] ACE curation cycle confirmed discarding a genuine duplicate write on a real second identical observation.
- [ ] `MemoryConsultation` events render in the run-detail timeline on a real search.
- [ ] `/memory-inspector` is reachable via sidebar and shows real writes with provenance/confidence visible.
- [ ] Every ported file/adapter has a corresponding `PORTING_LEDGER.md` entry with the exact Kosmos commit hash.

## Final Stage 5 log entry

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 5 COMPLETE
- All Stage 5 exit-gate checks passed
- Four-tier memory architecture live: episodic/temporal (DozerDB), semantic (Qdrant + Ollama embeddings), zero-trust write enforcement, ACE curation cycle, full frontend visibility
- Next action: begin Stage 6.1 (ported SearXNG web-research tool from Kosmos SearchPort)
EOF

cat > SESSION_HANDOFF.md << 'EOF'
# Session Handoff

**Current stage:** Stage 5 complete, ready to begin Stage 6 (Harness Engineering Upgrades).

**Completed this session:**
- Stage 5.1 through 5.6, all verified per exit-gate checklist above.

**Remaining before Stage 5 Definition of Done:** none — Stage 5 is fully complete.

**Open questions awaiting review:** none outstanding from Stage 5.

**Exact next action:** Begin Stage 6.1 — port Kosmos's ports/search.py and adapters/search/searxng/adapter.py verbatim, deploy local SearXNG via docker-compose, wrap as an openhands_tools_ext tool.
EOF
```
