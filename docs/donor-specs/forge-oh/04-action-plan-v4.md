<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Original filename : Forge-OH-Action-Plan-v4.md
Origin            : Forge-OH, the predecessor project. Supplied by the operator on 2026-08-09 01:01 EDT.
Filed by          : agent, verbatim, unmodified below the marker line.
sha256 (body)     : e650d9db8bf57188
Why filed         : The Forge-OH build spec named by that project's own custom instructions as the scope-of-record.

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


# Forge-OH Action Plan (v4 — adds local LLM selection for Colossus RTX 5090)

Executable plan for Perplexity Computer against Colossus. Continue in the existing `rmholston420/Forge-OH` repo — do not create a new repo. Work directly on `main` unless a branch is explicitly requested; do not burn Perplexity Computer credits on branch/PR ceremony for a single-user local project. Single-user system: no auth/RBAC.

## Local Model Selection for Colossus (added — RTX 5090, 32GB VRAM)

Confirmed via OpenHands Index results and independent SWE-bench testing as of early August 2026:

- **Primary recommendation — `qwen3.6:35b-a3b` via Ollama.** This is OpenHands' own official documented recommendation for local/self-hosted usage (`docs.openhands.dev/openhands/usage/llms/llms`). MoE architecture (3B active params), fits at ~28GB VRAM at Q6_K, runs ~75-90 tok/s on a 5090 — the best throughput-to-quality tradeoff for OpenHands' sequential multi-call agent loop.
- **Alternative — `qwen3.6:27b` via Ollama, if raw coding accuracy matters more than speed.** Dense model, 77.2% SWE-bench Verified (the highest verified score of any model in this VRAM class), fits at ~30GB VRAM at Q8_0 (near-FP16 quality), ~40-70 tok/s on a 5090.
- **Speed-priority fallback — `qwen3-coder:30b` via Ollama.** MoE (3B active), ~18-24GB VRAM at Q4/Q5, ~110 tok/s on a 5090 — fastest agentic option, moderate accuracy tradeoff vs. the two above.

```bash
ollama pull qwen3.6:35b-a3b   # primary — OpenHands-recommended, best throughput/quality balance
ollama pull qwen3.6:27b       # alternative — highest verified SWE-bench score for this VRAM tier
```

Configure Forge-OH's model router (`bff/services/model_router.py` — do not rewrite, only add a route) to point at Ollama's OpenAI-compatible endpoint (`http://localhost:11434/v1`) with `qwen3.6:35b-a3b` as the default `agentic`/local profile. Reserve `qwen3.6:27b` as a manually-selectable higher-quality option for tasks where the extra accuracy is worth the slower generation. Do not install both simultaneously loaded — Ollama loads models on demand, so both can coexist on disk without VRAM conflict.

## North Star

Forge-OH's goal is to be the ideal **workflow-based, browser-based GUI wrapper over the entire OpenHands suite** — the agent-server, SDK, tools, and workspace primitives — excluding OpenHands' own hosted GUI and cloud services. Every backend capability Forge-OH exposes must have a corresponding frontend surface; do not ship backend-only functionality that has no UI path, and do not build frontend chrome for capabilities the backend doesn't yet support. Build vertically, one workflow at a time, backend and frontend together, rather than finishing all backend routers first.

## Execution Constraints

- **Credits are limited.** Perplexity Computer must work efficiently: no speculative refactors, no gold-plating, no chasing GitHub Actions green checkmarks. Local functionality on Colossus is the only thing that matters right now.
- **Do not spend time on GitHub CI.** Ignore `.github/workflows/*` entirely for this pass. Verify everything by running the app locally on Colossus, not by chasing Actions runs.
- **No branch/PR workflow required.** Skip branching unless the user asks for it later. Commit directly to `main` in small, working increments.
- **Backend and frontend are equal priority, built together.** For every stub router replaced with a real OpenHands call, wire the matching frontend feature in the same work session before moving to the next router. Do not leave a real backend endpoint with no UI consuming it, and do not leave a UI feature pointed at a stub.
- **Speed to functional > completeness.** Prioritize the smallest end-to-end vertical slice (one real task, submitted from the real UI, running against the real agent-server, visible results in the real UI) over broad but shallow coverage across many routers.

## Context (confirmed via full repo audit + live GitHub API check, Aug 2, 2026)

- Forge-OH is a five-phases-complete Next.js 16 + FastAPI BFF GUI for OpenHands, originally scoped as a Rigpa-LMS plugin. The Rigpa-LMS framing is now dropped in favor of the North Star above — a general-purpose OpenHands GUI wrapper.
- `bff/routers/runs.py` and `bff/routers/workspaces.py` are **100% stub** — confirmed still true today. Every route returns hardcoded data with an explicit `"stub": True` field; `POST /runs` calls the real `route_request()` model router but never touches OpenHands.
- `bff/services/model_router.py` and `bff/services/episodic_memory.py` are **fully real, working code** — do not rewrite these; extend `model_router.py` only as described above.
- `.env.example` pins stale OpenHands SDK version 1.29.3 / runtime tag 0.60.0 — predates the current V1 four-package split (`openhands-sdk`, `openhands-tools`, `openhands-agent-server`, `openhands-workspace`). **Confirmed current versions as of Aug 2, 2026: `openhands-sdk` `1.40.0`, `openhands-agent-server` `1.40.0`, `openhands-tools` `1.40.0`, `openhands-workspace` `1.40.0` (all released Aug 1, 2026), OpenHands main app `v1.8.0` (Jul 30, 2026), OpenHands CLI `1.16.0` (May 8, 2026).** The repo's pin is 11 minor versions behind current.
- Auth/RBAC (Phase 6) was never finished and is now unneeded — single-user, delete rather than complete. Confirmed still present: `bff/middleware/rbac.py` exists and is actively imported by `runs.py`; README still lists Phase 6 as "🕒 Planned" despite this partial code existing.
- Two conflicting dependency manifests exist: root `requirements.txt` and `bff/requirements.txt` both pin `fastapi==0.115.5`/`pydantic==2.12.5` but diverge in extra packages (`python-jose`/`passlib[bcrypt]`/`aiohttp` in the BFF file vs. `ollama`/`redis`/`websockets` in root). Reconcile opportunistically while touching these files — not a standalone task worth spending credits on alone.
- Six duplicate file/module pairs exist from a stale refactor: `bff/openhands_client.py` vs `bff/services/openhands_client.py`; `bff/settings.py` vs `bff/routers/settings.py`; `StatusBadge.tsx` (flat vs. folder); `Table.tsx` (flat vs. folder); `SecretRow.tsx` (`components/domain/` vs `features/secrets/`); `WorkspaceCard.tsx` (`components/domain/` vs `features/workspaces/`); `useRunStream.ts` (`lib/hooks/` vs `lib/streaming/`). Resolve each pair only when you touch its area of code in the steps below — do not do a dedicated cleanup pass first.

## Pre-flight (local only — no repo/branch ceremony)

```bash
cd ~/dev/Forge-OH   # or wherever it's already cloned on Colossus
git pull
cat .env.example
grep -rn "openhands_base_url\|OPENHANDS_BASE_URL" bff/ .env.example
docker ps --format '{{.Names}}' 2>/dev/null
pip index versions openhands-agent-server 2>&1 | head -5
pip index versions openhands-sdk 2>&1 | head -5
ollama list
```

Report output before proceeding. Expect `pip index versions` to resolve up to `1.40.0`. If `qwen3.6:35b-a3b` isn't already pulled, pull it now per the Local Model Selection section above.

## Step 1 — Stand up real OpenHands agent-server locally

```bash
uv venv .oh-venv
source .oh-venv/bin/activate
uv pip install openhands-sdk==1.40.0 openhands-tools==1.40.0 openhands-agent-server==1.40.0 openhands-workspace==1.40.0
python -m openhands.agent_server --host 127.0.0.1 --port 8090
```

In a separate terminal, confirm it's live and pull its full route table — this becomes the master checklist for what Forge-OH's backend+frontend must eventually expose:

```bash
curl -s http://127.0.0.1:8090/openapi.json | python3 -m json.tool | grep '"' | grep -oP '"/[a-zA-Z0-9_/{}\-]+"' | sort -u
```

Save this route list. Group the routes by workflow (conversation lifecycle, file/diff access, tool/MCP invocation, browser automation, secrets, tracing) — this grouping becomes the backlog for the vertical slices in Step 3 onward. Update `.env.example` immediately with the actual confirmed version strings (expect `1.40.0`/agent-server `1.40.0`), replacing `1.29.3`/`0.60.0`. Confirm the agent-server can reach Ollama at `http://localhost:11434/v1` with `qwen3.6:35b-a3b` as the configured model before moving on.

## Step 2 — Strip auth/RBAC and LMS (mechanical deletion, one pass, minimal ceremony)

Both are pure scope-reduction with zero user-facing value for a single-user local app — do this fast, in one sitting, then never revisit it.

```bash
rm bff/middleware/rbac.py bff/routers/auth.py bff/routers/lms.py
rm bff/tests/test_rbac.py bff/tests/test_auth.py bff/tests/test_auth_router.py bff/tests/test_lms.py bff/tests/test_lms_router.py
rm src/components/auth/AuthGuard.tsx src/components/auth/CanDo.tsx src/components/auth/RoleChip.tsx
rm src/app/\(auth\)/login/page.tsx
rm src/app/api/auth/\[...nextauth\]/route.ts
rm src/tests/unit/rbac-permissions.test.ts src/tests/unit/rbac-withPermission.test.tsx
rm src/tests/unit/auth-RoleChip.test.tsx src/tests/unit/auth-schemas.test.ts src/tests/unit/auth-schemas-edge-cases.test.ts
rm src/tests/unit/LoginPage.test.tsx
rm src/tests/unit/rigpa-lms-schemas.test.ts src/tests/unit/rigpa-lms-store.test.ts
```

```bash
grep -rl "require_role\|from bff.middleware.rbac" bff/routers/
```

For each file returned (expect `runs.py`, `workspaces.py`), remove the `Depends(require_role(...))` parameter and the import line. Remove `lms` import from `bff/main.py`'s router-include block and any frontend LMS references (`grep -rln "rigpa.lms\|rigpaLms" src/`). Remove `secret_key`/`token_ttl_hours`/`feature_rigpa_lms_enabled` from whichever of `bff/settings.py` / `bff/routers/settings.py` is canonical — pick one now and delete the other (resolves one of the six duplicate pairs).

Quick local sanity check only — skip full lint/type-check/test suite unless something looks broken:

```bash
npm run dev &
cd bff && uvicorn bff.main:app_with_sio --host 0.0.0.0 --port 8081 --reload &
```

Confirm the app still boots and the UI loads before moving on.

## Step 3 — First vertical slice: real conversation create → run detail → live events (backend + frontend together)

This is the highest-priority slice because it proves the whole wrapper concept end-to-end. Do not proceed to any other slice until this one works in the browser.

**Backend:**
- Wire `bff/routers/runs.py`'s `POST /runs` to the agent-server's real conversation-create endpoint (from Step 1's route dump), passing `body.taskPrompt`. Remove the stub return.
- Wire `GET /runs/{run_id}` to real conversation/session status.
- Wire the WebSocket/event-stream route into the existing Socket.IO relay in `bff/main.py`.
- Resolve the `bff/openhands_client.py` vs `bff/services/openhands_client.py` duplicate now — keep whichever one Step 1's client actually calls, delete the other, fix imports.

**Frontend (same session, not a follow-up task):**
- Confirm the existing "create run" form in the UI posts to the now-real `POST /runs` and correctly reflects `queued`/`blocked` status from the real model-routing response.
- Confirm the run-detail page renders real status instead of stub data.
- Resolve the `useRunStream.ts` duplicate (`lib/hooks/` vs `lib/streaming/`) — determine which one run-detail actually imports, delete the other, and confirm the event timeline streams real Action/Observation events from the real WebSocket relay.

**Manual verification (local browser, no e2e suite yet):** submit a real task prompt from the running UI (agent running on `qwen3.6:35b-a3b` per the Local Model Selection section), watch it appear in Runs list, watch the event timeline populate with real events. This is the functional milestone — treat it as the "app works" checkpoint.

## Step 4 — Second vertical slice: files/diff view (backend + frontend together)

- Backend: wire `GET /runs/{run_id}/files` and `/files/{file_path}` to real file-tree and diff reads from the workspace, using Step 1's confirmed routes.
- Frontend: confirm the existing Files/diff viewer tab renders real file changes instead of the stub empty list.
- Manual check: run a task that edits a file, confirm the diff appears correctly in the browser.

## Step 5 — Third vertical slice: run lifecycle controls (pause/resume/stop/approve/reject)

- Backend: wire each stub lifecycle endpoint in `runs.py` to its real agent-server call.
- Frontend: confirm the existing pause/resume/stop/approve/reject buttons in run-detail actually call these and reflect real state changes.
- Manual check: pause a running task from the UI, confirm it actually pauses at the agent-server level, resume it, confirm it continues.

## Step 6 — Fourth vertical slice: workspaces (local-only)

- Backend: collapse `Workspace`/`CreateWorkspaceRequest` type enum to `Literal['local']` only in `bff/routers/workspaces.py`; replace `_WORKSPACES` in-memory stub with a real read from the agent-server's workspace-listing endpoint if Step 1 confirmed one exists, otherwise keep in-memory but backed by real local directory state; replace `test_workspace_connection`'s hardcoded `ok=True` with a real health check.
- Frontend: remove `docker`/`e2b`/`modal` options from `WorkspaceFormModal.tsx` and any feature code switching on workspace type; confirm the Workspaces tab shows real local workspace state.
- Manual check: create/select a workspace in the UI, confirm it's backed by a real local path the agent-server actually uses.

## Step 7 — Remaining OpenHands-suite surfaces (only after Steps 3–6 are functional)

Using Step 1's grouped route backlog, extend the same backend+frontend-together pattern to whatever OpenHands capabilities aren't yet wrapped — likely candidates: MCP/tool invocation, browser-automation events, tracing/observability, secrets. Sequence these by whichever has the most existing frontend scaffolding already built (check `src/features/*` for tabs that currently point at stubs) so each increment reuses UI that's already there rather than building new screens from scratch.

## Explicitly Deferred (do not start yet, do not spend credits here)

- GitHub Actions / CI green-checkmark chasing — irrelevant to local functionality.
- Branch/PR workflow — work on `main` unless told otherwise.
- Plugin-mode dual support (`plugin_adapter.py`, Kosmos `EventBusPort` wiring, `context_loader.py` retarget to Kosmos paths) — this is Rigpa-LMS/Kosmos integration work, entirely out of scope until Forge-OH is functional standalone.
- Full duplicate-file cleanup as a dedicated pass — resolve each pair opportunistically inside the step that touches it, as specified above.
- `episodic_memory.py`, MCP servers, secrets vault, observability dashboard, settings pages — already built, do not touch unless a step above explicitly requires it.
- Running both `qwen3.6:35b-a3b` and `qwen3.6:27b` loaded simultaneously — Ollama handles on-demand loading; switch models via the router config, not by keeping both resident.

## Stop condition for "functional"

Forge-OH is functional when: a user can open the local UI, create a run with a real task prompt, watch it execute against the real agent-server (backed by `qwen3.6:35b-a3b` on Ollama) with a live event stream, see real file diffs, and control its lifecycle (pause/resume/stop/approve/reject) — all from the browser, all backed by real OpenHands calls, with no remaining `"stub": True` responses in the core Runs/Workspaces/Files flow. CI status and full test-suite passage are not part of this stop condition.

## Reporting

After each vertical slice (Steps 3–6) is confirmed working locally, append a brief `BUILD_LOG.md` entry: which slice, files touched (backend + frontend), model used, and confirmation it works end-to-end in the browser. Update `SESSION_HANDOFF.md` with the next slice to start.
