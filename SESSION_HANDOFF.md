# Session Handoff

**Updated:** 2026-08-08 17:45 EDT

## Where the build is

**Phase 0 is complete.** All four exit criteria met:

1. Upstream pins recorded — done
2. Reference checkout — done
3. **Baseline metrics — done this session** (was the only open item)
4. First-run wizard — done

Nothing in Phase 0 is outstanding. Next work is Phase 1.

## What was completed this session

- Blocks 3–6 of the baseline matrix, 32 further cells, bringing the total to 48 across six blocks.
- ADR-011 authored and acted on: derivative Ollama tags carrying Qwen's coding preset, because the
  stock tags ship the general-reasoning preset and the profile layer cannot express
  `presence_penalty` at all. Verified by reading the parameters back, checking disk for blob reuse,
  and re-measuring throughput.
- ADR-008, ADR-009, ADR-010, ADR-011 all ratified with verdicts written.
- ADR-008 amended to record that the human-driven pass will never run, so three of its five item-5
  metrics are permanently unobtainable — stated explicitly so a reader does not mistake null for
  zero.
- `bench/mtp/` throughput settled: 1.81x / 1.66x / 1.48x, inside the documented band.
- Fixed a float formatting defect in `compare_blocks.py` that had leaked
  `535.8000000000001 s` into a committed table; 5 tests added.
- Fixed the `conversation_id` nesting defect — the error harvester had never worked on a real cell
  while its unit tests passed, because they fed it the value it was failing to find. Tests now drive
  both readers end to end over a realistically shaped summary.

## The finding that matters most

Six blocks. Every one scored **7/8**. Every one failed a **different** task.

| Preset | 27b | 27b-mtp | 35b-a3b-mtp |
|---|---|---|---|
| General | t01 | t02 | t08 |
| Coding | t08 | t04 | t07 |

The task set does not discriminate between these models or these presets at one repetition per
cell. **No model has been selected, and none should be selected from these numbers.**

## Open questions and known gaps

1. **Model selection is decided (ADR-012) but the harness gap is not closed.** Since our own six
   blocks could not separate the candidates, the default coder model is
   `qwen3.6:35b-a3b-mtp-coder`, on OpenHands' own documented recommendation for local use. A
   discriminating harness — repetitions per cell, harder tasks — is still needed, and ADR-012 has
   a concrete revisit trigger tied to it. **Written up in full in `KNOWN_ISSUES.md`** (2026-08-08,
   "the model benchmark cannot tell the candidates apart") with why it fails and what a working
   harness requires. Revisit when there is a proper test.
2. **Malformed tool-call JSON, ~2 per cell**, on every build regardless of preset. It cost an entire
   cell once (t02 on `27b-mtp-q4_K_M`: three identical rejected `file_editor` calls, run never
   started). Open defect, wants its own ADR. Whether the coding preset helps is unproven — 17→11,
   16→12, 19→20 is suggestive at best.
3. Three item-5 human metrics are permanently unobtainable. Closed, not pending.

## Exact next action

Begin Phase 1. Before wiring the router, decide whether to build the discriminating harness first —
model selection is a Phase 1 input and the current baseline cannot supply it.

The router must reference the derivative tags (`qwen3.6:27b-coder`, `qwen3.6:27b-mtp-coder`,
`qwen3.6:35b-a3b-mtp-coder`), not the stock ones, and must `ollama stop` the outgoing role model.
