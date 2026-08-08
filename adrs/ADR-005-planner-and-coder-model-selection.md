# ADR-005 — Planner and Coder Model Selection for OH-GUI

**Status:** OPEN — round 1 scored, verdict withheld pending round 2
**Lock-in phase:** Phase 0 (blocks Phase 0 exit)
**Supersedes:** —

> This ADR is filed **before** the bench runs, deliberately. Writing the decision
> criteria and the falsifier in advance is what stops the verdict from being fitted to
> whichever numbers happen to arrive. Do not fill in the Decision section until every
> cell in `bench/path_e/` has been scored against `bench/gold/`.

> **ROUND 1 SCORED (2026-08-08).** Run `20260808_0555` is scored in full at
> `bench/path_e/SCORING-20260808_0555.md`. The verdict is **deliberately withheld**,
> because three confounds mean the numbers do not yet answer the question this ADR asks.
> Criterion 1 is not "rank whatever was measured" — it is rank on *quality*, and two of
> the three confounds below are measurement defects, not model properties.
>
> | task | cell | model | score | tok/s |
> |---|---|---|---:|---:|
> | debug | c02 | qwen3.6:27b | 64 | 71.1 |
> | debug | c04 | 35b-a3b-mtp | 62 | 308.1 |
> | debug | c05 | 35b base | 57 | 279.0 |
> | debug | c06 | qwen3-coder:30b | 38 | 290.4 |
> | debug | c07 | Devstral UD-Q4_K_XL | 38 | 92.2 |
> | arch | c01 | qwen3.6:27b | 75 | 69.7 |
> | arch | c03 | 35b-a3b-mtp | 59 | 270.1 |
> | plan | c01 | qwen3.6:27b | 73 | 74.7 |
> | plan | c03 | 35b-a3b-mtp | 72 | 245.1 |
>
> **Confounds blocking ratification:**
>
> 1. **The coder role was never actually tested.** The only coder-facing task was `debug`,
>    which is diagnostic reading, not code generation. Worse, the coder cells ran with
>    thinking disabled and produced 1,148-1,575 tokens against 8,905-10,620 for the
>    planner cells. Scoring a code model on prose reasoning at one-seventh the budget
>    measures the harness, not the model. Round 2 adds `bench/prompts/code.txt`.
> 2. **The planner verdict is n=1** at temperature 1.0 / top_p 0.95. An 8.5-point gap from
>    a single sample at that temperature is not separable from sampling noise. Round 2
>    runs `arch` three times per planner candidate and takes the median.
> 3. **`gpu_at_start` was recorded after warmup**, so the cold-start warning fired on every
>    cell and carried no information. Fixed: the harness now records pre-warmup
>    temperature, and the fixed 45 C cold gate is replaced by a per-run calibrated floor.
>
> **Two findings from round 1 do stand, and are recorded now so they are not re-litigated:**
>
> - **Criterion 8 (Devstral contingency) did NOT fire.** Devstral scored 38 on `debug` —
>   neither a win nor a tie within 3 points of the 64 leader. No Q6_K retest is owed.
>   This holds regardless of round 2, since round 2 can only add a code task on which
>   Devstral must win outright to change the coder verdict.
> - **The MTP finding from run `20260531` is RETRACTED.** That run showed the MTP and base
>   35b builds at 278.51 and 278.52 tok/s and concluded Ollama was ignoring the
>   speculative head. Both cells had in fact truncated at exactly 8,192 tokens; the
>   identical rate was an artifact of dividing the same token count by a similar wall
>   time. Untruncated, MTP leads base 308.05 to 279.01 (+10.4%) and also scores higher
>   (62 vs 57). **Ollama is honouring the MTP head.**
>
> **Every cell failed `debug` question C** — embedder eviction between the 65536 and
> 131072 rows, provable from arithmetic present in the prompt. All five reached for
> allocator fragmentation or context capping instead. The item intended to be most
> discriminating discriminated nothing; this is noted as a property of the *field*, not of
> any one model, and does not affect ranking.

## Context

OH-GUI routes work to two local roles on Colossus (RTX 5090, 32 GB VRAM, 435 W cap):

- **Planner / thinker** — architecture decisions, multi-step plans, invalidation
  conditions. Long context, reasoning quality dominates.
- **Coder** — reading a real bug in this codebase and proposing a correct fix.

ADR-004 closed the *capacity* question: five candidates were measured and all fit, with
the planner ceiling at 131,072 (Amendment #5). Capacity does not select a model. Nothing
in this project has yet measured **answer quality**, and every model decision so far has
been made on VRAM, throughput, or third-party benchmark scores — none of which predict
performance on OH-GUI's actual work.

Two findings make this decision non-obvious:

1. **ADR-004 Amendment #3** reopened the planner comparison. The candidate list was frozen
   at 27b before the VRAM data existed, on a prediction about `qwen3.6:35b` KV cost that
   measurement then falsified (21.8 KB/token, not the ~110 KB/token predicted). The 35b
   dominates the 27b on capacity and, with ~3B active parameters, probably on speed. Only
   reasoning quality per token remains open — which is exactly what this bench measures.
2. **All Hands recommends `qwen3.6-35b-a3b` as the first local model for OpenHands**
   ([docs.openhands.dev](https://docs.openhands.dev/openhands/usage/llms/local-llms),
   2026/05/21). Since OH-GUI is built on the OpenHands SDK, the 35b must be judged on
   **coder** tasks too, not only planning.

### Options considered

| Role | Candidate | Case for | Case against |
|---|---|---|---|
| Planner | `qwen3.6:27b` | Dense; frozen baseline | 74.6 KB/token KV, 3.4× the 35b |
| Planner | `qwen3.6:35b-a3b-mtp-q4_K_M` | Cheapest KV, MoE speed, All Hands pick | MTP build unvalidated for quality |
| Planner | `qwen3.6:35b` (base) | Parity reference for the MTP build | Larger at every context |
| Coder | `qwen3-coder:30b` | Purpose-built; frozen baseline | 110 KB/token; no thinking mode |
| Coder | Devstral-Small-2507 UD-Q4_K_XL | 53.6% SWE-bench vs OpenHands LM's 37.2% | 152 KB/token, worst of the field |
| Coder | `qwen3.6:35b-a3b-mtp` | One model for both roles = no swap cost | Not coder-specialised |

Rejected without benching, with reasons recorded in `BUILD_LOG.md`:
`qwen3-coder-next` (80B, does not fit), `qwen2.5-coder:32b` (superseded),
OpenHands LM 32B v0.1 (37.2% SWE-bench, below Devstral).

## Decision criteria — FIXED BEFORE RESULTS

1. **Quality first, speed second.** Rank by gold-standard score. Speed breaks ties only
   when two cells are **within 3 points**.
2. **Gold standard is Perplexity Max**, written in `bench/gold/{debug,arch,plan,code}.md`
   **before any cell ran**. Each gold file carries its own scoring weights and an explicit
   list of claims a strong answer must NOT make.
3. **Reasoning traces are not scored.** `<think>` blocks and the Ollama `thinking` field
   are stripped; the agent loop discards them, so rewarding them would be measuring
   something the operator never sees.
4. **A cell that generated fewer than 64 tokens is INVALID**, not slow. Its throughput is
   first-token latency, not a rate.
5. **A truncated answer (`done_reason == "length"`) is scored as truncated** — no credit
   for what the model might have gone on to say.
6. **Every cell runs at the same 435 W cap.** A cell that thermally throttled has
   non-comparable timing and must be re-run, not adjusted.
7. **One model may win both roles.** If the 35b ties the specialist coder within 3 points
   on `debug`, single-model routing wins on operational simplicity: no swap latency, one
   resident model, a simpler router.
8. **Devstral contingency:** if Devstral wins or ties within 3 points at UD-Q4_K_XL,
   re-test at Q6_K before ratifying — its margin may be quantisation-limited.

### Round 2 criteria — FIXED BEFORE ROUND 2 RAN (2026-08-08)

9. **The coder verdict rests on `code`, not `debug`.** `debug` becomes a secondary signal.
   The code task is scored 60/100 by executing 30 stdlib `unittest` cases
   (`bench/gold/code_tests.py`, run by `bench/path_e/score_code.py`), with the remaining
   40 judged against `bench/gold/code.md`. The machine-scored 60 is not subject to
   judgement and cannot be revised after the fact.
10. **The planner verdict is the median of three `arch` replicates**, not a single run.
    If the two candidates' medians fall within 3 points, criterion 1's speed tiebreak
    applies and the 35b wins on throughput.
11. **Replicates are interleaved, not batched** (c12,c13,c12,c13,...). Batching would
    confound replicate number with thermal state.
12. **The code task's two traps are real defects this repository shipped** — the awk `$NF`
    "Not Active" collision and the missing length check before indexing position 1.
    Neither is hinted at in the prompt. A candidate that passes the trap tests without
    naming the trap still earns the machine points; the commentary points are separate.

## Decision

**PENDING.** To be written after scoring. Must state, explicitly:

- Planner model + context + sampling preset.
- Coder model + context + sampling preset.
- Whether the two roles collapse to one model.
- The `OLLAMA_MAX_LOADED_MODELS` and unload policy implied by that choice.

## Rationale

**PENDING.**

## Consequences

**PENDING.** Expected to touch:

- `bench/SAMPLING.md` — the winning presets become the router's defaults.
- The middleware LLM router — model IDs, context, and unload policy.
- `PORTING_LEDGER.md` — a Devstral win adds an entry for the unsloth GGUF (Apache-2.0).
- `ADR-004` Amendment #3 — closes the reopened planner question either way.
- `adrs/README.md` — "Baseline metrics report" moves from Open to Closed.

## Falsifier

This ADR is wrong if a model chosen here is later replaced for reasons the bench should
have caught. Concretely, the decision must be **revisited** if any of the following occur:

- The winning model is swapped within 30 days of real OH-GUI use for quality reasons —
  meaning the three prompts did not represent the actual work.
- Ollama, the driver, or a model tag changes such that the throughput ordering inverts.
- The router's real workload turns out to be dominated by short calls, where prefill
  throughput and load latency matter far more than the long-context quality measured here.

The three prompts (`debug`, `arch`, `plan`) are drawn from real OH-GUI work, but three
prompts is a small sample. **This ADR selects a default, not a permanent truth.**

## Lock-in phase

Phase 0 exit. Blocks the "Baseline metrics report vs. dense Qwen3 27B-35B" open item in
`adrs/README.md`.

## References

- `bench/path_e/bench_path_e.py`, `bench/path_e/run_path_e.sh`
- `bench/gold/{debug,arch,plan,code}.md` — gold answers and scoring weights
- `bench/gold/code_tests.py`, `bench/gold/reference/code_reference.py` — 30-case suite
  and a reference solution verified to pass 30/30
- `bench/path_e/score_code.py` — automated 60-point scorer
- `bench/path_e/SCORING-20260808_0555.md` — round 1 scoring in full
- `bench/validate_harness.py` — static validation gate for the harness
- `bench/SAMPLING.md` — per-role sampling, from the Qwen model cards
- [ADR-004](ADR-004-vram-context-envelope.md) — VRAM envelope; A#3 reopened this question
- [All Hands local LLM guidance](https://docs.openhands.dev/openhands/usage/llms/local-llms)
- [unsloth/Devstral-Small-2507-GGUF](https://huggingface.co/unsloth/Devstral-Small-2507-GGUF)
- [Qwen3.6-27B model card](https://huggingface.co/Qwen/Qwen3.6-27B)
