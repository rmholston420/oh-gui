# Kosmos Session Handoff — 2026-08-09 03:19 EDT

## Current build-sequencing position

- **Stage / phase:** Phase 1 — Authorization slice (spec `04-authorization.md`), with Phase 0/4 layout
  primitives pulled forward because Phase 1's lens constraints cannot be satisfied without them.
- **Plugin / kernel component:** `apps/gui/` (Tier 6, GUI) against a live `agent-server` at
  `http://127.0.0.1:8000/api`. No middleware process exists yet; the frontend currently talks to
  agent-server directly, which is a **known ADR-001 deviation** deferred to the middleware slice.
- **Port(s) in progress:** none crossed. Canvas rendering work is GUI-local projection over
  already-fetched events, so no adapter is owed (same basis as the ADR-025 agent-account port).

## Completed this session

- `f967d4e` — GUI wired to the live agent-server (`src/api/{types,agentServer}.ts`,
  `features/run/{useConversation,RunView}`); demo surfaces moved behind `?demo=1`; Vite proxies `/api`.
- `702363c` — **Approval gate**: approve/reject pending actions via `respond_to_confirmation`,
  trust dial wired to `confirmation_policy`. Gate green at 16 files / 124 tests.
- `4d987f3` — **Log-integrity fix**: 10 timestamps were written in UTC but suffixed `EDT` (up to 4h
  in the future), traced by `git log -S` to `bab46c9`/`a40a1e3` and corrected to true America/Detroit
  times. Added `scripts/check-log-timestamps.py` (289 stamps / 56 files; future-dated + wrong-zone-
  suffix arms, both mutation-tested and seen to fail).
- **ADR-014 item 1 remains the verified basis** for the hook seam: a wildcard `pre_tool_use` COMMAND
  hook passed inline via `StartConversationRequest.hook_config` blocked a real terminal action
  (conversation `6c969d8f-4525-4b59-9848-972723d75059`). Items 2–4 stay deferred to Phase 1b.
  **No middleware may assume timeout-denies-closed until item 2 passes.**

## Uncommitted in the working tree (deliberate)

- **Lens shell + design tokens** (`src/theme/`, `src/features/lens/`, `src/shell/`) — delivered and
  self-tested (10 tests, 5 mutants killed: dead toggle, dead rail collapse, fail-open viewport gate,
  dropped persistence, and a third `standard` lens being admitted). Held back from commit because the
  authoritative `npm run gate` has not yet run over it.
- **Canvas event-rendering port** (`src/features/events/`) — subagent in flight at time of writing.
- Staged log entries awaiting merge: `/tmp/blog-lens.md`, `/tmp/blog-events.md`, `/tmp/ledger-events.md`.

## Remaining before the current Definition of Done

1. Merge both subagent outputs, wire `Shell` + ported event rendering into `App.tsx`/`RunView.tsx`
   (neither subagent was permitted to touch those, to keep file ownership disjoint).
2. Run the authoritative `npm run gate` over the merged result, then commit and push.
3. **Headed Playwright spec driving the LIVE agent-server** (`e2e/live-run.spec.ts`): type a goal,
   start a run, watch events stream, exercise Approve and Reject. Operator watches; he is never asked
   to click through the GUI himself. Runs as a separate `test:e2e:live` suite so model latency
   (20–40s/conversation) stays out of the fast gate.
4. Convert the mocked-fetch unit tests to run against the real server, keeping a mock only for the
   malformed-response case (a healthy server cannot be made to return garbage on demand).

## Open questions / awaiting operator answer

- **Breakpoint arithmetic at exactly 1600px (spec 03 §3.2).** A 280px rail + 380px conversation
  column + a center stage of "≥60%" sums to ≥1620px, so the three cannot coexist at 1600px as
  written. Current CSS preserves `minmax(60%, 1fr)` and permits slight horizontal overflow rather
  than shrinking the center stage. Alternatives: let the rail shrink below 280px, or move the 4-region
  breakpoint up to 1620px. **Unresolved — spec says one thing, geometry another.**
- Default model: `qwen3.6:27b-coder` returned no `tool_calls` in a direct probe. If the agent narrates
  instead of acting during the live run, switch to `hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL`.

## Exact next action

Wait for `port_canvas_event_rendering`, merge its files plus the staged log entries, wire both new
surfaces into `App.tsx`, then:

```bash
cd /tmp/ohg/apps/gui && export PATH=/tmp/node-v22.14.0-linux-x64/bin:$PATH && npm run gate
```
