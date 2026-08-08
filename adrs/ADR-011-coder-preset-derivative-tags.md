# ADR-011 — Correct the sampling preset at the layer that governs it

**Status:** Proposed
**Lock-in phase:** Phase 0 close / router configuration
**Supersedes:** —

## Context

ADR-009 established, by reading the daemon rather than inferring: the OpenHands profiles set **no
sampling parameter at all**, the SDK defaults them to `None` meaning "provider default", and so
Ollama's baked-in Modelfile values govern every request the app makes. Verified on Colossus, all
three tags are identical here:

| | value | Qwen's coding recommendation |
|---|---|---|
| temperature | 1 | **0.6** |
| top_p | 0.95 | 0.95 |
| top_k | 20 | 20 |
| min_p | 0 | 0 |
| **presence_penalty** | **1.5** | **0.0** |
| repeat_penalty | 1 | 1.0 |

This is Qwen3.6's thinking-mode *general* preset. We have been running coding tasks on it for every
number collected in Phase 0. The Qwen3.6 model card warns that an elevated `presence_penalty` "may
occasionally result in language mixing and a slight decrease in model performance" — and we are at
1.5 where coding wants 0.0.

Separately, ~2.25 malformed-tool-call-JSON errors per cell were measured across both models
(17 and 19 per 8-cell block). Whether sampling contributes is unknown and worth measuring, since
those retries inflate turns, and turns-to-acceptance is a spec item-5 metric.

**Two ways to correct it. Only one is capable of a complete fix.**

The agent-server schema (`agent-server-schema.d.ts`) exposes `temperature`, `top_p`, `top_k` and
`seed` as optional LLM fields. It does **not** expose `presence_penalty`, `min_p`,
`frequency_penalty` or `repetition_penalty`. The profile also carries `drop_params: true`, which
discards parameters the provider rejects **without error** — so smuggling `presence_penalty`
through `litellm_extra_body` could appear to work and silently do nothing. Twice today a change of
mine reported success while having no effect; a route whose failure mode is silence is not
acceptable for a parameter this load-bearing.

## Decision

Correct the parameters **in Ollama**, where ADR-009 proved they actually govern, by creating
derivative tags with `ollama create` from a Modelfile:

```
FROM qwen3.6:27b-mtp-q4_K_M
PARAMETER temperature 0.6
PARAMETER top_p 0.95
PARAMETER top_k 20
PARAMETER min_p 0
PARAMETER presence_penalty 0
PARAMETER repeat_penalty 1.0
```

producing `qwen3.6:27b-coder`, `qwen3.6:27b-mtp-coder`, `qwen3.6:35b-a3b-mtp-coder`. `FROM` an
existing local tag reuses its weight blobs, so this costs no download and no meaningful disk, and
inherits everything else about the build including MTP heads and the CLIP tower.

The derivative tags become the model identities the router references. Each gets its own OpenHands
profile, differing from its parent only in `model`.

**Verification is mandatory and behavioural, not declarative.** `ollama show --parameters` proves
the Modelfile applied; it does not prove the app's requests are affected by it. Confirming a
setting was applied is not the same as confirming it means what we assumed. So the derivative tags
are accepted only after `bench/mtp/bench_mtp.py` shows tok/s unchanged within noise against the
parent (sampling should not move throughput; a large shift means something other than sampling
changed) **and** a matrix block runs against one.

## Rationale

Fixing it in Ollama corrects it at the layer ADR-009 proved is authoritative, covers every
parameter including the two the schema cannot express, and is inspectable after the fact. Route A
would fix three parameters of six, leave the most consequential one at its wrong value, and give
no signal that it had failed to.

Editing the original tags' Modelfiles in place was rejected: it would make `qwen3.6:27b` mean
something different on this machine than it does anywhere else, silently invalidating every number
already recorded against that name — including today's throughput measurements.

## Consequences

- Three new tags and three new profiles. No new weights.
- Every Phase 0 number collected before this ADR describes the general-reasoning preset and must be
  labelled as such wherever it is quoted. They are not superseded — they are the "as shipped by
  Ollama" baseline, which is a legitimate thing to have measured.
- The automated matrix is re-run on the corrected tags. Per operator decision (2026-08-08), no
  human-driven pass follows; see the ADR-008 amendment.
- `PORTING_LEDGER.md` unaffected — no vendored code.
- If the corrected preset measurably reduces the malformed-tool-call-JSON rate, that finding
  belongs in its own ADR about tool-call reliability.

## Lock-in phase

Phase 0 close. The router in Phase 1 references the derivative tags.

## References

- ADR-008 (baseline method), ADR-009 (sampling findings), ADR-010 (MTP parity + correction block)
- [Qwen3.6 model card sampling guidance](https://qwen.readthedocs.io)
- `agent-server-schema.d.ts` — LLM fields exposed: temperature, top_p, top_k, seed

---

## Verdict (2026-08-08)

Adopted. Three tags built with `ollama create`: `qwen3.6:27b-coder`, `qwen3.6:27b-mtp-coder`,
`qwen3.6:35b-a3b-mtp-coder`.

Both acceptance conditions this ADR set were met:

- `ollama show --parameters` returns `temperature 0.6` and `presence_penalty 0` on all three, with
  `draft_num_predict 4` preserved on the two MTP derivatives and absent from `27b-coder` — matching
  the parent tags exactly.
- Blobs were reused, not copied. Free disk was 64G before and 64G after, despite `ollama list`
  reporting 17+17+22 GB of new entries. The listed sizes are logical.
- Throughput held: `27b-mtp-q4_K_M` 124.96/124.82 tok/s against `27b-mtp-coder` 124.72/124.53 on
  short generation with sampling pinned identically on both sides. Within 0.3 tok/s, so
  `ollama create` did not disturb the speculative decoding heads.

**What this ADR does NOT claim.** Tool-error counts across the paired blocks were 17→11, 16→12 and
19→20 — the two dense 27b builds fell about a third, the MoE did not move. With one repetition per
cell, against a defect that already varied 16 to 19 between same-preset runs, three paired deltas
are suggestive and nothing more. **No causal claim that the coding preset reduces malformed
tool-call JSON is entered here.** One data point is worth recording plainly: `27b-mtp-coder`
completed t02 in 8 turns, the cell where the general preset produced three identical unparseable
`file_editor` calls and the run never started.

This preset is adopted because it is the parameter set Qwen documents for coding and the previous
one was Qwen's general-reasoning preset applied to coding work by accident of packaging — a
correctness argument that stands without any measured improvement.

The malformed tool-call JSON, ~2 per cell on every build regardless of preset, remains an open
defect and needs its own ADR against a harness with repetitions.

**Status: Ratified.**
