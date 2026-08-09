<!--
PROVENANCE — DONOR SPEC OF RECORD. DO NOT EDIT THE BODY.

Original filename : Forge-OH-reconciliation-plan-v1-stage-3.md
Origin            : Forge-OH, the predecessor project. Supplied by the operator on 2026-08-09 01:01 EDT.
Filed by          : agent, verbatim, unmodified below the marker line.
sha256 (body)     : 4961041d0c5a3be2
Why filed         : Reconciliation plan, stage 3.

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


# Forge-OH Reconciliation Plan v1 — Stage 3 (Detailed)

Standalone implementation plan for Perplexity Computer. Target: Colossus (128GB RAM, RTX 5090, 32GB VRAM, Blackwell SM_120). Single-user, local-first, no cloud control planes.

**Prerequisite:** Stage 2 must be complete and its exit gate verified (see `Forge-OH-reconciliation-plan-v1-stage-2.md`). Read `SESSION_HANDOFF.md` before starting — it should point here.

**Governing rule (non-negotiable):** backend and frontend ship together in the same commit/session. A backend endpoint with no reachable UI path, or a UI control wired to a stub, is not "done."

**Stage 3 goal:** raise Forge-OH's security/approval maturity — surface SDK-native risk scoring, replace the binary approval checkbox with a risk-based policy, add a deterministic dependency-verification gate against slopsquatting, and fix two confirmed cross-layer contract bugs (GPU staleness, compare-endpoint mismatch).

```bash
cd ~/dev/forge-oh
cat SESSION_HANDOFF.md
```

Confirm it names Stage 3 as the next action before proceeding.

---

## 3.0 Baseline inspection

```bash
pip show openhands-sdk | grep Version
python3 -c "import openhands.sdk; print(openhands.sdk.__file__)"
grep -rn "risk_level\|risk_score\|SecurityAnalyzer\|security_analyzer" $(python3 -c "import openhands.sdk, os; print(os.path.dirname(openhands.sdk.__file__))")
grep -n "requireApproval\|confirmation_policy\|ActionEvent" bff/services/event_normalize.py bff/routers/runs.py
cat bff/routers/gpu.py 2>/dev/null || find bff -iname "*gpu*"
grep -n "ENDPOINTS.RUNS.compare\|left=.*right=\|base=.*fork=" src/lib/*.ts src/features/**/*.ts 2>/dev/null
```

Record exactly what the pinned SDK version exposes before writing any code against it — do not assume the risk-scoring surface exists until confirmed here.

---

## 3.1 Security Analyzer risk indicators

### 3.1.1 Confirm the SDK surface exists at the pinned version

```bash
python3 -c "
from openhands.sdk.event import ActionEvent
print(ActionEvent.model_fields.keys())
"
```

Also check the SDK's security-analyzer module directly if the above doesn't show a risk field on the event itself:

```bash
find $(python3 -c "import openhands.sdk, os; print(os.path.dirname(openhands.sdk.__file__))") -iname "*security*"
```

**Decision gate:** if no risk-scoring field or module exists at `1.40.0`, stop this sub-stage, log the finding in `DEBUG_LOG.md` as a documented SDK-gap (not a bug), and skip to 3.2 with confirmation-policy work scoped to manual/all-or-none modes only (no risk-based mode) until the SDK surface lands in a future version. Do not fabricate a risk field that doesn't exist.

```bash
cat >> DEBUG_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — SDK gap: security-analyzer risk scoring
- Symptom: openhands-sdk==1.40.0 ActionEvent has no risk_level/risk_score field; no SecurityAnalyzer module found in package
- Affected stage: Stage 3.1
- Root cause: capability not present at this SDK version (confirmed via direct import inspection, not docs)
- Fix applied: none — deferred. Stage 3.2's confirmation policy scoped to manual/all/none modes only, risk_based mode gated behind this capability landing in a future SDK version
- Files changed: none
EOF
```

If confirmed present, continue to 3.1.2.

### 3.1.2 Surface `risk_level` in `event_normalize.py`

```bash
grep -n "def normalize_action\|class.*ActionEvent" bff/services/event_normalize.py
```

Add the field to the normalized output:

```python
# bff/services/event_normalize.py
def normalize_action(event: ActionEvent) -> dict:
    normalized = {
        # ... existing fields, do not remove any
        "riskLevel": getattr(event, "risk_level", None),
    }
    return normalized
```

Confirm the exact attribute name from 3.1.1's inspection — `risk_level` is illustrative; use whatever the SDK actually calls it.

### 3.1.3 Backend: expose via existing event API (no new endpoint needed)

```bash
grep -n "def get_events\|def list_events" bff/routers/runs.py
```

Confirm the normalized event payload (with the new `riskLevel` field) flows through the existing events endpoint/socket stream without any additional wiring — this should be automatic once `event_normalize.py` includes the field.

### 3.1.4 Frontend: risk badge component

```bash
find src -iname "*EventCard*" -o -iname "*Timeline*"
grep -n "Type.*ToolAction\|Type.*Observation" src/features/run-detail/*.tsx
```

Add a risk badge:

```typescript
// src/features/run-detail/RiskBadge.tsx
type RiskLevel = "low" | "medium" | "high";

const RISK_COLORS: Record<RiskLevel, string> = {
  low: "bg-gray-400",
  medium: "bg-yellow-500",
  high: "bg-red-600",
};

export function RiskBadge({ level }: { level: RiskLevel | null }) {
  if (!level) return null;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${RISK_COLORS[level]} text-white`}>
      {level}
    </span>
  );
}
```

Wire into the event timeline and terminal/command view components (locate exact insertion points from the grep above):

```bash
grep -rln "ActionEvent\|ToolAction" src/features/run-detail/
```

Add `<RiskBadge level={event.riskLevel} />` next to each action rendering.

### 3.1.5 Auto-collapse low-risk actions option

```bash
grep -n "useState\|collapsed" src/features/run-detail/Timeline.tsx 2>/dev/null
```

Add a settings toggle (persisted in local component state or user settings, matching whatever pattern the codebase already uses for view preferences):

```typescript
// inside the timeline component
const [autoCollapseLowRisk, setAutoCollapseLowRisk] = useState(false);
// when rendering each event:
const isCollapsed = autoCollapseLowRisk && event.riskLevel === "low";
```

Add a toggle control in the timeline's toolbar area.

### 3.1.6 Verify

```bash
pnpm dev
```

Trigger a real run with at least one higher-risk action (e.g., a file-delete or shell command the SDK flags). Confirm:
- The risk badge renders with the correct level next to the corresponding action in both the timeline and terminal view.
- Toggling auto-collapse hides low-risk actions and leaves medium/high visible.
- No badge renders (not a broken badge) for actions where `riskLevel` is null.

### 3.1.7 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 3.1: Security Analyzer risk indicators shipped
- Confirmed openhands-sdk==1.40.0 risk-scoring surface: [PRESENT / ABSENT — fill in from 3.1.1]
- Backend: surfaced risk field in event_normalize.py's action mapping (if present)
- Frontend: RiskBadge component wired into timeline and terminal views, auto-collapse toggle for low-risk actions
- Files touched (backend): bff/services/event_normalize.py
- Files touched (frontend): src/features/run-detail/RiskBadge.tsx, timeline/terminal view files
- Verification: risk badge confirmed rendering correctly on a real run with a flagged action
EOF
```

---

## 3.2 Policy-based confirmation

Depends on 3.1's outcome — if risk scoring is absent from the SDK, scope this to `all`/`none`/`manual` modes only; add `risk_based` as a documented future mode, not a fake one.

### 3.2.1 Inspect current confirmation mechanism

```bash
grep -n "requireApproval\|confirmation_policy" bff/routers/runs.py bff/models/*.py
grep -rn "requireApproval" src/features/run-creation/ src/features/agent-presets/
```

### 3.2.2 Backend: richer confirmation policy model

```python
# bff/models/confirmation_policy.py
from pydantic import BaseModel
from typing import Literal

RiskThreshold = Literal["low", "medium", "high"]
PolicyMode = Literal["all", "none", "manual", "risk_based"]

class ConfirmationPolicy(BaseModel):
    mode: PolicyMode = "manual"
    threshold: RiskThreshold | None = None  # required only when mode == "risk_based"

    def model_post_init(self, __context):
        if self.mode == "risk_based" and self.threshold is None:
            raise ValueError("threshold is required when mode is 'risk_based'")
```

If Stage 3.1 confirmed risk scoring is absent, add a runtime guard rejecting `risk_based` mode with a clear error rather than silently accepting a mode with no data to key off:

```python
# in the run-creation handler
if payload.confirmationPolicy.mode == "risk_based" and not RISK_SCORING_AVAILABLE:
    raise HTTPException(400, "risk_based confirmation mode requires SDK risk-scoring support, not available at pinned version")
```

### 3.2.3 Backend: forward to agent-server

```bash
grep -n "confirmation_policy" bff/services/agent_server_client.py
```

Confirm the exact shape the agent-server's `confirmation_policy` support expects; adapt the outgoing payload to match exactly (do not assume the shape — check the agent-server's OpenAPI schema or SDK type definitions):

```python
# bff/routers/runs.py — inside create_run
agent_config.confirmation_policy = {
    "mode": payload.confirmationPolicy.mode,
    "threshold": payload.confirmationPolicy.threshold,
}
```

### 3.2.4 Replace the single checkbox in the frontend

```bash
grep -rn "requireApproval" src/features/run-creation/*.tsx src/features/agent-presets/*.tsx
```

```typescript
// src/features/run-creation/ConfirmationPolicySelector.tsx
type PolicyMode = "all" | "none" | "manual" | "risk_based";

export function ConfirmationPolicySelector({
  value,
  onChange,
  riskScoringAvailable,
}: {
  value: { mode: PolicyMode; threshold?: "low" | "medium" | "high" };
  onChange: (v: { mode: PolicyMode; threshold?: "low" | "medium" | "high" }) => void;
  riskScoringAvailable: boolean;
}) {
  return (
    <div>
      <select value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as PolicyMode })}>
        <option value="all">Approve all actions</option>
        <option value="none">Auto-approve everything</option>
        <option value="manual">Manual (current default)</option>
        <option value="risk_based" disabled={!riskScoringAvailable}>
          Risk-based {!riskScoringAvailable ? "(unavailable at current SDK version)" : ""}
        </option>
      </select>
      {value.mode === "risk_based" && (
        <select
          value={value.threshold ?? "medium"}
          onChange={(e) => onChange({ ...value, threshold: e.target.value as any })}
        >
          <option value="low">Low and above</option>
          <option value="medium">Medium and above</option>
          <option value="high">High only</option>
        </select>
      )}
    </div>
  );
}
```

Replace the existing checkbox usages in both the run-creation form and the Agent Presets editor with this component.

### 3.2.5 Verify

```bash
pnpm dev
```

- Create a preset/run with `mode: "all"`: confirm every action pauses for approval.
- Create one with `mode: "none"`: confirm no approval prompts occur.
- If risk scoring is available, create one with `mode: "risk_based", threshold: "medium"`: confirm only medium+ risk actions pause.
- Confirm the `risk_based` option is visibly disabled with an explanatory label if risk scoring is unavailable — never silently broken.

### 3.2.6 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 3.2: Policy-based confirmation shipped
- Backend: ConfirmationPolicy model (all/none/manual/risk_based), forwarded to agent-server's confirmation_policy support, guard rejecting risk_based when SDK risk-scoring unavailable
- Frontend: ConfirmationPolicySelector replacing single checkbox in run-creation and Agent Presets forms
- Files touched (backend): bff/models/confirmation_policy.py, bff/routers/runs.py
- Files touched (frontend): src/features/run-creation/ConfirmationPolicySelector.tsx, agent-presets editor file
- Verification: all/none/manual modes confirmed behaviorally correct; risk_based confirmed either working or correctly disabled per 3.1's finding
EOF
```

---

## 3.3 `DependencyGuard` port (slopsquatting defense)

This is a new capability closing a real gap: Forge-OH is explicitly authorized to run `pip install`/`npm install`/`docker compose up` as part of agent self-verification, and an unsupervised install on a hallucinated package name is a direct compromise path.

### 3.3.1 Inspect where installs currently happen unchecked

```bash
grep -rn "pip install\|npm install\|subprocess.*install" openhands_tools_ext/ bff/ 2>/dev/null
```

Identify every code path where the agent can trigger a package install — this guard must intercept all of them, not just one.

### 3.3.2 Backend: registry verification module

```python
# openhands_tools_ext/dependency_guard/registry_check.py
import httpx
from datetime import datetime, timezone
from pydantic import BaseModel

class PackageCheckResult(BaseModel):
    package: str
    exists: bool
    registered_at: datetime | None = None
    age_days: int | None = None
    flagged: bool = False
    reason: str | None = None

async def check_pypi_package(name: str) -> PackageCheckResult:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"https://pypi.org/pypi/{name}/json")
    if resp.status_code == 404:
        return PackageCheckResult(package=name, exists=False, flagged=True, reason="Package does not exist on PyPI")
    resp.raise_for_status()
    data = resp.json()
    releases = data.get("releases", {})
    upload_times = []
    for version_files in releases.values():
        for f in version_files:
            if "upload_time_iso_8601" in f:
                upload_times.append(f["upload_time_iso_8601"])
    if not upload_times:
        return PackageCheckResult(package=name, exists=True, flagged=True, reason="No upload history found")
    earliest = min(upload_times)
    registered_at = datetime.fromisoformat(earliest.replace("Z", "+00:00"))
    age_days = (datetime.now(timezone.utc) - registered_at).days
    flagged = age_days < 90
    return PackageCheckResult(
        package=name, exists=True, registered_at=registered_at, age_days=age_days,
        flagged=flagged, reason="Registered within last 90 days" if flagged else None,
    )

async def check_npm_package(name: str) -> PackageCheckResult:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"https://registry.npmjs.org/{name}")
    if resp.status_code == 404:
        return PackageCheckResult(package=name, exists=False, flagged=True, reason="Package does not exist on npm")
    resp.raise_for_status()
    data = resp.json()
    created = data.get("time", {}).get("created")
    if not created:
        return PackageCheckResult(package=name, exists=True, flagged=True, reason="No creation date found")
    registered_at = datetime.fromisoformat(created.replace("Z", "+00:00"))
    age_days = (datetime.now(timezone.utc) - registered_at).days
    flagged = age_days < 90
    return PackageCheckResult(
        package=name, exists=True, registered_at=registered_at, age_days=age_days,
        flagged=flagged, reason="Registered within last 90 days" if flagged else None,
    )
```

### 3.3.3 Backend: allowlist gating

```python
# openhands_tools_ext/dependency_guard/allowlist.py
import json
from pathlib import Path

ALLOWLIST_PATH = Path("config/dependency_allowlist.json")

def load_allowlist() -> set[str]:
    if not ALLOWLIST_PATH.exists():
        return set()
    return set(json.loads(ALLOWLIST_PATH.read_text()))

def is_allowlisted(package: str) -> bool:
    return package in load_allowlist()

def add_to_allowlist(package: str):
    allowlist = load_allowlist()
    allowlist.add(package)
    ALLOWLIST_PATH.write_text(json.dumps(sorted(allowlist), indent=2))
```

```bash
mkdir -p config
echo "[]" > config/dependency_allowlist.json
```

### 3.3.4 Backend: the gate itself, wired into the install path(s) found in 3.3.1

```python
# openhands_tools_ext/dependency_guard/gate.py
from .registry_check import check_pypi_package, check_npm_package
from .allowlist import is_allowlisted

class DependencyBlockedError(Exception):
    def __init__(self, result):
        self.result = result
        super().__init__(f"Dependency {result.package} blocked: {result.reason}")

async def guard_install(package: str, ecosystem: str) -> None:
    if is_allowlisted(package):
        return
    checker = check_pypi_package if ecosystem == "pypi" else check_npm_package
    result = await checker(package)
    if not result.exists or result.flagged:
        raise DependencyBlockedError(result)
```

Wire this into every install path identified in 3.3.1, e.g.:

```python
# wherever pip install is currently invoked
from openhands_tools_ext.dependency_guard.gate import guard_install, DependencyBlockedError

async def install_dependency(package: str, ecosystem: str = "pypi"):
    try:
        await guard_install(package, ecosystem)
    except DependencyBlockedError as e:
        # route to human approval instead of raising to a dead end
        await notification_channel.request_approval(
            title=f"Dependency install blocked: {package}",
            reason=e.result.reason,
            payload=e.result.model_dump(),
        )
        return
    # proceed with actual install
```

Confirm `notification_channel.request_approval` matches the existing approval-gate pattern already used for HITL confirmations (from Stage 3.2) — reuse it, do not build a parallel approval path.

### 3.3.5 CI: lockfile hash pinning enforcement

```bash
cat .github/workflows/ci.yml
```

Add a CI step verifying lockfile integrity:

```yaml
# .github/workflows/ci.yml — add step
- name: Verify lockfile hash pinning
  run: |
    pip install pip-audit
    pip-audit -r requirements.lock --require-hashes || exit 1
```

Confirm `requirements.lock` actually contains hashes; if not, regenerate with hash pinning:

```bash
pip-compile --generate-hashes -o requirements.lock bff/requirements.txt
```

### 3.3.6 Frontend: approval surface for flagged packages

```bash
grep -rn "ApprovalCard\|useApproval" src/features/run-detail/
```

Reuse the existing HITL approval UI pattern — confirm the flagged-dependency approval request (from 3.3.4's `notification_channel.request_approval` call) renders through the same component, not a new one:

```typescript
// src/features/run-detail/ApprovalCard.tsx — extend to handle the new payload shape
if (approval.title.startsWith("Dependency install blocked")) {
  return (
    <div>
      <p>{approval.reason}</p>
      <pre>{JSON.stringify(approval.payload, null, 2)}</pre>
      <button onClick={() => approve(approval.id)}>Allow this one-time</button>
      <button onClick={() => approveAndAllowlist(approval.id, approval.payload.package)}>Allow and add to allowlist</button>
      <button onClick={() => reject(approval.id)}>Reject</button>
    </div>
  );
}
```

Add the corresponding backend endpoint for "allow and add to allowlist":

```python
# bff/routers/dependency_guard.py
from fastapi import APIRouter
from openhands_tools_ext.dependency_guard.allowlist import add_to_allowlist

router = APIRouter()

@router.post("/api/dependency-guard/allowlist")
async def allowlist_package(package: str):
    add_to_allowlist(package)
    return {"status": "added", "package": package}
```

Register this router in `bff/main.py` alongside the others.

### 3.3.7 Verify

```bash
# Simulate a hallucinated package name
python3 -c "
import asyncio
from openhands_tools_ext.dependency_guard.gate import guard_install, DependencyBlockedError
async def main():
    try:
        await guard_install('this-package-definitely-does-not-exist-xyz123', 'pypi')
        print('FAIL: should have raised')
    except DependencyBlockedError as e:
        print('PASS:', e)
asyncio.run(main())
"
```

Trigger a real agent task that attempts to install a nonexistent or very-recently-registered package, confirm:
- The install is blocked before executing.
- A human-approval request appears in the run-detail UI with the exact reason (nonexistent vs. too-new).
- "Allow and add to allowlist" persists the package and a subsequent identical request skips the check.
- CI fails if `requirements.lock` hashes are stripped or tampered with.

### 3.3.8 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 3.3: DependencyGuard port shipped
- Backend: registry_check.py (PyPI/npm existence + age check), allowlist.py, gate.py wired into all identified install code paths, POST /api/dependency-guard/allowlist
- CI: added pip-audit lockfile hash verification step
- Frontend: extended ApprovalCard to render blocked-dependency approvals with allow-once/allow-and-allowlist/reject actions
- Files touched (backend): openhands_tools_ext/dependency_guard/*.py, bff/routers/dependency_guard.py, bff/main.py, [install call sites from 3.3.1]
- Files touched (CI): .github/workflows/ci.yml, requirements.lock (regenerated with hashes)
- Files touched (frontend): src/features/run-detail/ApprovalCard.tsx
- Verification: hallucinated package blocked pre-install, real approval flow confirmed end to end, allowlist persistence confirmed
- Both halves shipped together: yes
EOF
```

---

## 3.4 GPU thermal-hook staleness fix

### 3.4.1 Inspect

```bash
find bff -iname "*gpu*"
cat bff/routers/gpu.py
grep -rn "gpu.*hook\|thermal" openhands_tools_ext/ bff/
```

Confirm the exact poller implementation and where the `/api/gpu` snapshot is assembled.

### 3.4.2 Backend: add `last_poll_ts`

```python
# bff/routers/gpu.py — locate the snapshot-building function
import time

def build_gpu_snapshot():
    # ... existing sampling logic, unchanged
    return {
        # ... existing fields
        "lastPollTs": time.time(),
    }
```

Confirm this timestamp is set at the moment of the actual poll, not at request-serving time — if the poller runs in a background task and the endpoint just reads its last cached result, the timestamp must come from the poller's last successful sample, not `time.time()` called inside the request handler:

```bash
grep -n "background_task\|asyncio.create_task\|while True" bff/services/gpu_poller.py 2>/dev/null
```

Adjust accordingly — store `last_poll_ts` as module-level or class-level state updated by the poller loop itself, and have the endpoint read that stored value.

### 3.4.3 Consumer: staleness check in the GPU hook

```bash
find openhands_tools_ext -iname "*gpu*hook*"
cat openhands_tools_ext/gpu_hook.py 2>/dev/null
```

```python
# openhands_tools_ext/gpu_hook.py
import time
import logging

logger = logging.getLogger(__name__)
STALENESS_THRESHOLD_SECONDS = 30

def check_gpu_snapshot_staleness(snapshot: dict) -> bool:
    last_poll_ts = snapshot.get("lastPollTs")
    if last_poll_ts is None:
        logger.warning("GPU snapshot has no lastPollTs field — cannot determine staleness, failing open")
        return True  # fail open, but now visibly logged
    age = time.time() - last_poll_ts
    if age > STALENESS_THRESHOLD_SECONDS:
        logger.warning(f"GPU snapshot is stale: {age:.1f}s since last poll (threshold {STALENESS_THRESHOLD_SECONDS}s). Poller may be dead.")
        return True  # still fail open per documented safety philosophy, but now visible
    return False
```

Confirm this function is actually called at every point the GPU hook currently consumes a snapshot — grep for existing call sites and wire the staleness check into each:

```bash
grep -rn "get_gpu_snapshot\|gpu_snapshot" openhands_tools_ext/
```

### 3.4.4 Verify

```bash
# Kill the poller process/task deliberately, wait 35+ seconds, then check logs
tail -f logs/forge-oh.log | grep -i "stale"
```

Confirm the WARNING appears with a real elapsed-time figure when the poller is artificially stopped, and confirm it does NOT appear during normal operation with a live poller.

### 3.4.5 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 3.4: GPU thermal-hook staleness visibility shipped
- Backend: added lastPollTs to /api/gpu snapshot, sourced from the poller's actual last-sample time, not request-serving time
- Consumer: gpu_hook.py checks staleness against threshold (30s), logs visible WARNING, still fails open per documented safety philosophy
- Files touched: bff/routers/gpu.py, bff/services/gpu_poller.py, openhands_tools_ext/gpu_hook.py
- Verification: WARNING confirmed firing when poller artificially killed, silent during normal operation
EOF
```

---

## 3.5 Compare-endpoint contract fix

### 3.5.1 Inspect both sides of the mismatch

```bash
grep -rn "ENDPOINTS.RUNS.compare\|/compare" src/
grep -n "def compare_runs\|@router.get.*compare" bff/routers/runs.py
```

Confirm the frontend builds `?left=&right=` and the backend route/its actual callers use `?base=&fork=` — do not assume this from the prior audit without re-confirming against the live code, since Stage 1-2 changes may have touched this area incidentally.

### 3.5.2 Check for live callers before fixing

```bash
grep -rn "ENDPOINTS.RUNS.compare" src/ --include="*.ts" --include="*.tsx"
```

If zero callers exist, this is dead code — confirm with the same grep discipline as Stage 1.4, then either delete the unused helper or fix it for future use, per your judgment on whether run-comparison is a near-term feature. If callers exist, proceed to fix.

### 3.5.3 Fix the frontend helper to match the backend's real contract

```typescript
// src/lib/endpoints.ts (or wherever ENDPOINTS.RUNS.compare is defined)
export const ENDPOINTS = {
  RUNS: {
    // before: compare: (left: string, right: string) => `/api/runs/compare?left=${left}&right=${right}`,
    compare: (base: string, fork: string) => `/api/runs/compare?base=${base}&fork=${fork}`,
  },
};
```

Update every call site to pass `base`/`fork` semantics correctly (confirm which run ID is the base and which is the fork from the backend's actual handler logic, not by guessing from parameter names):

```bash
grep -n "def compare_runs" -A 15 bff/routers/runs.py
```

### 3.5.4 Verify

```bash
curl "http://localhost:8000/api/runs/compare?base=RUN_ID_1&fork=RUN_ID_2"
```

Confirm a real response, then trigger the same comparison through the UI (if a UI path exists) and confirm it matches.

### 3.5.5 Log

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 3.5: Compare-endpoint contract fixed
- Fixed src/lib/endpoints.ts RUNS.compare helper from ?left=&right= to ?base=&fork= matching real BFF contract
- Files touched: src/lib/endpoints.ts and confirmed call sites
- Verification: curl against live BFF confirms correct params; UI path (if present) confirmed matching
EOF
```

---

## Stage 3 exit gate — do not proceed to Stage 4 until all pass

```bash
cd ~/dev/forge-oh
pytest bff/tests/ -q
pnpm typecheck
pnpm test:unit
pnpm build
```

Manual verification checklist:
- [ ] Risk badges render correctly on real run actions (or are confirmed absent with a documented `DEBUG_LOG.md` SDK-gap entry if unavailable at this SDK version).
- [ ] Confirmation policy selector replaces the old checkbox in both run-creation and Agent Presets; all/none/manual modes behave correctly; risk_based is either functional or correctly disabled with an explanatory label.
- [ ] A hallucinated/nonexistent package install is blocked pre-install and surfaces a real human-approval request in the UI; allowlisting persists and skips the check on retry.
- [ ] CI fails on a tampered/unhashed lockfile.
- [ ] GPU snapshot staleness produces a visible WARNING only when the poller is actually dead, never during normal operation.
- [ ] Compare-endpoint contract mismatch is fixed (or confirmed dead and handled per your judgment call in 3.5.2).

## Final Stage 3 log entry

```bash
cat >> BUILD_LOG.md << 'EOF'

## $(date '+%Y-%m-%d %H:%M %Z') — Stage 3 COMPLETE
- All Stage 3 exit-gate checks passed
- Security/approval maturity raised: risk indicators (or documented SDK gap), policy-based confirmation, DependencyGuard slopsquatting defense, GPU staleness visibility, compare-endpoint contract fixed
- Next action: begin Stage 4.1 (RepoGraph enablement — DozerDB connectivity confirmation)
EOF

cat > SESSION_HANDOFF.md << 'EOF'
# Session Handoff

**Current stage:** Stage 3 complete, ready to begin Stage 4 (RepoGraph + Code Intelligence / LSP Tier).

**Completed this session:**
- Stage 3.1 through 3.5, all verified per exit-gate checklist above.

**Remaining before Stage 3 Definition of Done:** none — Stage 3 is fully complete.

**Open questions awaiting review:**
- [If 3.1 found risk scoring absent at SDK 1.40.0]: risk_based confirmation mode remains disabled pending future SDK support — no action needed now, revisit on SDK upgrade.

**Exact next action:** Begin Stage 4.1 — confirm DozerDB connectivity for RepoGraph's tree-sitter/symbol extraction workload, flip repograph_enabled to env-driven.
EOF
```
