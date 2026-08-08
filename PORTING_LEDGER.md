# OH-GUI Porting Ledger

Every vendored or ported component is logged here **before** it is wrapped behind
an OH-GUI port. Vendoring a verified permissively-licensed OSS component is
always preferred over hand-building anything already solved upstream.

Entry format:

```
## <component name>
- Sub-problem:
- Source URL:
- Commit SHA:
- SPDX license:
- Vendored to:
- Wrapped behind port:
- Modification notes:
- Logged: YYYY-MM-DD HH:MM EDT
```

---

## Primary donor - OpenHands Agent Canvas (ADR-001)

Per [ADR-001](adrs/ADR-001-integration-boundary.md), Agent Canvas is a **donor source**,
not a base to extend. It is MIT-licensed and was archived 2026-07-27, which makes it a
frozen, stable donor with no upgrade treadmill. Vendor selectively, attribute, log here.

| Surface | Donor path | Status |
|---|---|---|
| Conversation / terminal / files / settings / browser panes | `src/components/*` | Not ported - survey first |
| Planner surface | `src/routes/planner-tab.tsx` | Not ported - donor for the Phase 3 Plan workbench |
| Changes surface | `src/routes/changes-tab.tsx` | Not ported - donor for the Phase 2 review workbench |
| Commits surface | `src/routes/commits-tab.tsx` | Not ported |
| Task list surface | `src/routes/task-list-tab.tsx` | Not ported |

Attribution requirement: every vendored file carries an SPDX header and a source
comment naming the upstream repo, path, and commit SHA it came from.

## Runtime dependencies (pinned, NOT ports)

Recorded here so they are never mistaken for vendored code.

| Artifact | Pin method | Notes |
|---|---|---|
| `ghcr.io/openhands/agent-server` | Docker digest | Tags are commit SHAs, not semver |
| `openhands-sdk`, `openhands-tools`, `openhands-workspace`, `openhands-agent-server` | Python lockfile | Middleware-side; owns the policy plane |
| `@openhands/typescript-client` | Frontend lockfile | **Alpha** - API may change without notice; must sit behind the middleware anti-corruption layer |

## Pre-identified port candidates (not yet ported)

From `docs/specs/12-portable-components.md`. These are **candidates only** - no
entry below counts as ported until it has a full entry in the section above with
a pinned commit SHA and verified SPDX license.

| Sub-problem | Candidate source | Status |
|---|---|---|
| Diff virtualization | Zhang-JiahangH/react-virtualized-diff | Not ported - benchmark against Monaco first (spec 6.3) |
| Terminal pane | Qovery/react-xtermjs | Not ported |
| Command palette | cmdk / react-cmdk | Not ported |
| Rewind/fork UX + DAG graph | microsoft/agdebugger | Not ported - lift graph component (spec 5.5.1) |
| Authorization card UX | agentkitai/agentgate | Not ported - reference only, read dashboard source |
| "Needs you" inbox UX | langchain-ai/agent-inbox | Not ported - reference only |
| Motion stack | motion (`motion/react`) | Not vendored - npm dependency, not a port |
| Glassmorphism / UI material | Aceternity UI, Magic UI | Not vendored - copy-paste source into `components/ui/`, never npm-installed |

## First-party SDK primitives - wire directly, do NOT port or rebuild

Recorded here so no future session mistakes these for port candidates. **All are Python
and run in the OH-GUI middleware, never in the browser** (ADR-001).

- `StuckDetector` (openhands-sdk)
- `conversation.ask_agent()` (openhands-sdk)
- `state.block_action()` / `state.block_message()` (openhands-sdk)
- `switch_llm` built-in tool (openhands-sdk)
- Confirmation policies: `AlwaysConfirm()`, `NeverConfirm()`, `ConfirmRisky()`
- Security analyzers: `Pattern`, `PolicyRail`, `LLM`, `GraySwan`, `Ensemble`

## Confirmed new-build work - no upstream equivalent

- The durable Plan object (`docs/specs/05-plan-model.md`)
- Drift detection
- Capability manifest
- Compare-mode merge logic
- The multi-backend GPU/accelerator telemetry adapter
  (`nvidia-smi` / `rocm-smi` / `powermetrics` / `/sys/class/thermal`)
