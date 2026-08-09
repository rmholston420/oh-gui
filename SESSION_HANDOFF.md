# Kosmos Session Handoff — 2026-08-09 01:44 EDT

## Current build-sequencing position
- **Stage / phase:** Phase 1 — Authorization slice, plus cross-cutting governance
- **Plugin / kernel component:** hard-constraints runner; ADR corpus; stack-component register
- **Port(s) in progress:** none open

## Completed this session
- Filed 14 donor specs verbatim, sha256-verified byte-identical, with provenance headers.
- Recovered the Council-Synthesis and corrected its slice numbering to 7.0–7.9.
- ADR-026 D5 enforced as five gates; all mutation-tested. Runner: 21 enforced, exit 0.
- Wired constraints into `npm run gate` and proved it fails on a planted violation.
- Diagnosed and re-armed `provisional_types_not_wired`, dead since 2026-08-08 (DEBUG_LOG 01:30).
- ADR-015 amendment 2: PRESENT-BUT-UNCONSUMED, enforced by `unconsumed_native_fields_not_wired`.
- ADR-027 ratified: OpenHands is the harness; tier 5 renamed; native-first is a burden of proof;
  LangGraph, CrewAI, AutoGen refused.
- `docs/specs/16-stack-layers.md`: all 44 stack components registered with a status.
- ADR-014 reviewed for ratification and **declined** — see below.

## Remaining before the current Definition of Done
- Phase 1 authorization surface is still demo-only: everything runs on `DEMO_ACTIONS` in `App.tsx`.
  Reject is not wired to `conversation.reject_pending_actions(reason)`.
- Untrusted badge (§04a) · §4.2.1 audit log · §4.1 per-task-type trust dial · §4.3 thirteen batching
  triggers · §8.4 model-profile fields · §8.5/§8.6 tool-call-depth and 30-concurrent warning ·
  §04a quarantine audit batching.
- **Vibe/Pro lens primitive is Phase 1 scope per ADR-017 and does not exist anywhere in `apps/gui/`.**
- Carried debt: wizard §3.4 items 1 and 3 inert pending middleware; `trust-dial.ts` mirror owed to the
  middleware schema; ADR-016 baseline benchmark unrun; PORTING_LEDGER `canvas_extensions` entry carries
  a future timestamp (`2026-08-09 03:45 EDT`) — correct it.
- Stale worktree `/tmp/ohg-prev` at `68f8ffd` — `git worktree remove`.

## Open questions / awaiting operator answer
1. **Autonomy (red).** `01-principles.md` #4 requires per-action approval; Vibe mode is specified as a
   mostly/fully autonomous app factory. These cannot both hold. Proposed resolution is a plan-level
   decision boundary — approve a plan, not each action — which needs an ADR.
2. **One product or two (red).** Principle #9 and ADR-003 say "two lenses, one operator"; the Vibe/Pro
   definitions describe two different people.
3. **Review budget (yellow).** Principle #6 budgets ~400 reviewed lines per session, which sits oddly
   with the operator's stated preference not to read diffs.
4. **Memory layer.** Six components are NATIVE-FIRST PENDING per component. The layer-level gap is
   proven; each still needs its own finding before adoption.
5. **Graph visualisation.** Five candidate renderers for one job. Needs a named view in a spec first.

## Exact next action
Run ADR-014's four verification items on Colossus — they are the only thing blocking the Phase 1
authorization slice from moving past demo data, and they cannot run in the agent sandbox (no container
runtime). From `~/dev/oh-gui`:

```bash
cd ~/dev/oh-gui && git pull
source .oh-venv/bin/activate 2>/dev/null || python3 -m venv .oh-venv && source .oh-venv/bin/activate
python3 scripts/extract_image_sdk.py --verify
python3 -m pytest scripts/tests/test_check_hard_constraints.py -q
```

Then item 1 of the gate: install a `pre_tool_use` COMMAND hook returning `{"decision":"deny"}` with
exit 2 against the pinned agent-server, ask the agent to write a file, and assert **the file does not
exist** — not that the hook logged. Items 2–4 follow in `adrs/ADR-014-*.md`.
