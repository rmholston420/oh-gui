# OH-GUI Session Handoff — 2026-08-09 02:50 EDT

## Current build stage
- **Stage:** Phase 1 run-workspace surface — complete for the agent-server GUI wiring task.
- **Component:** `apps/gui` local agent-server adapter, lifecycle hook, and `RunView`.
- **Repository state:** No commit or push was made. No file under `review/_sdk_src/` was changed.

## Completed this session
- Read the authoritative server contract, existing application and authorization code, ADR-015, ADR-030, nearby conventions, and the required SDK evidence before implementation.
- Added contract-bounded `src/api/types.ts` and `src/api/agentServer.ts` with a Colossus-local Ollama start request, verified tool registry keys/import map, native route calls, non-2xx error propagation, and a best-effort conversation read.
- Added `src/features/run/useConversation.ts` and `RunView.tsx`: create/run lifecycle, 3-second event count/search polling, durable server-object status rendering, elapsed time, events, pause, and stop.
- Switched normal application boot to `RunView`; retained the prior demo behind `?demo=1` and updated browser test routes accordingly.
- Added the local `/api` Vite proxy to `http://127.0.0.1:8000`.
- Added type/client/hook tests; client tests mock `fetch`, and hook tests use a mocked client.
- Resolved the sole gate failure: the evidence-snapshot guard rejected a literal `review/_sdk_src` prefix in code comments. Comments now retain exact artifact-relative SDK file:line citations without the forbidden prefix. The diagnosis is recorded in `DEBUG_LOG.md`.

## Verification
- `export PATH=/tmp/node-v22.14.0-linux-x64/bin:$PATH; cd /tmp/ohg/apps/gui && npm run gate` — passed: constraints, lint, 15 test files / 118 tests, and build.
- `python3 /tmp/ohg/scripts/check-hard-constraints.py` — printed `=== PASSED ===`.
- `git diff --check` passed.
- `review/_sdk_src/` has no modified files. The Vite `dist/` directory is ignored output from the required build.

## Remaining before the current Definition of Done
- Nothing required by this task remains. A live local agent-server smoke run was not performed because no server process was started in this session.

## Open questions / ambiguity
- None.

## Exact next action
- Review the uncommitted implementation in `/tmp/ohg`, then start the local agent-server and open the GUI for an optional live smoke test.
