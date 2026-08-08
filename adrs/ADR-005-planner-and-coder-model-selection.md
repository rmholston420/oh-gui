# ADR-005 — Planner and Coder Model Selection for OH-GUI

**Status:** **Ratified** (2026-08-08) — round 2 scored, both slots decided
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

**The two roles do NOT collapse. OH-GUI routes to two models, never co-resident.**

| Role | Model | Context | Preset | Thinking | `num_predict` |
|---|---|---:|---|---|---:|
| **Planner / thinker** | `qwen3.6:27b` | 131,072 | `planner` — temp 1.0, top_p 0.95, top_k 20, min_p 0.0, presence 0.0, repeat 1.0 | **on** | 16,384 |
| **Coder** | `qwen3.6:35b-a3b-mtp-q4_K_M` | 131,072 | `precise` — temp 0.6, top_p 0.95, top_k 20, min_p 0.0, presence 0.0, repeat 1.0 | **on** | 16,384 |

Both presets are the Qwen3.6 card's own rows: `planner` is "Thinking, general",
`precise` is "Thinking, precise coding" (`bench/SAMPLING.md`).

**`OLLAMA_MAX_LOADED_MODELS=1`.** The two role models are 26,140 and 26,390 MiB at
131,072; their sum is 52,530 MiB against a 32,607 MiB card, so co-residency is physically
impossible and the value must stop Ollama from attempting a second load and thrashing. The
embedder no longer competes for a slot — ADR-004 A#2 placed it on CPU, confirmed by A#7.
Role switches cost the measured 2.8–6.9 s and the router must `ollama stop` the outgoing
model explicitly, because `OLLAMA_KEEP_ALIVE=-1` means nothing auto-unloads.

**This is a change from the live value of 2** and is not yet applied — see Consequences.

## Rationale

### Coder — `35b-a3b-mtp`, decided on machine-scored tests

`bench/path_e/SCORING-20260808_0705.md`. 60 of the 100 points came from executing 30
`unittest` cases, so the ordering does not rest on my judgement:

| Cell | Model | Tests | Judged /40 | **Total** | tok/s |
|---|---|---:|---:|---:|---:|
| **c10** | 35b-a3b-mtp | **30/30** → 60 | 39 | **99** | 119.9 |
| c11 | 27b | 30/30 → 60 | 32 | 92 | 48.7 |
| c09 | Devstral UD-Q4_K_XL | 29/30 → 58 | 23 | 81 | 90.4 |
| c08 | qwen3-coder:30b | 29/30 → 58 | 20 | 78 | 276.3 |

Both *code-marketed* models placed last. Both failed the same test,
`test_unparseable_value_raises`, by constraining the value match to the literal set
`(Active|Not Active|N/A)` — so malformed input is skipped silently and c08's `raise
ValueError` is unreachable dead code. The gold file names that anti-pattern explicitly.
A silent-skip failure mode in the component that parses agent output is disqualifying for a
default, regardless of speed.

Criterion 7 does not fire: the 35b did not *tie* the specialist, it beat it by 21 points.
Criterion 8 does not fire: Devstral neither won nor tied within 3 points, so no Q6_K retest
is owed — already recorded after round 1.

**Latency counter-consideration, recorded not buried:** c10 took 83.6 s for 9,876 tokens
against c08's 2.24 s for 466 — a 37× wall-clock penalty. c08 remains a candidate *fast
path* for trivial edits, but it cannot be the default, because its failure mode is silence
rather than an error.

### Planner — `27b`, decided on median of three replicates

`bench/path_e/SCORING-20260808_0738.md`. Per criterion 10, medians of three interleaved
`arch` replicates: **c12 `27b` = 72, c13 `35b-a3b-mtp` = 66.** A 6-point gap is outside
criterion 1's 3-point tie band, so the speed tiebreak does not apply and c13's ~2× decode
advantage (96.3 vs 49.1 tok/s median) does not enter the verdict.

The point totals are entirely my judgement, and a 6-point median gap from a single judge is
not a robust margin. The verdict does not rest on them alone. It rests on a binary,
re-checkable observation:

| Cell | Reached the gold decision (Option C) |
|---|---|
| c12 `27b` | **3 / 3** |
| c13 `35b-a3b-mtp` | **1 / 3** |

c13 chose **Option B twice and Option C once from the identical prompt.** Twice it asserted
Option B "consumes 0 additional VRAM" — a claim `bench/gold/arch.md` lists under *claims a
strong answer should NOT make*, because `OLLAMA_NUM_PARALLEL=1` serialises the
classification behind the agent's own generation and a fresh conversation discards the
agent's KV cache. Neither B answer mentioned `NUM_PARALLEL`.

**Round 2's confound resolved against the hypothesis it was designed to test.** The round-2
cell comment states the round-1 planner gap came from "c03 choosing Option B in that one
draw" and that "at that sampling temperature one draw is not evidence." Three draws later,
Option B is **reproducible, not a draw artifact** — 2 of 3. The replication was built to
exonerate the 35b and instead confirmed the behaviour.

For a model whose output is architecture decision records, non-determinism *on the chosen
architecture* is a worse defect than consistently slightly weaker prose. c12's three answers
vary in quality (64–75) but never in verdict.

**c13 produced the single best answer in the set** — rep 3 at 79, the highest of all six.
The case against it is variance, not capability.

### Alternative explicitly considered and rejected: collapse both roles to `35b-a3b-mtp`

Attractive on operations: one resident model, **zero** role-switch latency, the cheapest KV
in the field (23.3 KB/token vs the 27b's 74.6), a simpler router, and the coder slot already
won at 99. It costs 6 median `arch` points.

Rejected. Criterion 1 forbids it — the gap exceeds the 3-point band — but the 6 points are
not the real reason. The real reason is that the model flipped its architectural conclusion
on 2 of 3 identical prompts, and the planner's entire job is to produce decisions that hold
still. Re-examine if the follow-up below removes the instability; the operational case for
collapsing is strong enough that it should not be dismissed permanently.

### Confound flagged, and a pre-registered follow-up

Both planner cells ran at temperature **1.0** — the Qwen3.6 card's "Thinking, general" row,
so the preset is on-card and not a harness defect. It is nonetheless high, and it is the
most plausible driver of c13's instability: the *same model* at temp 0.6 (`precise`) scored
99 on `code` with no such wobble. I have not tested c13 `arch` at 0.6, so I cannot claim the
flip is a property of the model rather than of the temperature it was benched at.

This does not change the verdict — c12 was benched at the same temperature and did not flip,
so at the benched preset the 27b is better. But the result is pre-registered here so it
cannot be fitted afterwards:

> **Pre-registered:** run `REPS=3` of c13 `arch` at the `precise` preset (temp 0.6). If c13
> reaches Option C 3/3 **and** its median exceeds 75, the planner slot is **reopened** and
> speed plus single-model routing become decisive. If it flips again, the instability is a
> model property and this verdict hardens. Note that 0.6 is the card's *precise-coding* row
> applied off-label to architecture, so a win there also argues for changing the planner
> preset, not only the model.

### Gold-file premise retracted after scoring

`bench/gold/arch.md` built its VRAM table on a ~3,500 MiB working-desktop figure that
**ADR-004 A#6 retracted** (measured: 657 / 666 / 675 MiB with the browser up). A correction
block is appended to the gold file and the issue is logged in `KNOWN_ISSUES.md`.

**No effect on this verdict.** All six cells received the identical prompt, and
`bench/prompts/arch.txt` itself states the 2–3 GB rise, so the premise error is common-mode
and relative ranking is measured cleanly. Two things do change: recomputed against the
measured desktop, **Option A is not "arithmetically dead"** — it has ~3.8 GB of headroom at
131,072 — so no cell's Option A conclusion may be carried into the codebase; and the credit
I gave c13 rep 3 for deriving "−1,013 MiB → system crash" stands as a *quality* score only,
not as a production fact.

## Consequences

**Applied by this commit:**

- `adrs/README.md` — ADR-005 status → Ratified; "Baseline metrics report vs. dense Qwen3
  27B-35B" moves from Open to Closed.
- `ADR-004` Amendment #3 — the reopened planner comparison is **closed**: the 35b dominates
  the 27b on capacity and speed as A#3 predicted, and loses the planner slot anyway on
  decision stability. Capacity did not select the model, exactly as this ADR's Context said.
- `bench/gold/arch.md` — correction block for the retracted desktop figure.
- `KNOWN_ISSUES.md` — created; three entries.

**Pending, NOT yet applied — requires an `ollama_env.sh` change and a restart:**

- `OLLAMA_MAX_LOADED_MODELS` 2 → **1**. Not done silently, because it alters the live
  systemd user unit that the guard verifies, and `ollama_guard` asserts all 7 settings; the
  guard's expected value must change in the same commit or every subsequent run fails
  preflight.

**Still open, unaffected by this ADR:**

- The middleware LLM router does not exist yet. These model IDs, contexts, presets and the
  unload policy are its required defaults when it is built.
- `PORTING_LEDGER.md` — no entry owed. Devstral lost, so the unsloth GGUF is not vendored.
- The security analyzer decision that `arch` was a *proxy* for is **not** decided by this
  ADR. `bench/gold/arch.md` is a scoring rubric, not a ratified architecture. Option C with
  a CPU second stage needs its own ADR before implementation.

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

---

## Amendment #1 — 2026-08-08 — out-of-sample replication of the planner verdict

**Status unchanged: Ratified.** This amendment adds evidence; it changes no decision.

An unplanned second `REPS=3` run of c12/c13 (`20260808_0804`) executed minutes *after* this ADR
was ratified. Because it postdates ratification it could not have been fitted to the conclusion.
Scored in `bench/path_e/SCORING-20260808_0804.md` under identical weights.

| Metric | run `0738` | run `0804` | Combined |
|---|---|---|---|
| c12 `27b` median | 72 | **72** | — |
| c13 `35b-mtp` median | 66 | **58** | — |
| Gap | 6 | **14** | — |
| c12 reached Option C | 3/3 | **3/3** | **6/6** |
| c13 reached Option C | 1/3 | **0/3** | **1/6** |
| c12 median tok/s | 49.13 | 47.79 | — |
| c13 median tok/s | 92.51 | 94.49 | — |

The planner selection therefore rests on **six independent draws per cell**, not three. c12's
median is identical in both runs. c13 has reached the gold decision once in six attempts.

**New substantive finding.** c13's failure is not only that it picks Option B. On 2 of 3 draws
this run it stopped performing the comparison the prompt demanded: rep 2 dismissed Option C in
one unargued line, rep 3 never analysed Option C at all. For a planner whose output a human must
audit, silently dropping an option is worse than arguing it badly.

**Counter-evidence recorded honestly.** c12 committed this run's two worst arithmetic errors
(a 10x KV-growth miscalculation and a fabricated "host-RAM fallback" mechanism for a
configuration ADR-004 measured at 100% GPU), and one draw contradicted its own fail-closed
compensation by routing `SUSPICIOUS` to continue-with-flag. c12 wins because its errors sit in
supporting arithmetic while its decision, fail-closed posture and interface shape hold across
all six draws; c13's errors sit in the decision itself.

**The pre-registered `precise`-preset test on c13 remains open and remains binding.** Nothing in
this replication forecloses it. If c13 at temp 0.6 reaches Option C 3/3 with median > 75, the
planner slot reopens as filed.

**Speed note.** c12's 72.94 tok/s draw in run `0738` did not recur (spread this run: 45.60 to
49.14). It was anomalous, and the median-of-three rule absorbed it as intended.

---

## Amendment #2 — 2026-08-08 — third planner replicate set; pre-registered test NOT yet run

**Status unchanged: Ratified.**

### The pre-registered follow-up did not execute

`REPS=3 SAMPLING=precise bash bench/path_e/run_path_e.sh c13_planner_arch_35bmtp` ran at the
**planner** preset (temperature 1.0), not `precise` (0.6). `SAMPLING` was not a variable the
harness read; sampling came from the cell's hardcoded role. See DEBUG_LOG 2026-08-08 08:40 EDT.

This is a defect in **this ADR**, not only in the harness: Amendment #1 and the original
pre-registration specified a test in prose without verifying that a command existed capable of
running it. The override is now implemented, validated, and covered by
`bench/tests/test_sampling_override.sh`. **The pre-registered test remains OPEN and remains
binding**, and its command is now:

    REPS=3 SAMPLING=precise bash bench/path_e/run_path_e.sh c13_planner_arch_35bmtp

Result JSONs now carry `sampling_preset` and `sampling_override`, so a future reader can verify
which preset produced any cell without inferring it.

### What run `20260808_0824` actually is

A third replicate set at the planner preset. Scored in `bench/path_e/SCORING-20260808_0824.md`.

| Run | Options chosen | Gold decision | Median |
|---|---|---:|---:|
| `0738` | B, B, C | 1/3 | 66 |
| `0804` | B, B, B | 0/3 | 58 |
| `0824` | B(+C), B, **C** | 1/3 | 66 |
| **c13 total** | | **2 / 9** | |
| **c12 total** | C x6 | **6 / 6** | 72, 72 |

**Nine draws per option now support the planner selection.** No decision changes.

### Strengthened finding: c13's ceiling exceeds c12's; its floor is the problem

Across all nine c13 draws the score and the decision co-vary perfectly. Both 79-point answers
chose Option C; every 54-66 answer chose Option B. `0824` rep 3 is the best interface in the
entire fifteen-replicate matrix — frozen dataclasses, an `ActionType` enum including
`TEXT_INGEST`, `TaintTag` with `propagation_rules`, a `MUST`-phrased caller contract, and the
matrix's only falsifier that states both a numeric threshold and the evidence required to
establish it.

So `35b-a3b-mtp` can outwrite `27b`. It does so about one draw in five. **That is precisely why
it loses the planner slot**: a planner is consumed one draw at a time by a human who cannot see
the four alternatives. Selecting on peak capability would be selecting on a sample the operator
will not receive.

**Across all nine draws c13 has never mentioned `OLLAMA_NUM_PARALLEL`** — the setting that
serialises Option B's classification behind the agent's own generation, and the reason the "0
additional VRAM" framing it repeats is prohibited by the gold analysis.

### Counter-evidence

c12 is not clean, and Amendment #1 already recorded its two worst arithmetic errors. This run
adds a symmetrical observation about c13: rep 1 computed `28,685 - 29,698 = -1,013 MiB`,
recognised the number was impossible, and annotated it *"the system is structurally saturated"*
rather than recomputing the premise. Noticing an inconsistency and narrating past it is a
distinct failure mode from not noticing, and a worse one in a planner.

---

## Amendment #3 — 2026-08-08 — pre-registered `precise` test EXECUTED and FAILED; planner axis CLOSED

**Status unchanged: Ratified. This amendment closes the last open question in this ADR.**

The follow-up pre-registered in the original decision and restated in Amendment #2 has now run
under the real override, verified three ways: dump header `temperature: 0.6`, banner
`SAMPLING OVERRIDE: preset=precise`, and `sampling_override: "precise"` in each result JSON. Run
`20260808_0836`, scored in `bench/path_e/SCORING-20260808_0836.md`.

**Gate:** Option C 3/3 **and** median > 75 reopens the planner slot.
**Result: Option C 1/3, median 64. FAILED on both conditions.**

| c13 run | Preset | Options | Gold decision | Median |
|---|---|---|---:|---:|
| `0738` | planner (1.0) | B, B, C | 1/3 | 66 |
| `0804` | planner (1.0) | B, B, B | 0/3 | 58 |
| `0824` | planner (1.0) | B(+C), B, C | 1/3 | 66 |
| `0836` | **precise (0.6)** | **C, B(+C), B** | **1/3** | **64** |
| **c13 total** | | | **3 / 12** | |
| **c12 `27b`** | planner (1.0) | C x6 | **6 / 6** | 72, 72 |

**Temperature was not the cause.** Halving it from 1.0 to 0.6 left the decision rate unchanged
(1/3 vs 1/3, 0/3, 1/3) and moved the median down, not up. The instability is a property of the
model on this task, not of the sampling preset. `precise` was faster (99.9-111.7 vs 86.7-98.9
tok/s), which does not enter a quality-gated decision.

**The planner selection is now closed. `qwen3.6:27b` keeps the slot. No further planner benching
is warranted on this task**, and any future reopening requires a *new* pre-registered hypothesis
with a stated mechanism — not another replicate set.

### The decisive qualitative finding

Rep 3 independently derived the mechanism that had been absent from all nine prior c13 draws:

> *"Compute Serialization & Latency. The GPU executes inference sequentially. A classification
> request competes with the active model for GPU time… potentially blocking the operator from
> timely safety interventions."*

That is `OLLAMA_NUM_PARALLEL=1` in substance — the exact reason `bench/gold/arch.md` prohibits
Option B's "zero additional cost" framing. The same answer, two paragraphs earlier, asserts
*"Option B incurs 0 MiB additional VRAM cost,"* and files the serialization objection under
"arguments against my choice" without letting it change the choice.

**The defect is therefore not a knowledge gap but a weighting failure.** For a planner this is
worse than ignorance: the document reads as complete, and the objection that should have
overturned the recommendation is present in it, labelled survivable. A reader skimming for
diligence would find diligence.

### Recorded against the winner, for symmetry

Rep 1 chose correctly and still produced the run's worst arithmetic, concluding *"Physical safety
margin: -5,057 MiB (negative headroom at max context)"* — a statement that the system cannot run.
It double-counted KV cache against a footprint that already includes it, applied the 27b's
74.6 KB/token to `qwen3-coder:30b` (measured 110.0), applied a 131,072 context to a model measured
at 65,536, and used an incorrect overhead midpoint it then silently abandoned. Right answer, unsound
support. This is the same error class flagged three times earlier today: a figure inherited rather
than re-derived from the measurement the harness already recorded.

### Salvage

Run `0824` rep 3 (Option C, 79) and run `0836` rep 1 (Option C, 74) are the two best available
drafts of the `SecurityAnalyzer` port. When the security-analyzer ADR is written, start from
`0824` rep 3's frozen dataclasses and `ActionType`/`TaintTag` model, and take `0836` rep 1's
separation of `ActionDisposition` from risk level plus its `analyze_action`/`analyze_text` split.
Neither is ratified; `bench/gold/arch.md` remains a scoring rubric, not a decision.

---

## Amendment #4 — 2026-08-08 — `OLLAMA_MAX_LOADED_MODELS` 2 → 1 RETRACTED, not applied

**The `=1` consequence in the Decision section is WITHDRAWN. The live value stays `2`.**

### The premise was already falsified when I wrote it

This ADR justified `=1` with: *"The embedder no longer competes for a slot — ADR-004 A#2 placed
it on CPU, confirmed by A#7."* That is wrong, and the measurement refuting it is in this repo,
recorded roughly four hours before ADR-005 was drafted:

> **BUILD_LOG 2026-08-08 05:50 EDT** — `/api/ps` after loading both: `qwen3-embedding:4b` with
> `size_vram: 0` (CPU) and `qwen3.6:35b-a3b-mtp-q4_K_M` with `size_vram: 22,236,427,713` (GPU).
> Two entries under a limit of 2 confirms the open assumption from 05:35: **a CPU-placed model
> does occupy a model slot.** So 1 would have thrashed the embedder and 2 is the correct value.
> Assumption closed by measurement.

`bench/ollama_env.sh:60-66` carries the same rationale and names `1` explicitly as wrong.

Being on CPU removes a model from the **VRAM** budget. It does not remove it from the **slot**
budget. I conflated the two. Applying `=1` would have evicted and reloaded the embedder on every
planner↔coder switch — a regression that the preflight guard, whose expected value I would have
updated in the same commit, would then have certified as correct.

### What `=2` does and does not buy

`=2` was chosen to mean *one GPU role model + the CPU embedder*, enforcing ADR-004's
never-co-resident invariant at the server rather than trusting the router. Whether it actually
delivers that is **unmeasured**, and it is the inverse risk of the one I was worried about: with
`{embedder, planner}` resident at the limit, loading the coder must evict something. If the
scheduler evicts the **embedder**, both role models become co-resident — 26,140 + 26,390 =
52,530 MiB at 131,072 against a 32,607 MiB card.

`bench/oneoff/max_loaded_lru_probe.sh` settles it by measurement. It uses `num_ctx=4096` on
purpose: at 131,072 the two role models cannot both fit whatever the slot policy is, so a VRAM
failure would mask the scheduling answer. Shrinking the context isolates LRU policy.

### Standing requirement, unchanged either way

`OLLAMA_KEEP_ALIVE=-1` means nothing auto-unloads, so **the router must call `ollama stop` on the
outgoing role model explicitly.** That was already in the Decision section and it remains the
actual enforcement mechanism. `MAX_LOADED_MODELS` is a backstop, and after the probe runs we will
know whether it is even that.

No other part of ADR-005 changes. Model selection, contexts, presets and `num_predict` all stand.
