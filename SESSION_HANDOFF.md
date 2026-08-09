# Kosmos Session Handoff — 2026-08-08 22:15 EDT

## Current build-sequencing position
- **Stage / phase:** Phase 1 · Authorization slice
- **Plugin / kernel component:** middleware IPC seam (`ohgui_middleware.ipc`)
- **Port(s) in progress:** none open — the IPC schema is now verified against the pinned image

## Completed this session
- Governance fan-out (04a §4.9.1, 14-spec-wizard H1, ADR-014 fifth verification item),
  merged to `main`.
- Removed the hardcoded gate count from the `verify-local.sh` banner; guarded by a test.
- **ADR-014 verification item 5 discharged.** Captured the `pre_tool_use` envelope from
  `agent-server@sha256:f0244fd7…` and corrected four of eight fields in `AuthorizeRequest`.
- `AUTHORIZE_REQUEST_PROVISIONAL` cleared, and the clearing is itself guarded.
- Full mutation records in BUILD_LOG 22:10 EDT. Two DEBUG_LOG entries (21:58, 22:04).

## Remaining before the current Definition of Done
Phase 1 exit criteria are §4.12 (per ADR-017). Six KNOWN_ISSUES items remain:
1. §3.2 / v4.3 900px read-only — cheapest, establishes the headed-Playwright pattern
2. §4.1 per-task-type trust dial
3. §4.3 thirteen batching triggers
4. §8.4 model-profile fields
5. §8.5 / §8.6 tool-call-depth axis + 30-concurrent warning
6. §04a quarantine audit batching

Carried debt: wizard §3.4 items 1 & 3 inert; `trust-dial.ts` is still a hand-maintained SDK
mirror (now clearly the highest-risk remaining one, given what the envelope capture found);
ADR-016 baseline benchmark unrun (~3-5 GPU hours).

## Open questions / awaiting your answer
- **ADR-014 items 1-4 need a live agent-server.** The item-5 capture is static: it proves the
  envelope's shape, not that a running agent populates it as expected. Items 1-4 need a real
  conversation driving a real tool call, which needs an LLM on Colossus (Ollama). Worth
  scheduling as its own slice.

## Exact next action
```bash
cd ~/dev/oh-gui && git pull && bash scripts/capture-hook-envelope.sh
```
Confirms the capture reproduces on Colossus against the real image (the agent ran it against
the real binary, but with a stubbed `docker`).
