<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Original filename : Forge-OH-reconciliation-plan-v1-stage-1.md
Origin            : Forge-OH, the predecessor project. Supplied by the operator on 2026-08-09 01:01 EDT.
Filed by          : agent, verbatim, unmodified below the marker line.
sha256 (body)     : 2f6ad9d0e12f4ea8
Why filed         : Reconciliation plan, stage 1.

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


# Forge-OH Reconciliation Plan v1 — Stage 1 (Detailed)

Standalone implementation plan for Perplexity Computer. Target: Colossus (128GB RAM, RTX 5090, 32GB VRAM, Blackwell SM_120). Single-user, local-first, no cloud control planes, no multi-user/RBAC assumptions.

**Governing rule (non-negotiable for every task below):** backend and frontend ship together in the same commit/session. A backend endpoint with no reachable UI path, or a UI control wired to a stub/mock, is not "done." Do not mark any task complete if only one half is finished.

**Stage 1 goal:** get Forge-OH from "does not reliably install/run" to "functional enough to use Forge-OH itself to build every later stage." This stage has the tightest dependency chain in the whole plan — steps must land in order where noted, because later steps depend on a clean install to even verify against.

**Before starting:** check for `SESSION_HANDOFF.md` at repo root; read it first if present. Check for `DEBUG_LOG.md` and `BUILD_LOG.md`; create them if they do not exist yet, before touching any code.

```bash
cd ~/dev/forge-oh
test -f SESSION_HANDOFF.md && cat SESSION_HANDOFF.md
test -f BUILD_LOG.md || echo "# Build Log" > BUILD_LOG.md
test -f DEBUG_LOG.md || echo "# Debug Log" > DEBUG_LOG.md
```

---

## 1.0 Baseline inspection (do this before changing anything)

Never guess at file state — inspect first.

```bash
cd ~/dev/forge-oh
git status
git log --oneline -10
cat bff/requirements.lock 2>/dev/null || cat requirements.lock 2>/dev/null
grep -n "openhands-sdk" requirements.lock bff/requirements*.txt 2>/dev/null
cat package.json | grep -A5 '"scripts"'
cat .github/workflows/ci.yml
```

Record the exact current versions and script names found — do not assume the versions cited in prior planning docs are still accurate; confirm against the live repo state.

---

## 1.1 Fix install blockers

### 1.1.1 Diagnose the `lmnr` / `openhands-sdk` conflict precisely

```bash
cd ~/dev/forge-oh
python3 -m venv .venv-diag
source .venv-diag/bin/activate
pip install -r bff/requirements.txt -r bff/requirements-dev.txt 2>&1 | tee /tmp/pip-conflict.log
```

Read `/tmp/pip-conflict.log` for the exact resolver error — identify whether the conflict is on `httpx`, `pydantic`, or another transitive dependency pulled in by `lmnr`. Do not assume it's `httpx`/`pydantic` without confirming from this log; the prior planning doc's guess must be verified against the actual resolver output.

```bash
pip show lmnr | grep -i requires
pip show openhands-sdk | grep -i requires
```

### 1.1.2 Pin/relax the conflicting dependency

Edit `bff/requirements.txt` (or wherever `lmnr` is pinned) based on what 1.1.1 revealed. If `lmnr` pins a version of the conflicting package incompatible with `openhands-sdk==1.40.0`'s requirement, either:
- Relax `lmnr`'s pin to a range compatible with both (preferred if `lmnr`'s changelog shows no breaking change in that range), or
- Pin the shared transitive dependency explicitly at a version satisfying both, added as a direct line in `requirements.txt` so pip's resolver sees it before either sub-dependency.

```bash
# Example — adjust based on actual 1.1.1 findings, do not paste blindly
sed -i 's/lmnr[<>=0-9.,]*$/lmnr>=X.Y.Z,<A.B.C/' bff/requirements.txt
```

### 1.1.3 Regenerate the lockfile

```bash
cd ~/dev/forge-oh
pip install -r bff/requirements.txt -r bff/requirements-dev.txt
pip freeze > requirements.lock
grep openhands-sdk requirements.lock
```

Confirm output shows `openhands-sdk==1.40.0` exactly. If it shows anything else, the requirements file still has an implicit upper-bound pin somewhere — grep for it:

```bash
grep -rn "openhands-sdk" bff/ requirements*.txt setup.py pyproject.toml 2>/dev/null
```

### 1.1.4 Fix CI script name mismatch

```bash
cat package.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['scripts'])"
grep -n "pnpm " .github/workflows/ci.yml
```

Rename `package.json` scripts to match what CI actually calls (confirmed from the grep above — do not assume `typecheck`/`test:unit` are the exact names without checking):

```bash
# Edit package.json "scripts" block directly, e.g.:
# "type-check" -> "typecheck"
# "test" -> "test:unit"
```

### 1.1.5 Verify (blocking gate — do not proceed to 1.2 until all four pass)

```bash
cd ~/dev/forge-oh
rm -rf .venv-diag
pip install -r bff/requirements.txt -r bff/requirements-dev.txt
pytest bff/tests/ --collect-only
pnpm install
pnpm typecheck
pnpm test:unit
```

All four commands must exit 0. `pytest --collect-only` must report 0 collection errors.

### 1.1.6 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 1.1: Install blockers fixed
- Fixed lmnr/openhands-sdk transitive conflict on [DEPENDENCY NAME — fill in from 1.1.1]
- Regenerated requirements.lock, confirmed openhands-sdk==1.40.0
- Renamed package.json scripts to match CI (typecheck, test:unit)
- Files touched: bff/requirements.txt, requirements.lock, package.json
- Verification: pip install clean, pytest --collect-only 0 errors, pnpm typecheck && pnpm test:unit clean
- Stop condition: Stage 1.1 exit criteria met, proceeding to 1.2
EOF
```

---

## 1.2 Wire MCP Tools page (real backend, real frontend, currently disconnected)

### 1.2.1 Inspect both halves before touching anything

```bash
cat bff/routers/mcp.py
ls -la src/features/mcp/
cat src/app/\(dashboard\)/tools-mcp/page.tsx
cat src/features/mcp/api.ts
```

Confirm: `bff/routers/mcp.py` has real register/list/delete/toggle/ping endpoints (not mocked); `src/features/mcp/` has `McpPage.tsx`, `McpServerCard.tsx`, `hooks.ts`, `api.ts`, `store.ts`, `schemas.ts` present and non-trivial.

### 1.2.2 Fix the API prefix bug

```bash
grep -n "BASE" src/features/mcp/api.ts
```

Locate the line building the MCP fetch URL. Change:

```typescript
// before
const url = `${BASE}/mcp`;
// after
const url = `${BASE}/api/mcp`;
```

Apply this to every endpoint call in the file (list, register, delete, toggle, ping) — grep to confirm no other `/mcp` path in that file is missing the `/api` prefix:

```bash
grep -n "\${BASE}" src/features/mcp/api.ts
```

### 1.2.3 Swap the stub for the real page

```bash
cat "src/app/(dashboard)/tools-mcp/page.tsx"
```

Replace the `EmptyState` placeholder with an import and render of the real component:

```typescript
import { McpPage } from "@/features/mcp/McpPage";

export default function ToolsMcpPage() {
  return <McpPage />;
}
```

### 1.2.4 Verify

```bash
pnpm dev
```

In the browser: navigate to `/tools-mcp`, register a real local MCP server, confirm it appears in the list, toggle it, ping it, delete it. Confirm each action produces a real network call to `/api/mcp/*` (check browser devtools network tab) and a real state change, not a client-side-only illusion.

```bash
curl -X GET http://localhost:8000/api/mcp/servers
```

Confirm the BFF reflects the same state the UI shows.

### 1.2.5 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 1.2: MCP Tools page wired
- Fixed /api prefix bug in features/mcp/api.ts
- Replaced EmptyState stub in tools-mcp/page.tsx with real McpPage component
- Files touched (backend): none (bff/routers/mcp.py already correct)
- Files touched (frontend): src/features/mcp/api.ts, src/app/(dashboard)/tools-mcp/page.tsx
- Verification: register/ping/toggle/delete round-trip confirmed against live BFF
- Both halves shipped together: yes (frontend fix only; backend was already real)
EOF
```

---

## 1.3 Secrets nav entry + stub deletion

### 1.3.1 Inspect

```bash
cat src/components/Sidebar.tsx
find src -iname "*secret*"
cat bff/routers/secrets.py
```

Confirm `/secrets` page and `bff/routers/secrets.py` are both real and functional, and identify the second stub falsely claiming "coming soon."

### 1.3.2 Add sidebar entry

Edit `src/components/Sidebar.tsx` — add a nav item pointing at `/secrets`, matching the existing nav-item pattern used for other routes (icon, label, href).

### 1.3.3 Remove the false stub

```bash
grep -rln "coming soon" src/ | grep -i secret
```

Confirm no other component imports the stub before deleting:

```bash
grep -rn "SecretsComingSoon" src/ 2>/dev/null  # or whatever the stub component is named
```

Delete the stub file and its now-dead import line.

### 1.3.4 Verify

```bash
pnpm dev
```

Navigate via sidebar to `/secrets`, confirm the real page renders and lists real secrets (masked), confirm no console errors from the deleted stub's removed import.

### 1.3.5 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 1.3: Secrets nav entry added, stub deleted
- Added /secrets sidebar entry
- Deleted redundant "coming soon" stub component and its dead import
- Files touched: src/components/Sidebar.tsx, [stub file path]
- Verification: /secrets reachable via sidebar, real page renders, no console errors
EOF
```

---

## 1.4 Safe dead-code deletions (run in parallel with 1.2–1.3)

For every item below: run the grep first, confirm zero non-self importers, only then delete. Do not delete anything with a live importer without investigating why it appeared live — that would contradict the prior audit and needs a `DEBUG_LOG.md` entry instead of a silent deletion.

### 1.4.1 Unused `src/app/api/*` proxy routes

```bash
find src/app/api -type f -name "*.ts"
```

For each file found, grep for importers/callers:

```bash
for f in $(find src/app/api -type f -name "*.ts"); do
  route=$(echo "$f" | sed 's|src/app||;s|/route.ts||')
  echo "=== $f -> $route ==="
  grep -rn "$route" src/ --include="*.ts" --include="*.tsx" | grep -v "$f"
done
```

Confirm each shows zero real callers (the `x-forge-token` header check and wrong URL shape should be visible in the file content itself). Delete confirmed-dead files.

### 1.4.2 Dead plugins page

```bash
grep -rln "PluginsPage" src/
grep -rln "lib/plugins/hooks" src/
```

Confirm zero importers outside the dead file pair itself, then:

```bash
rm src/lib/plugins/hooks.ts
find src -iname "PluginsPage.tsx" -delete
```

### 1.4.3 Dead `runs.ts`

```bash
cat src/lib/runs.ts
grep -rn "from.*lib/runs" src/
```

Confirm the response shape genuinely doesn't match the real BFF shape (compare against `bff/routers/runs.py` response model) and confirm no live importer, then delete.

### 1.4.4 Dead compose env var

```bash
grep -n "RIGPA_LMS" docker-compose.yml
```

Remove the `FEATURE_RIGPA_LMS_ENABLED` line and any reference to it elsewhere in the compose file or `.env.example`.

### 1.4.5 Stale TODO markers

```bash
grep -rn "TODO(foh-phase2): delete this file" bff/routers/agents.py bff/routers/notifications.py src/features/mcp/mcp-server-card.tsx
```

Read the surrounding context in each file — confirm the marked code is genuinely dead (no live callers) before deleting. If any marker turns out to guard code that's actually still referenced, log this discrepancy in `DEBUG_LOG.md` rather than deleting blind.

### 1.4.6 Verify

```bash
pnpm typecheck
pnpm build
pytest bff/tests/ -q
```

All must pass clean after every deletion in 1.4 — a broken build here means a deletion had a live dependency the grep missed.

### 1.4.7 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 1.4: Dead code deleted
- Deleted N unused src/app/api/* proxy routes (list files)
- Deleted src/lib/plugins/hooks.ts and PluginsPage.tsx
- Deleted src/lib/runs.ts
- Removed FEATURE_RIGPA_LMS_ENABLED from docker-compose.yml
- Removed TODO(foh-phase2) dead code in agents.py, notifications.py, mcp-server-card.tsx
- Verification: pnpm typecheck, pnpm build, pytest all clean post-deletion
EOF
```

---

## 1.5 Agent Presets — full stack (largest Stage 1 item)

### 1.5.1 Inspect both halves

```bash
find src -iname "*agent-preset*"
cat src/features/agent-presets/AgentPresetsPage.tsx
grep -rn "_PRESETS" bff/
grep -n "AgentPreset" bff/routers/agents.py bff/models/*.py 2>/dev/null
cat bff/services/model_router.py
grep -n "route_by_role\|agentPresetId\|agentPresetName" bff/routers/runs.py bff/services/*.py
```

Confirm exactly where the cloud-model `Literal` lives, exactly where `_PRESETS` is defined as an in-memory dict, and exactly where `create_run` echoes `agentPresetName` cosmetically instead of using `agentPresetId` for routing.

### 1.5.2 Swap the frontend stub

```bash
cat "src/app/(dashboard)/agents/page.tsx"
```

Replace stub with real component import, same pattern as 1.2.3:

```typescript
import { AgentPresetsPage } from "@/features/agent-presets/AgentPresetsPage";

export default function AgentsPage() {
  return <AgentPresetsPage />;
}
```

### 1.5.3 Replace cloud-model Literal with real local model tags

```bash
grep -n "gpt-4o\|claude-opus\|Literal\[" bff/models/agent_preset.py 2>/dev/null
```

Find the current model tag source in `model_router.py`:

```bash
grep -n "def list_models\|AVAILABLE_MODELS\|MODEL_TAGS" bff/services/model_router.py
```

Replace the hardcoded `Literal[...]` type with a dynamic validator or enum sourced from `model_router.py`'s actual model listing function, e.g.:

```python
# before
model: Literal["gpt-4o", "claude-opus-4", ...]

# after
model: str  # validated at runtime against model_router.list_available_models()
```

Add a Pydantic validator that calls `model_router.list_available_models()` and rejects unknown tags.

### 1.5.4 Fix `create_run` routing

```bash
grep -n "agentPresetId\|agentPresetName\|route_by_role" bff/routers/runs.py
```

Locate where `agentPresetId` is received but not used for routing. Fix:

```python
# before (illustrative — match actual code structure)
preset = get_preset(payload.agentPresetId)
response.agentPresetName = preset.name  # cosmetic only, model never used

# after
preset = get_preset(payload.agentPresetId)
routing = model_router.route_by_role(role=preset.role, model=preset.model)
agent_config.model = routing.model
agent_config.backend = routing.backend
response.agentPresetName = preset.name
response.routing = routing  # so frontend/verification can confirm real routing occurred
```

### 1.5.5 Move `_PRESETS` from in-memory dict to SQLite

```bash
cat bff/db/episodic_memory.py  # inspect existing SQLite pattern to match
```

Create a new table following the same connection/migration pattern already used for `episodic_memory.db`/`trajectories.db`:

```python
# bff/db/agent_presets.py
import sqlite3
from pathlib import Path

DB_PATH = Path("data/agent_presets.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_presets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            model TEXT NOT NULL,
            role TEXT NOT NULL,
            require_approval INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
```

Replace every read/write of `_PRESETS` in the router with calls into this module. Write a one-time migration script to move any existing in-memory defaults into the new table on first boot.

### 1.5.6 Verify (full round trip)

```bash
# Backend restart to confirm persistence
docker compose restart bff  # or however bff is run locally
curl -X POST http://localhost:8000/api/agent-presets -H "Content-Type: application/json" \
  -d '{"name":"test-preset","model":"qwen3.6:35b-a3b","role":"coder"}'
curl http://localhost:8000/api/agent-presets
```

Confirm the preset is listed. Restart the BFF again, confirm it's still listed (persistence check).

In the browser:
1. Create a preset via the UI selecting a real local model.
2. Start a run selecting that preset.
3. Inspect the run's response payload — confirm `routing.model` matches the preset's model, not a default.
4. Restart the BFF, reload the Agent Presets page, confirm the preset still appears.

### 1.5.7 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 1.5: Agent Presets full stack wired
- Frontend: swapped stub for AgentPresetsPage.tsx
- Backend: replaced cloud-model Literal with model_router-sourced validation
- Backend: fixed create_run to route via agentPresetId -> route_by_role(), not cosmetic echo
- Backend: migrated _PRESETS from in-memory dict to SQLite (bff/db/agent_presets.db)
- Files touched (backend): bff/models/agent_preset.py, bff/routers/runs.py, bff/routers/agents.py, bff/db/agent_presets.py
- Files touched (frontend): src/app/(dashboard)/agents/page.tsx
- Verification: preset creation, run routing confirmed via response.routing, persistence confirmed across BFF restart
- Both halves shipped together: yes
EOF
```

---

## 1.6 Send Message While Running

### 1.6.1 Inspect existing patterns to match

```bash
grep -n "pauseRun\|resumeRun" src/features/run-detail/api.ts
grep -n "def pause_run\|def resume_run" bff/routers/runs.py
grep -n "POST /api/conversations" bff/services/agent_server_client.py 2>/dev/null
```

Confirm the exact shape of the existing pause/resume backend calls and frontend API wrappers to mirror exactly.

### 1.6.2 Backend: add the message-forwarding endpoint

```python
# bff/routers/runs.py
@router.post("/runs/{run_id}/message")
async def send_message(run_id: str, payload: MessagePayload):
    conversation_id = get_conversation_id_for_run(run_id)  # reuse existing lookup
    body = {
        "role": "user",
        "content": payload.content,
        "run": True,
    }
    result = await agent_server_client.post(
        f"/api/conversations/{conversation_id}/events", json=body
    )
    return result
```

Define `MessagePayload` as a Pydantic model matching the content shape the agent-server expects (confirm exact shape from agent-server's OpenAPI schema or SDK types before hardcoding).

### 1.6.3 Frontend: API wrapper

```typescript
// src/features/run-detail/api.ts
export async function sendMessage(runId: string, content: MessageContent[]) {
  const res = await fetch(`${BASE}/api/runs/${runId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Failed to send message: ${res.status}`);
  return res.json();
}
```

### 1.6.4 Frontend: composer component

Add a persistent input + send button to the run-detail page, following the existing layout pattern for the pause/resume button row. Enable it when `run.status` is one of `RUNNING`, `PAUSED`, `WAITING_FOR_CONFIRMATION`; disable otherwise.

```bash
find src/features/run-detail -iname "*.tsx" | xargs grep -l "status ===" 
```

Locate the existing status-conditional rendering pattern and mirror it for the new composer's enabled/disabled state.

### 1.6.5 Verify

```bash
pnpm dev
```

Start a run, wait until it's mid-execution (RUNNING), send a message through the new composer, confirm:
- Network tab shows a `POST /api/runs/{id}/message` call succeeding.
- The agent's subsequent event stream reflects awareness of the new message (visible in the timeline).
- Composer is disabled/hidden when run status is `FINISHED` or `ERROR`.

### 1.6.6 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 1.6: Send Message While Running shipped
- Backend: added POST /runs/{run_id}/message forwarding to agent-server conversations/events
- Frontend: added persistent message composer to run-detail page, gated on RUNNING/PAUSED/WAITING_FOR_CONFIRMATION
- Files touched (backend): bff/routers/runs.py, bff/models/message_payload.py
- Files touched (frontend): src/features/run-detail/api.ts, src/features/run-detail/[ComposerComponent].tsx
- Verification: message sent mid-run, confirmed in event stream, composer correctly gated by status
- Both halves shipped together: yes
EOF
```

---

## 1.7 Fix dead Socket.IO `approval_required` listener

### 1.7.1 Inspect

```bash
grep -n "approval_required\|run:event\|'message'\|'error'" src/hooks/useRunStream.ts
grep -n "_emit\|socketio\|emit(" bff/services/event_relay.py
grep -rn "SOCKET_EVENTS" src/
```

Confirm which socket events the frontend listens for that the BFF never emits, and which the BFF actually does emit (`event`, `status`).

### 1.7.2 Backend: emit the real event

```python
# bff/services/event_relay.py
async def on_status_transition(run_id: str, old_status: str, new_status: str):
    if new_status == "waiting_for_confirmation":
        await sio.emit("approval_required", {
            "run_id": run_id,
            "status": new_status,
        })
    # existing emit("status", ...) call stays as-is
```

Locate the exact function handling status transitions first (`grep -n "waiting_for_confirmation" bff/services/event_relay.py`) and add the emit call inside it, not as a separate untriggered path.

### 1.7.3 Frontend: reconcile the socket events registry

```bash
grep -rn "SOCKET_EVENTS" src/
```

Update the registry (wherever it enumerates expected events) to match the BFF's actual `_emit()` call sites — confirmed real sites are `event`, `status`, and now `approval_required`. Remove or mark deferred any registry entries for events the BFF genuinely never emits (`run:event`, `message`, generic `error`) unless a corresponding backend emit is added in the same pass.

### 1.7.4 Fix the self-referential test

```bash
find src -iname "*socket*test*" -o -iname "*SOCKET_EVENTS*test*"
```

Update the test asserting against `SOCKET_EVENTS` so it validates against the BFF's actual emit call sites (grep the backend source directly inside the test, or maintain a manually-synced list with a comment pointing at the backend file/line to check on future changes).

### 1.7.5 Verify

```bash
pnpm dev
```

Start a run that triggers a human-approval-required action. Confirm:
- Browser devtools socket frames show an `approval_required` event firing at the moment of transition.
- The UI updates immediately (push-based), not after the next poll cycle.
- No console errors about unhandled/unexpected socket events.

### 1.7.6 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 1.7: approval_required socket event wired
- Backend: event_relay.py now emits approval_required on waiting_for_confirmation transition
- Frontend: reconciled SOCKET_EVENTS registry and its test against BFF's real _emit() call sites
- Files touched (backend): bff/services/event_relay.py
- Files touched (frontend): src/hooks/useRunStream.ts (already had the listener — confirmed no change needed), SOCKET_EVENTS registry file, its test file
- Verification: approval_required fires via push on real transition, confirmed in devtools socket frames
- Both halves shipped together: yes (frontend listener was already present and dead; backend emit closes the loop)
EOF
```

---

## Stage 1 exit gate — do not proceed to Stage 2 until all pass

```bash
cd ~/dev/forge-oh
pip install -r bff/requirements.txt -r bff/requirements-dev.txt
pytest bff/tests/ --collect-only
grep openhands-sdk requirements.lock
pnpm install
pnpm typecheck
pnpm test:unit
pnpm build
```

Manual verification checklist (all must be confirmed true in the running app):
- [ ] Clean install succeeds with zero pip/pytest/pnpm errors.
- [ ] `/tools-mcp` renders the real page; register/ping/toggle/delete round-trips against the live BFF.
- [ ] `/secrets` is reachable from the sidebar and shows real (masked) secrets.
- [ ] All confirmed-dead files from 1.4 are deleted; build and tests still pass.
- [ ] `/agents` shows the real Agent Presets page; creating a preset with a real local model and starting a run against it produces a `routing.model` matching that preset; the preset survives a BFF restart.
- [ ] A message can be sent to a RUNNING run via the new composer and is reflected in the event stream.
- [ ] An `approval_required` socket event fires in real time (not via polling) when a run transitions to `waiting_for_confirmation`.

## Final Stage 1 log entry

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 1 COMPLETE
- All Stage 1 exit-gate checks passed (install, typecheck, test:unit, build)
- All manual verification checklist items confirmed true
- Forge-OH is now functional enough to be used for Stage 2 (Inference-Backend Flexibility) work
- Next action: begin Stage 2.1 (InferenceBackend protocol in model_router.py)
EOF

cat > SESSION_HANDOFF.md << 'EOF'
# Session Handoff

**Current stage:** Stage 1 complete, ready to begin Stage 2 (Inference-Backend Flexibility / ModelClient port).

**Completed this session:**
- Stage 1.1 through 1.7, all verified per exit-gate checklist above.

**Remaining before Stage 1 Definition of Done:** none — Stage 1 is fully complete.

**Open questions awaiting review:** none outstanding from Stage 1.

**Exact next action:** Begin Stage 2.1 — extend bff/services/model_router.py with the InferenceBackend protocol (base_url, health_check(), list_models(), supports_streaming) and implement OllamaBackend, VLLMBackend, LlamaCppBackend, SGLangBackend adapters.
EOF
```
