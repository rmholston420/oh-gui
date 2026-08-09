# OH-GUI Project Skills

Skills in this directory are discovered natively by the OpenHands SDK as **project skills**
(`openhands/sdk/skills/__init__.py` → `load_project_skills`, which reads `.agents/skills/`).
User-scope skills live in `~/.openhands/skills/` and are not tracked here.

This is a native SDK path, not an OH-GUI convention. Nothing in this repo loads these files.

## OH-GUI-native

| Skill | Covers |
|---|---|
| `oh-gui-repo-navigation` | Where things live; spec-first and SDK-source-first rules |
| `playwright-oh-gui` | Live-workflow e2e discipline; mutation-testing your specs |
| `oh-gui-log-discipline` | The four operational logs; search-DEBUG_LOG-first |

## Ported from Forge-OH (generic, domain-neutral)

`benchmarking-discipline` · `debug-first-response` · `deep-research` ·
`env-and-secrets-discipline` · `fastapi-router-authoring` · `git-workflow` ·
`http-api-authoring` · `local-llm-integration` · `markdown-docs-authoring` · `planning` ·
`python-testing-discipline` · `shell-hygiene` · `skill-authoring` · `vllm-serving-pitfalls` ·
`web-frontend-authoring`

## Deliberately not ported

| Donor skill | Why |
|---|---|
| `socketio-events-tracing` | OH-GUI has no Socket.IO. Verified: no match in `apps/gui/src` or `services/middleware/src`. |
| `forge-oh-event-normalizer` | Describes a BFF wire format that renames SDK event kinds. ADR-015 forbids that layer here — OH-GUI exposes native event shapes. |
| `bff-router-authoring` | Forge-OH BFF specifics. The transferable half is already covered by `fastapi-router-authoring`. |
| `openhands-agent-server-proxy` | Assumes a BFF proxying to :8090. OH-GUI's GUI calls the agent-server directly (`apps/gui/src/api/agentServer.ts`). |
| `bff-fe-contract-sync` | Assumes hand-written Zod mirrors of Pydantic models. OH-GUI's DTO boundary is generated, not hand-synced. |
| `forge-oh-repo-navigation` | Rewritten as `oh-gui-repo-navigation`. |
| `playwright-forge-oh` | Rewritten as `playwright-oh-gui`. |
