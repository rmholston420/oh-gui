# ADR-010 — The baseline must compare MTP against MTP

> **STATUS AMENDMENT (2026-08-08):** the throughput half of this decision is measured by
> `bench/mtp/`, not by the baseline matrix. Ollama through litellm reports `completion_tokens: 0`
> on every call in the conversation event log, so the matrix cannot produce tok/s; and its
> wall-clock is dominated by tool calls and tool-call retries rather than generation. The matrix
> settles acceptance, `bench/mtp/bench_mtp.py` settles speed via Ollama's `eval_count` and
> `eval_duration`. Both are required before Phase 0 item 3 closes. The decision itself — that
> speed comparisons are drawn MTP against MTP — is unchanged.

**Status:** Proposed
**Lock-in phase:** Phase 0, item 3 (baseline metrics report)
**Supersedes:** —

## Context

The 2×8 baseline matrix runs `qwen3.6:27b` against `qwen3.6:35b-a3b-mtp-q4_K_M`. Only the second
has multi-token prediction heads.

> **CORRECTION (2026-08-08 16:42, verified on Colossus).** The paragraph below originally claimed
> both tags ship the identical parameter blob `276ffc6327ae` including `draft_num_predict 4`, with
> the parameter merely inert on the plain 27b. That is **wrong**, and it was inferred from the
> registry web page rather than read from the daemon. `ollama show --parameters` on Colossus:
> plain `qwen3.6:27b` has **no `draft_num_predict` at all**; both `27b-mtp-q4_K_M` and
> `35b-a3b-mtp-q4_K_M` have `draft_num_predict 4`. ADR-009's table was correct and this ADR
> contradicted it. Sampling parameters are otherwise identical across all three tags
> (temperature 1, top_p 0.95, top_k 20, min_p 0, presence_penalty 1.5, repeat_penalty 1).
>
> The same check turned up a fact neither ADR anticipated: **`27b-mtp-q4_K_M` is a multimodal
> build.** It carries a CLIP vision tower (`architecture clip`, 460.73M) that plain `27b` does not
> have, and reports 27.3B text parameters against the plain tag's 27.8B. The two tags are therefore
> NOT the same model plus prediction heads — they are different builds. This ADR's claim that
> 27b vs 27b-mtp is "the only clean measurement of what MTP is worth" is **overstated** and is
> narrowed here: it is the closest available pair, and the measured 1.66x/1.48x/1.81x is still
> attributable to MTP because an unused vision tower cannot accelerate text generation, but a
> quality difference between these two tags cannot be attributed to MTP alone. `35b-a3b-mtp` also
> carries a CLIP tower (446.57M), so of the three tags only plain `27b` is text-only — relevant if
> OH-GUI ever accepts image input.

The parameter is absent on the plain 27b,
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
