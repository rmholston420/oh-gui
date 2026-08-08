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

Recorded here so no future session mistakes these for port candidates.

- `StuckDetector` (openhands-sdk)
- `conversation.ask_agent()` (openhands-sdk)
- `state.block_action()` / `state.block_message()` (openhands-sdk)
- `switch_llm` built-in tool (openhands-sdk)

## Confirmed new-build work - no upstream equivalent

- The durable Plan object (`docs/specs/05-plan-model.md`)
- Drift detection
- Capability manifest
- Compare-mode merge logic
- The multi-backend GPU/accelerator telemetry adapter
  (`nvidia-smi` / `rocm-smi` / `powermetrics` / `/sys/class/thermal`)
