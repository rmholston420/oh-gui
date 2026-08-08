# ADR-010 — The baseline must compare MTP against MTP

**Status:** Proposed
**Lock-in phase:** Phase 0, item 3 (baseline metrics report)
**Supersedes:** —

## Context

The 2×8 baseline matrix runs `qwen3.6:27b` against `qwen3.6:35b-a3b-mtp-q4_K_M`. Only the second
has multi-token prediction heads. Ollama reports `draft_num_predict 4` in *both* tags' parameter
blobs (both ship the identical blob `276ffc6327ae`), but the parameter is inert on the plain 27b,
which has no prediction heads to draft with — the asymmetry is in the weights, not the config.

Unsloth documents MTP as "~1.4–2.2x faster generation with no change in accuracy"
([Unsloth Qwen3.6 docs](https://unsloth.ai/docs/models/qwen3.6)). Every tok/s figure this matrix
produces therefore understates the 27b by roughly that factor, and a speed-based tiebreak between
the two models would be decided by a feature only one of them has.

The tiebreak is not hypothetical. The earlier quality bench put the two inside the tie band at the
`precise` preset — 27b 64 vs 35b-mtp 62 — which hands the slot to the faster model. Deciding that
on a rigged throughput comparison picks the wrong model for the router.

`qwen3.6:27b-mtp-q4_K_M` (18 GB) exists in the Ollama library
([tags](https://ollama.com/library/qwen3.6/tags)) and was flagged as "the one variant worth pulling"
when the asymmetry was found. It was never pulled.

## Decision

Phase 0 does not close on a two-model matrix. A third 8-cell block runs
`qwen3.6:27b-mtp-q4_K_M`, and any tok/s comparison feeding a routing decision is drawn
**MTP vs MTP** (27b-mtp vs 35b-a3b-mtp). The existing plain-27b block is retained, because
27b vs 27b-mtp is the only clean measurement of what MTP is worth on this hardware.

Quantisation is fixed at q4_K_M. `27b-mtp-q8_0` is 30 GB against 32 GB of VRAM, leaving no KV
budget, and is rejected on the standing rule that weight bytes must not exceed 30 GB.

## Rationale

Alternatives considered:

1. **Report tok/s with an MTP caveat and close Phase 0** (ADR-009's current position). Rejected: a
   caveat does not make the numbers comparable, and the routing decision this baseline exists to
   inform is exactly the one the caveat invalidates.
2. **Drop the plain 27b and run only MTP variants.** Rejected: it makes the two models comparable
   but discards any measurement of MTP's effect, a question that recurs for every future model.
3. **Pull `27b-mtp-q8_0` for a higher-quality 27b.** Rejected on VRAM: 30 GB of weights leaves no
   room for KV cache.

Cost is one 18 GB pull and roughly 22 minutes of wall time, against a baseline that would otherwise
be unusable for its primary purpose.

## Consequences

- `~/.openhands/profiles/qwen3.6-27b-mtp-q4_K_M.json`, derived from the existing 27b profile and
  differing only in `model`.
- Third block run via `OH_GUI_BASELINE_PROFILES`; `run_matrix.sh` and `preflight.sh` already read
  that variable, so no code change is required.
- `docs/BASELINE-METRICS-*` gains a third per-model report.
- ADR-009 amended: "tok/s must never be reported without the MTP caveat" stands for the plain-27b
  block and is discharged for the MTP-vs-MTP comparison.
- ADR-008's verdict waits on all three blocks.
- Every tok/s figure must state which of the two comparisons it belongs to.

## Lock-in phase

Phase 0 item 3. Phase 0 cannot be declared complete until the third block has run.

## References

- ADR-008 (baseline matrix), ADR-009 (Qwen3.6 sampling and MTP)
- [Ollama qwen3.6 tags](https://ollama.com/library/qwen3.6/tags)
- [Ollama qwen3.6:27b params blob](https://ollama.com/library/qwen3.6:27b/blobs/276ffc6327ae)
- [Unsloth Qwen3.6 documentation](https://unsloth.ai/docs/models/qwen3.6)
