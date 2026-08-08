# ADR-012 — Default coder model: defer to upstream where our own evidence is silent

**Status:** Ratified
**Lock-in phase:** Phase 1 router configuration
**Supersedes:** —

## Context

ADR-008 closed Phase 0 with a finding that refuses to pick a model: six blocks, forty-eight cells,
two sampling presets across three builds, and **every block scored 7/8 while every block failed a
different task**. Acceptance never moved; only the identity of the failing cell did. At one
repetition per cell this task set cannot separate these models, and choosing on those numbers would
be choosing on noise.

A model still has to be chosen for the Phase 1 router. The options were: build a discriminating
harness first (repetitions, harder tasks — hours of GPU and a task-authoring effort), pick
arbitrarily, or defer to a better-founded external judgement.

## Decision

Adopt **`qwen3.6:35b-a3b-mtp-coder`** as the default coder model, on OpenHands' own recommendation.

The upstream project recommends Qwen3.6-35B-A3B as the local model to run with OpenHands, in two
places in its official documentation, describing it as an open-weight MoE "built for agentic
coding" that "works well with tool-heavy workflows like OpenHands". Our tag is that model, in
Q4_K_M with MTP heads (ADR-010) and the coding sampling preset baked in (ADR-011).

The dense 27b builds stay pulled and profiled as alternates. Nothing is deleted.

## Rationale

OpenHands' recommendation is grounded in evaluation across far more tasks than our eight, on the
agent loop this GUI is built around. Where our own measurements are genuinely silent, their
judgement is better evidence than our tie — and materially better than picking the build that
happened to fail a more forgivable task.

Nothing in our data contradicts it. The MoE cleared 7/8 in both presets, was fastest to idle in
both runs (386.2s and 294.1s), and produced the most concise diffs (165 lines against 288 and 308).
At 22 GB it leaves comfortable headroom in 32 GB of VRAM, and the resident-model samples show it
running at 65536 context — above the 32768 OpenHands recommends.

## The evidence against, recorded rather than omitted

Tool errors are the **one** metric where our six blocks show a consistent difference, and it
disfavours this choice: 19 and 20 on the MoE across both presets, against 11, 12, 16 and 17 for the
dense builds. Same direction in both runs. Two blocks is not proof, and it cost no acceptance —
but it is the only signal our data produced that separates the candidates at all, and it argues
for a model this decision does not select.

This is accepted knowingly. The malformed tool-call JSON defect is open across every build
regardless of preset or model, and belongs to the Qwen3.6-through-Ollama tool-call path rather than
to any one candidate. If a discriminating harness later shows the MoE materially worse on tool-call
validity, this ADR should be revisited — that is a concrete, falsifiable condition, not a caveat.

## Consequences

- The Phase 1 router defaults to `qwen3.6:35b-a3b-mtp-coder`, and must `ollama stop` the outgoing
  role model when switching.
- `qwen3.6:27b-coder` and `qwen3.6:27b-mtp-coder` remain available as alternates.
- The discriminating-harness gap from ADR-008 remains open. This decision routes around it; it does
  not close it.
- Revisit trigger: measured evidence that this model's tool-call validity is materially worse than
  the dense alternates under repetition.

## Lock-in phase

Phase 1 router configuration.

## References

- [OpenHands local LLM guide](https://docs.openhands.dev/openhands/usage/llms/local-llms) — "We now
  recommend Qwen3.6-35B-A3B as the first local model to try with OpenHands"
- [OpenHands model overview](https://docs.openhands.dev/openhands/usage/llms/llms) — local /
  self-hosted section
- ADR-008 (no winner from the baseline), ADR-010 (MTP), ADR-011 (coding preset)
- `docs/BASELINE-COMPARE-six-blocks.md`
