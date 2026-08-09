<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Original filename : Forge-OH-reconciliation-plan-v1-stage-2.md
Origin            : Forge-OH, the predecessor project. Supplied by the operator on 2026-08-09 01:01 EDT.
Filed by          : agent, verbatim, unmodified below the marker line.
sha256 (body)     : a8bd81bdda752d14
Why filed         : Reconciliation plan, stage 2.

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


# Forge-OH Reconciliation Plan v1 — Stage 2 (Detailed)

Standalone implementation plan for Perplexity Computer. Target: Colossus (128GB RAM, RTX 5090, 32GB VRAM, Blackwell SM_120). Single-user, local-first, no cloud control planes.

**Prerequisite:** Stage 1 must be complete and its exit gate verified (see `Forge-OH-reconciliation-plan-v1-stage-1.md`). Read `SESSION_HANDOFF.md` before starting — it should point here.

**Governing rule (non-negotiable):** backend and frontend ship together in the same commit/session. A backend endpoint with no reachable UI path, or a UI control wired to a stub, is not "done."

**Stage 2 goal:** replace Forge-OH's Ollama-only routing with a genuine `InferenceBackend` port supporting Ollama, vLLM, llama.cpp, and SGLang, each exposed as a health-checked, selectable adapter in the UI, with Colossus/Blackwell-specific tuning living entirely inside the adapters (never the routing core), and a VRAM-aware concurrency ceiling for future worktree-parallel agents.

```bash
cd ~/dev/forge-oh
cat SESSION_HANDOFF.md
```

Confirm it names Stage 2 as the next action before proceeding.

---

## 2.0 Baseline inspection

```bash
cat bff/services/model_router.py
grep -rn "ollama\|Ollama" bff/services/ bff/routers/
grep -n "route_by_role\|list_available_models" bff/services/model_router.py
cat bff/routers/runs.py | grep -n "backend\|model_router"
nvidia-smi --query-gpu=name,memory.total,memory.used,compute_cap --format=csv
```

Record the exact current shape of `model_router.py` — do not assume the illustrative code in this plan matches the live file; adapt every snippet below to the real function signatures found here.

---

## 2.1 Backend: `InferenceBackend` protocol and adapters

### 2.1.1 Define the protocol

```bash
mkdir -p bff/services/inference_backends
```

```python
# bff/services/inference_backends/protocol.py
from typing import Protocol, runtime_checkable

@runtime_checkable
class InferenceBackend(Protocol):
    id: str
    display_name: str
    base_url: str

    async def health_check(self) -> "BackendHealth": ...
    async def list_models(self) -> list["ModelInfo"]: ...
    @property
    def supports_streaming(self) -> bool: ...
```

```python
# bff/services/inference_backends/types.py
from pydantic import BaseModel
from enum import Enum

class HealthStatus(str, Enum):
    CONNECTED = "connected"
    WARNING = "warning"
    DISCONNECTED = "disconnected"

class BackendHealth(BaseModel):
    status: HealthStatus
    latency_ms: float | None = None
    error: str | None = None

class ModelInfo(BaseModel):
    tag: str
    context_length: int | None = None
    quant: str | None = None
    size_bytes: int | None = None
```

### 2.1.2 Ollama adapter (migrate existing logic, do not rewrite from scratch)

```bash
grep -n "def.*ollama\|OLLAMA_BASE_URL" bff/services/model_router.py
```

Extract the existing Ollama-calling code from `model_router.py` into its own adapter, preserving exact behavior:

```python
# bff/services/inference_backends/ollama_backend.py
import httpx
import time
from .types import BackendHealth, HealthStatus, ModelInfo

class OllamaBackend:
    id = "ollama"
    display_name = "Ollama"

    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url

    @property
    def supports_streaming(self) -> bool:
        return True

    async def health_check(self) -> BackendHealth:
        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                resp.raise_for_status()
            latency = (time.monotonic() - start) * 1000
            return BackendHealth(status=HealthStatus.CONNECTED, latency_ms=latency)
        except Exception as e:
            return BackendHealth(status=HealthStatus.DISCONNECTED, error=str(e))

    async def list_models(self) -> list[ModelInfo]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{self.base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
        return [
            ModelInfo(tag=m["name"], size_bytes=m.get("size"))
            for m in data.get("models", [])
        ]
```

Verify this adapter reproduces the exact model list currently surfaced by `model_router.py` before deleting the old inline logic:

```bash
python3 -c "
import asyncio
from bff.services.inference_backends.ollama_backend import OllamaBackend
b = OllamaBackend()
print(asyncio.run(b.health_check()))
print(asyncio.run(b.list_models()))
"
```

### 2.1.3 vLLM adapter

vLLM exposes an OpenAI-compatible server; reuse the same client shape as Ollama's OpenAI-compatible surface where possible.

```python
# bff/services/inference_backends/vllm_backend.py
import httpx
import time
from .types import BackendHealth, HealthStatus, ModelInfo

class VLLMBackend:
    id = "vllm"
    display_name = "vLLM"

    def __init__(self, base_url: str = "http://localhost:8001/v1"):
        self.base_url = base_url

    @property
    def supports_streaming(self) -> bool:
        return True

    async def health_check(self) -> BackendHealth:
        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/models")
                resp.raise_for_status()
            latency = (time.monotonic() - start) * 1000
            return BackendHealth(status=HealthStatus.CONNECTED, latency_ms=latency)
        except Exception as e:
            return BackendHealth(status=HealthStatus.DISCONNECTED, error=str(e))

    async def list_models(self) -> list[ModelInfo]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{self.base_url}/models")
            resp.raise_for_status()
            data = resp.json()
        return [ModelInfo(tag=m["id"]) for m in data.get("data", [])]
```

### 2.1.4 llama.cpp adapter

llama.cpp's server (`llama-server`) also exposes an OpenAI-compatible endpoint when built with `--server`; confirm the exact port/path convention used in your local setup before hardcoding.

```python
# bff/services/inference_backends/llamacpp_backend.py
import httpx
import time
from .types import BackendHealth, HealthStatus, ModelInfo

class LlamaCppBackend:
    id = "llamacpp"
    display_name = "llama.cpp"

    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url

    @property
    def supports_streaming(self) -> bool:
        return True

    async def health_check(self) -> BackendHealth:
        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/health")
                resp.raise_for_status()
            latency = (time.monotonic() - start) * 1000
            return BackendHealth(status=HealthStatus.CONNECTED, latency_ms=latency)
        except Exception as e:
            return BackendHealth(status=HealthStatus.DISCONNECTED, error=str(e))

    async def list_models(self) -> list[ModelInfo]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/v1/models")
                resp.raise_for_status()
                data = resp.json()
            return [ModelInfo(tag=m["id"]) for m in data.get("data", [])]
        except Exception:
            return []
```

### 2.1.5 SGLang adapter

SGLang also serves an OpenAI-compatible API.

```python
# bff/services/inference_backends/sglang_backend.py
import httpx
import time
from .types import BackendHealth, HealthStatus, ModelInfo

class SGLangBackend:
    id = "sglang"
    display_name = "SGLang"

    def __init__(self, base_url: str = "http://localhost:30000/v1"):
        self.base_url = base_url

    @property
    def supports_streaming(self) -> bool:
        return True

    async def health_check(self) -> BackendHealth:
        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/models")
                resp.raise_for_status()
            latency = (time.monotonic() - start) * 1000
            return BackendHealth(status=HealthStatus.CONNECTED, latency_ms=latency)
        except Exception as e:
            return BackendHealth(status=HealthStatus.DISCONNECTED, error=str(e))

    async def list_models(self) -> list[ModelInfo]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{self.base_url}/models")
            resp.raise_for_status()
            data = resp.json()
        return [ModelInfo(tag=m["id"]) for m in data.get("data", [])]
```

### 2.1.6 Backend registry

```python
# bff/services/inference_backends/registry.py
import os
from .ollama_backend import OllamaBackend
from .vllm_backend import VLLMBackend
from .llamacpp_backend import LlamaCppBackend
from .sglang_backend import SGLangBackend

def build_registry() -> dict:
    return {
        "ollama": OllamaBackend(base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")),
        "vllm": VLLMBackend(base_url=os.getenv("VLLM_BASE_URL", "http://localhost:8001/v1")),
        "llamacpp": LlamaCppBackend(base_url=os.getenv("LLAMACPP_BASE_URL", "http://localhost:8080")),
        "sglang": SGLangBackend(base_url=os.getenv("SGLANG_BASE_URL", "http://localhost:30000/v1")),
    }

BACKEND_REGISTRY = build_registry()
```

Add the four `*_BASE_URL` env vars to `.env.example` with the defaults above, and to `docker-compose.yml` if any of these run in containers already.

### 2.1.7 Rewire `model_router.py` to use the registry

```bash
grep -n "def route_by_role\|def list_available_models" bff/services/model_router.py
```

Update `route_by_role()` to accept an optional `backend_id` parameter, defaulting to `"ollama"` for backward compatibility with existing Agent Presets that don't specify one:

```python
# bff/services/model_router.py
from bff.services.inference_backends.registry import BACKEND_REGISTRY

async def route_by_role(role: str, model: str, backend_id: str = "ollama") -> RoutingResult:
    backend = BACKEND_REGISTRY.get(backend_id)
    if backend is None:
        raise ValueError(f"Unknown inference backend: {backend_id}")
    health = await backend.health_check()
    if health.status == "disconnected":
        raise BackendUnavailableError(f"{backend.display_name} is not reachable: {health.error}")
    return RoutingResult(model=model, backend=backend_id, base_url=backend.base_url)

async def list_available_models(backend_id: str = "ollama") -> list[ModelInfo]:
    backend = BACKEND_REGISTRY.get(backend_id)
    if backend is None:
        raise ValueError(f"Unknown inference backend: {backend_id}")
    return await backend.list_models()
```

### 2.1.8 New endpoint: `GET /api/inference-backends`

```python
# bff/routers/inference_backends.py
from fastapi import APIRouter
from bff.services.inference_backends.registry import BACKEND_REGISTRY

router = APIRouter()

@router.get("/api/inference-backends")
async def list_inference_backends():
    results = []
    for backend_id, backend in BACKEND_REGISTRY.items():
        health = await backend.health_check()
        results.append({
            "id": backend_id,
            "displayName": backend.display_name,
            "baseUrl": backend.base_url,
            "health": health.model_dump(),
            "supportsStreaming": backend.supports_streaming,
        })
    return {"backends": results}
```

Register this router in the main FastAPI app:

```bash
grep -n "include_router" bff/main.py
```

```python
# bff/main.py — add alongside existing router registrations
from bff.routers import inference_backends
app.include_router(inference_backends.router)
```

### 2.1.9 Extend `POST /runs` to accept `backendId`

```bash
grep -n "class.*RunCreate\|class.*CreateRunPayload" bff/models/*.py bff/routers/runs.py
```

Add `backendId: str = "ollama"` to the run-creation payload model, and thread it through to `route_by_role()`:

```python
# bff/routers/runs.py — inside create_run
routing = await model_router.route_by_role(
    role=preset.role,
    model=preset.model,
    backend_id=payload.backendId,
)
```

### 2.1.10 Verify backend half

```bash
curl http://localhost:8000/api/inference-backends | python3 -m json.tool
```

Confirm all four backends appear with real health status (some will show `disconnected` if not running locally yet — that's expected and correct, not a bug).

Start Ollama only, confirm it shows `connected` and the others show `disconnected` with real error messages (connection refused), not silent failures.

```bash
curl -X POST http://localhost:8000/api/runs -H "Content-Type: application/json" \
  -d '{"agentPresetId":"...", "backendId":"ollama", ...}'
```

Confirm the response's `routing.backend` field is `"ollama"`.

---

## 2.2 Frontend: backend selector

### 2.2.1 Inspect existing health-badge pattern to reuse

```bash
find src -iname "*McpServerCard*"
grep -n "Connected\|Warning\|Disconnected" src/features/mcp/McpServerCard.tsx
```

Confirm the exact badge component/styling used for MCP server status — reuse this component or extract a shared `HealthBadge` if it isn't already generic.

### 2.2.2 Extract shared `HealthBadge` component if needed

```bash
grep -rn "Connected\|Warning\|Disconnected" src/components/
```

If no shared component exists yet:

```typescript
// src/components/HealthBadge.tsx
type HealthStatus = "connected" | "warning" | "disconnected";

export function HealthBadge({ status }: { status: HealthStatus }) {
  const colors = {
    connected: "bg-green-500",
    warning: "bg-yellow-500",
    disconnected: "bg-red-500",
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />
  );
}
```

Refactor `McpServerCard.tsx` to use this shared component if it currently inlines the same logic — do this refactor in the same commit, not deferred.

### 2.2.3 API hook for inference backends

```typescript
// src/features/agent-presets/api.ts (extend existing file)
export interface InferenceBackendInfo {
  id: string;
  displayName: string;
  baseUrl: string;
  health: { status: "connected" | "warning" | "disconnected"; latencyMs?: number; error?: string };
  supportsStreaming: boolean;
}

export async function fetchInferenceBackends(): Promise<InferenceBackendInfo[]> {
  const res = await fetch(`${BASE}/api/inference-backends`);
  if (!res.ok) throw new Error(`Failed to fetch inference backends: ${res.status}`);
  const data = await res.json();
  return data.backends;
}
```

```typescript
// src/features/agent-presets/hooks.ts (extend existing file)
import { useQuery } from "@tanstack/react-query";
import { fetchInferenceBackends } from "./api";

export function useInferenceBackends() {
  return useQuery({
    queryKey: ["inference-backends"],
    queryFn: fetchInferenceBackends,
    refetchInterval: 10_000,
  });
}
```

Confirm the actual data-fetching library in use (`@tanstack/react-query` assumed — verify):

```bash
grep -n "useQuery\|swr" src/features/mcp/hooks.ts
```

### 2.2.4 Backend selector component

```typescript
// src/features/agent-presets/BackendSelector.tsx
import { useInferenceBackends } from "./hooks";
import { HealthBadge } from "@/components/HealthBadge";

export function BackendSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data: backends, isLoading } = useInferenceBackends();

  if (isLoading) return <div>Loading backends...</div>;

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {backends?.map((b) => (
        <option key={b.id} value={b.id} disabled={b.health.status === "disconnected"}>
          {b.displayName} {b.health.status !== "connected" ? `(${b.health.status})` : ""}
        </option>
      ))}
    </select>
  );
}
```

For a richer visual (not just a disabled `<option>`, which can't show a colored dot), consider a custom listbox rendering `HealthBadge` next to each name — match whatever the design system's existing `Select` component supports.

### 2.2.5 Wire into Agent Presets editor

```bash
cat src/features/agent-presets/AgentPresetsPage.tsx
```

Add the `BackendSelector` to the preset creation/edit form, storing the selected `backendId` alongside `model` and `role` in the preset payload sent to the backend.

### 2.2.6 Wire into run-creation form

```bash
find src -iname "*run-creat*" -o -iname "*new-run*"
```

Add the same `BackendSelector` to the run-creation form, defaulting to the value from the selected Agent Preset but overridable per-run.

### 2.2.7 Verify frontend half

```bash
pnpm dev
```

Navigate to Agent Presets editor: confirm the backend selector shows live health for all four options, with disconnected backends visibly disabled or flagged. Start Ollama locally, refresh, confirm Ollama flips to connected within the 10s poll interval. Create a run with an explicit `backendId`, confirm the network request includes it and the response's routing block reflects it.

### 2.2.8 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 2.1-2.2: InferenceBackend port + selector shipped
- Backend: added InferenceBackend protocol, four adapters (Ollama, vLLM, llama.cpp, SGLang), registry, GET /api/inference-backends, backendId threaded through POST /runs
- Frontend: BackendSelector component with live health badges, wired into Agent Presets editor and run-creation form; extracted shared HealthBadge from McpServerCard
- Files touched (backend): bff/services/inference_backends/*.py, bff/services/model_router.py, bff/routers/inference_backends.py, bff/routers/runs.py, bff/main.py, .env.example
- Files touched (frontend): src/components/HealthBadge.tsx, src/features/agent-presets/{api.ts,hooks.ts,BackendSelector.tsx,AgentPresetsPage.tsx}, run-creation form file
- Verification: all four backends report real health; run creation with explicit backendId confirmed in routing response
- Both halves shipped together: yes
EOF
```

---

## 2.3 Colossus-specific adapter tuning (Blackwell SM_120)

This work configures the actual engine processes the adapters talk to — it does not touch the `InferenceBackend` port contract at all, consistent with adapters absorbing hardware variance while the core stays generic.

### 2.3.1 llama.cpp build for SM_120

```bash
cd ~/dev
git clone https://github.com/ggml-org/llama.cpp.git  # skip if already cloned
cd llama.cpp
cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES="120" -DGGML_CUDA_FA_ALL_QUANTS=ON
cmake --build build --config Release -j$(nproc)
```

Verify the build targeted SM_120 explicitly (not auto-detected):

```bash
grep -i "120" build/CMakeCache.txt
```

Confirm CUDA toolkit version:

```bash
nvcc --version
```

Must show CUDA 12.8+ (13.2 recommended, paired with cuDNN 9.20). If the installed CUDA toolkit is older, stop and flag — do not attempt a mismatched build.

Start the server:

```bash
./build/bin/llama-server -m /path/to/model.gguf --port 8080 -ngl 999
```

Confirm it's reachable at the `LLAMACPP_BASE_URL` configured in 2.1.6:

```bash
curl http://localhost:8080/health
```

### 2.3.2 vLLM build/config for SM_120

Prefer the community Blackwell-tuned Docker image over a from-source build unless a specific newer capability is required:

```bash
docker pull vllm-blackwell-optimizer:latest  # confirm exact image name/tag before pulling
```

If a from-source build is required instead:

```bash
export TORCH_CUDA_ARCH_LIST="12.0"
pip install torch --index-url https://download.pytorch.org/whl/cu128  # or cu130
pip install vllm --no-build-isolation
```

Explicitly configure FlashInfer as the attention backend (not `flash-attn`, which throws `undefined symbol` errors on SM_120):

```bash
export VLLM_ATTENTION_BACKEND=FLASHINFER
```

Start the server:

```bash
python3 -m vllm.entrypoints.openai.api_server \
  --model /path/to/model \
  --port 8001 \
  --attention-backend flashinfer
```

Verify:

```bash
curl http://localhost:8001/v1/models
```

If `undefined symbol` or similar linking errors appear, confirm `VLLM_ATTENTION_BACKEND` is actually set in the running process's environment, not just the shell that built it.

### 2.3.3 SGLang config

```bash
pip install "sglang[all]"
python3 -m sglang.launch_server --model-path /path/to/model --port 30000
```

Confirm compute capability is detected correctly:

```bash
python3 -c "import torch; print(torch.cuda.get_device_capability())"
```

Must print `(12, 0)` for Blackwell SM_120.

### 2.3.4 Document the exact build flags in the repo

```bash
cat > docs/colossus-inference-setup.md << 'EOF'
# Colossus Inference Backend Setup

## llama.cpp
cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES="120" -DGGML_CUDA_FA_ALL_QUANTS=ON

## vLLM
TORCH_CUDA_ARCH_LIST="12.0"
VLLM_ATTENTION_BACKEND=FLASHINFER
PyTorch cu128/cu130 build required — flash-attn throws undefined symbol on SM_120, use FlashInfer.

## SGLang
Standard install; confirm torch.cuda.get_device_capability() reports (12, 0).

## CUDA/cuDNN
CUDA 12.8+ required, 13.2 recommended, paired with cuDNN 9.20.
EOF
git add docs/colossus-inference-setup.md
```

### 2.3.5 Verify

Run one real inference request against each locally-started backend through Forge-OH's actual run flow (not a raw curl to the engine) to confirm the full path — BFF → `model_router` → adapter → engine → response — works end to end for all four.

### 2.3.6 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 2.3: Colossus SM_120 adapter tuning documented and verified
- llama.cpp built with CUDA_ARCHITECTURES=120, GGML_CUDA_FA_ALL_QUANTS=ON
- vLLM configured with TORCH_CUDA_ARCH_LIST=12.0, FlashInfer attention backend (flash-attn incompatible with SM_120)
- SGLang confirmed detecting compute capability (12, 0)
- Documented in docs/colossus-inference-setup.md
- Verification: end-to-end run through Forge-OH UI succeeded against all four backends
EOF
```

---

## 2.4 VRAM-aware quant/concurrency budget

### 2.4.1 Hardware-detection helper

```python
# bff/services/inference_backends/hardware.py
import subprocess

def get_gpu_vram_mb() -> int | None:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        return int(result.stdout.strip().split("\n")[0])
    except Exception:
        return None

def get_gpu_compute_capability() -> tuple[int, int] | None:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=compute_cap", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5,
        )
        major, minor = result.stdout.strip().split("\n")[0].split(".")
        return (int(major), int(minor))
    except Exception:
        return None
```

### 2.4.2 Quant-tier selection logic

```python
# bff/services/inference_backends/quant_selector.py
from .hardware import get_gpu_vram_mb

def recommend_quant_tier(model_param_count_b: float) -> str:
    vram_mb = get_gpu_vram_mb()
    if vram_mb is None:
        return "cpu-gguf-q4"
    vram_gb = vram_mb / 1024
    if model_param_count_b <= 32 and vram_gb >= 24:
        return "q8-full-context"
    if model_param_count_b >= 70:
        if vram_gb >= 32:
            return "iq3-8k-context"
        return "q4_k_m-partial-offload"
    return "q8-full-context"
```

This is intentionally a deterministic lookup, not an LLM judgment call, per the tool-first heuristic.

### 2.4.3 Concurrency ceiling calculation

```python
# bff/services/inference_backends/concurrency.py
from .hardware import get_gpu_vram_mb

def max_concurrent_agents(base_model_footprint_mb: int, kv_cache_per_request_mb: int, reserved_headroom_mb: int = 4096) -> int:
    vram_mb = get_gpu_vram_mb()
    if vram_mb is None:
        return 1
    available = vram_mb - base_model_footprint_mb - reserved_headroom_mb
    if available <= 0:
        return 1
    return max(1, available // kv_cache_per_request_mb)
```

Expose this as a read-only computed value, not a hardcoded constant, so the same logic self-adjusts on different hardware.

### 2.4.4 New endpoint: expose the computed ceiling

```python
# bff/routers/inference_backends.py — add
from bff.services.inference_backends.concurrency import max_concurrent_agents

@router.get("/api/inference-backends/concurrency-limit")
async def get_concurrency_limit(base_model_footprint_mb: int = 20000, kv_cache_per_request_mb: int = 1500):
    limit = max_concurrent_agents(base_model_footprint_mb, kv_cache_per_request_mb)
    return {"maxConcurrentAgents": limit}
```

### 2.4.5 Frontend: surface the ceiling (read-only display for now)

```bash
grep -rn "worktree\|parallel.*agent" src/features/
```

If worktree-parallel UI doesn't exist yet (likely true pre-Stage-6), add a small read-only indicator wherever run concurrency is discussed in Settings or the Agent Presets page: "Estimated max concurrent agents on this GPU: N". This is intentionally minimal in Stage 2 — the enforcement/orchestration UI belongs to whichever later stage implements worktree parallelism; Stage 2 only needs the number computed and visible so it isn't a backend-only dead end.

```typescript
// src/features/settings/ConcurrencyLimitDisplay.tsx
import { useQuery } from "@tanstack/react-query";

export function ConcurrencyLimitDisplay() {
  const { data } = useQuery({
    queryKey: ["concurrency-limit"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/inference-backends/concurrency-limit`);
      return res.json();
    },
  });
  return <div>Estimated max concurrent agents: {data?.maxConcurrentAgents ?? "..."}</div>;
}
```

Add this component to the Settings page or Agent Presets page.

### 2.4.6 Verify

```bash
curl "http://localhost:8000/api/inference-backends/concurrency-limit?base_model_footprint_mb=20000&kv_cache_per_request_mb=1500"
```

On a 32GB card this should return a small positive integer (e.g., 4-6), not 0 and not an implausibly large number. Confirm the frontend display renders this value.

### 2.4.7 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 2.4: VRAM-aware quant/concurrency budget shipped
- Backend: hardware.py (nvidia-smi VRAM/compute-cap query), quant_selector.py (deterministic tier lookup), concurrency.py (runtime-computed ceiling), GET /api/inference-backends/concurrency-limit
- Frontend: ConcurrencyLimitDisplay read-only indicator added to Settings/Agent Presets page
- Files touched (backend): bff/services/inference_backends/{hardware.py,quant_selector.py,concurrency.py}, bff/routers/inference_backends.py
- Files touched (frontend): src/features/settings/ConcurrencyLimitDisplay.tsx
- Verification: concurrency-limit endpoint returns plausible integer on Colossus's 32GB card, frontend displays it
- Both halves shipped together: yes (deliberately minimal frontend — full worktree-orchestration UI deferred to the stage that implements parallelism)
EOF
```

---

## Stage 2 exit gate — do not proceed to Stage 3 until all pass

```bash
cd ~/dev/forge-oh
pytest bff/tests/ -q
pnpm typecheck
pnpm test:unit
pnpm build
```

Manual verification checklist:
- [ ] `GET /api/inference-backends` returns real health for all four backends (some may legitimately show disconnected if that engine isn't running).
- [ ] Starting each of the four engines locally in turn and re-polling shows the corresponding backend flip to `connected` within the poll interval.
- [ ] Agent Presets editor and run-creation form both show the live backend selector; disconnected backends are visibly non-selectable.
- [ ] A run created with an explicit `backendId` shows that backend in its `routing` response field, and the request actually reaches that engine (confirm via the engine's own request log, not just the BFF's claim).
- [ ] llama.cpp and vLLM are confirmed built/configured for SM_120 per `docs/colossus-inference-setup.md`, with no `undefined symbol` errors.
- [ ] `GET /api/inference-backends/concurrency-limit` returns a plausible value on Colossus's 32GB card, and the frontend displays it somewhere reachable.

## Final Stage 2 log entry

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 2 COMPLETE
- All Stage 2 exit-gate checks passed
- InferenceBackend port live with four working adapters, Colossus SM_120 tuning documented and verified end-to-end
- VRAM-aware concurrency ceiling computed and surfaced
- Next action: begin Stage 3.1 (Security Analyzer risk indicators)
EOF

cat > SESSION_HANDOFF.md << 'EOF'
# Session Handoff

**Current stage:** Stage 2 complete, ready to begin Stage 3 (Security, Risk, and Approval Maturity).

**Completed this session:**
- Stage 2.1 through 2.4, all verified per exit-gate checklist above.

**Remaining before Stage 2 Definition of Done:** none — Stage 2 is fully complete.

**Open questions awaiting review:** none outstanding from Stage 2.

**Exact next action:** Begin Stage 3.1 — confirm whether pinned openhands-sdk==1.40.0 exposes security-analyzer risk_level on ActionEvents; if present, surface it in bff/services/event_normalize.py and add a risk badge to the event timeline.
EOF
```
