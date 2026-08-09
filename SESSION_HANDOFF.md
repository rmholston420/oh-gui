# Kosmos/OH-GUI Session Handoff — 2026-08-09 02:14 EDT

## Current build-sequencing position
- **Stage / phase:** Phase 1 · authorization slice · spec governance
- **Plugin / kernel component:** `apps/gui` surfaces + `docs/specs` corpus + `adrs/`
- **Port(s) in progress:** none — this session was governance, not ports
- **HEAD:** `15d7e77` on `main`, pushed and verified against remote. Clean tree.
- **Gates:** constraints runner PASSED — 21 enforced · 48 deferred · 6 witnessed · 2 retired

## Completed this session
- **ADR-028** — living specs. Every normative statement in an enrolled spec carries a permanent
  `REQ-<spec>-<nnn>` id, never renumbered or reused. `scripts/spec_coverage.py` generates
  `docs/specs/COVERAGE.md` and refuses a register where an id vanished without a `DROPPED` status, a
  `DROPPED` row lacks an ADR, an `IMPLEMENTED` row lacks evidence, or a `DEFERRED` row lacks a phase.
  **78 ids assigned by hand** across 5 enrolled specs — 00 (13), 01 (11), 04 (20), 04a (13), 05 (21).
  Auto-generating across all 16 was rejected: it lands ids on non-requirements and misses real ones.
  Enrolled set is explicit, so partial coverage is visible rather than implied.
- **ADR-028 amendment 1** — working under a credit budget. Out-of-sequence ROI-driven work is
  legitimate and needs no approval; what causes confusion is deviating **without a trace**. Skips are
  recorded `DEFERRED` with a named phase, and **work stops at a landable boundary, not at exhaustion**.
- **ADR-029** — the decision boundary is the plan, and Vibe/Pro are its defaults. Resolved both red
  spec conflicts and the yellow one in one ADR. Key correction: REQ-01-004 says *"expose decision
  boundaries"* and never named per-action as the unit — the card-per-action reading came from §4.2, so
  the real conflict was card granularity vs autonomous Vibe. Authorization unit is now the plan and its
  envelope; envelopes carry only paths/hosts/tool classes and no prose; enforcement is a COMMAND hook by
  exit code; envelope width is the existing trust dial at plan scope; Vibe/Pro are default dial
  positions over one data model, so REQ-01-009 and REQ-01-011 stand unchanged; review budget is
  denominated in cards raised, not lines of diff.
- **ADR-030** — the conversation is a view over the workspace, never the workspace itself. Durable
  addressable objects (plan, envelope, run, requirement, change, session) hold authoritative state; the
  transcript is append-only narration with no authority; modality is chosen by the data; direct
  manipulation where the object supports it; free-text input retained but demoted — the prohibition is
  the chat box acting as the window manager, not its existence.
- Fixed the dangling `COVERAGE-forge-oh.md` across all 14 donor-spec provenance headers.

## Remaining before the current Definition of Done

**Operator action, Colossus, near-zero credit cost — the highest-ROI item available.**
ADR-014's four verification items are the only thing blocking the Phase 1 authorization slice from
moving past `DEMO_ACTIONS`. They cannot run in the agent sandbox (no container runtime).

```bash
cd ~/dev/oh-gui && git pull
source .oh-venv/bin/activate 2>/dev/null || { python3 -m venv .oh-venv && source .oh-venv/bin/activate; }
python3 scripts/spec_coverage.py
python3 scripts/check-hard-constraints.py
python3 -m pytest scripts/tests/test_check_hard_constraints.py -q
```

Then item 1 of the gate: install a `pre_tool_use` COMMAND hook returning `{"decision":"deny"}` with
exit 2 against the pinned agent-server, ask the agent to write a file, and assert **the file does not
exist** — not that the hook logged. Items 2–4 follow in `adrs/ADR-014-authorization-enforcement-seam.md`.

**Deferred to Phase 1, recorded not skipped (ADR-028 amendment 1 clause 3):**
- ADR-028 decision 4's four drift gates: `spec_requirements_have_ids`,
  `spec_coverage_register_is_current`, `spec_coverage_evidence_resolves`,
  `spec_cross_references_resolve` — each needs a mutation test, and the reference gate must key on
  **link syntax, not bare strings** (see DEBUG_LOG 2026-08-09 01:56).
- ADR-030's `03-layout.md` object-set and canonical-view definitions — the largest downstream corpus edit.
- ADR-030's owed hard constraint: no surface reads authoritative state from message history.
- Populate `docs/specs/COVERAGE.md` statuses — most rows are `SPECCED` by default; already-built Phase 1
  items should be `IMPLEMENTED` with evidence. This is what makes a future session start cheap.
- `docs/specs/15-middleware-harness.md` still unwritten (gap at 15).
- Enroll the remaining 11 specs in coverage as they are next touched.

**Standing Phase 1 work:** untrusted badge (04a) · §4.2.1 audit log · wire Reject to
`conversation.reject_pending_actions(reason)` · §4.1 per-task-type trust dial · §4.3 batching triggers ·
§8.4 model-profile fields · §8.5/§8.6 tool-call-depth and 30-concurrent warning · **Vibe/Pro lens
primitive, Phase 1 scope per ADR-017, exists nowhere in `apps/gui/`**.

**Carried debt:** wizard §3.4 items 1 & 3 inert pending middleware · `trust-dial.ts` mirror owed to the
middleware schema · ADR-016 baseline benchmark unrun · PORTING_LEDGER `canvas_extensions` entry carries
a **future** timestamp (`2026-08-09 03:45 EDT`) — correct it.

## Open questions / awaiting operator answer
- **None blocking.** All three logged spec conflicts (2 red, 1 yellow) were resolved this session by
  ADR-029.
- Two lower-priority items remain open from earlier: per-component memory-layer native-first findings
  (the layer-level gap is proven — 1.41.0 ships a 97-line flat `MEMORY.md` loader with no embedding or
  vector store), and graph-viz having five candidate renderers for one job, which needs a named view
  before a renderer is chosen.

## Process rules earned this session (do not relearn)
- **Never put a gate invocation and a push in the same block unless the push is `&&`-chained behind the
  gate's exit status.** Printing an exit code is not checking it — a red shipped in `fe1e8bb` this way.
- **"grep found more hits" is not a finding, it is a prompt to read them.** A blind `sed` rewrote
  ADR-028's own defect description and edited the append-only BUILD_LOG.
- Abbreviating an evidence path with `...` produces an unresolvable citation; `cited_evidence_paths_resolve`
  catches it.
- Verify referenced ADR filenames with `ls` before writing them — three of three were wrong on first draft.

## Exact next action
Operator runs the ADR-014 hook-denial verification on Colossus (block above). Everything else in Phase 1
authorization is blocked behind it.
