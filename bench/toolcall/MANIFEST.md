# Tool-call benchmark — pre-registered manifest

**Status:** Pre-run; created before any GPU/model invocation. This benchmark is an
objective tool-call-format comparison for wiring a local coder into OH-GUI. The
observed direct probe motivating it was a Qwen3.6 coder response with no
`tool_calls`; therefore tool-call correctness, not human-rated prose, is the
decision-relevant outcome.

## Cells, arms, and immutable design

Cells are split into two arms with different evidentiary standing. Only the
confirmatory arm may carry an inferential claim.

| Cell | Model | Arm | Repetitions | Fold rule |
|---|---|---|---:|---|
| A (baseline) | `qwen3.6:35b-a3b-mtp-coder` | confirmatory | 5/task | **majority vote of 5** valid `resolved` outcomes per task |
| B | `hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL` | confirmatory | 5/task | majority vote of 5 |
| C | `qwen3.5:27b-q4_K_M` | confirmatory | 5/task | majority vote of 5 |
| D | `qwen3.5:9b-q8_0` | confirmatory | 5/task | majority vote of 5 |
| H | `glm-4.7-flash:q4_K_M` | confirmatory | 5/task | majority vote of 5 |
| E | `qwen3.5:4b-q8_0` | exploratory | 1/task | none; raw rate only |
| F | `qwen3.5:2b-q8_0` | exploratory | 1/task | none; raw rate only |
| G | `laguna-xs-2.1:q4_K_M` | exploratory | 1/task | none; raw rate only |
| H | `glm-4.7-flash:q4_K_M` | exploratory | 1/task | none; raw rate only |
| I | `lfm2.5:8b` | exploratory | 1/task | none; raw rate only |
| J | `ornith:35b` | exploratory | 1/task | none; raw rate only |
| K | `qwen3.5:0.8b-q8_0` | exploratory | 1/task | none; raw rate only |

All eleven cells were probed for native `tool_calls` emission before registration.
`deepseek-r1:32b-qwen-distill-q4_K_M` and `deepseek-r1:8b-0528-qwen3-q8_0` were
probed and **excluded**: both accepted the `tools` parameter and returned no
`tool_calls`, so they cannot produce a measurable outcome under ADR-013 clause
6 and would burn budget generating nothing citable. `laguna-xs-2.1:q4_K_M` and
`ornith:35b` returned HTTP 412 (`requires a newer version of Ollama`) on the
installed runtime and are registered but expected to be skipped as unavailable;
the harness skips a missing exploratory cell and hard-fails a missing
confirmatory one.

`qwen3.5:0.8b-q8_0` (cell K) was added at 2026-08-09 04:47 EDT to anchor the bottom of the
parameter-scale curve, after probing PASS with a well-formed `terminal` call in 1.9 s. Published
tool-calling results show a sharp capability cliff below 9B, so the prior expectation was failure;
it passed, which is itself the reason to measure it rather than assume. It is exploratory only and
cannot affect the confirmatory arm or the Holm family. Cells run at 0.8b/2b/4b/9b/27b/35b give the
GUI's observed-reliability-tier surface a scale curve with a measured floor instead of scattered
points.

**Cell H was promoted from exploratory to confirmatory at 2026-08-09 05:33 EDT,
before any model was invoked.** The reason is architectural, not empirical: cells
A, C and D are all Qwen, so three of the four original confirmatory cells share a
family, a tokenizer and a tool-call training regime. A result that held across
A/C/D could be a fact about Qwen rather than about tool-call reliability, and only
B (Devstral) could distinguish those. GLM-4.7-Flash is a second independent
lineage, which is what makes the comparison generalizable.

The promotion is registered **a priori and deliberately not conditioned on
screening**. The design does permit promotion on screening evidence tested on the
held-out split, and that route would have been defensible — but choosing the
challenger after seeing its screening score lets noise pick the arm, and it grows
the Holm family as a function of observed data. Registering it now costs one extra
comparison in the family and roughly 26 minutes of runtime, and buys a selection
rule that owes nothing to any outcome.

**Multiplicity.** McNemar is pairwise. The confirmatory arm is therefore
restricted to **baseline-vs-each**, giving *k*−1 = 4 comparisons (A–B, A–C,
A–D, A–H), corrected by **Holm–Bonferroni** at family-wise α = 0.05. The family
grew from three to four when cell H was promoted; because that promotion was
registered before any model ran, the family size is still fixed a priori and
does not depend on observed data. Testing all
pairs across ten cells would be 45 comparisons and would be expected to
manufacture roughly two spurious winners at α = 0.05. Exploratory cells receive
no p-value and no "better than" claim of any kind.

### Disjoint task split (guards against selection bias)

The 120-task library is partitioned **before any model is invoked** into a
40-task **screening** split and an 80-task **confirmatory** split. Membership is
content-addressed by `sha256("oh-gui/toolcall/split/v1:" + task_id)`, so it
depends only on the task id and a fixed salt — never on file order or on
anything observed during a run.

Screening ranks candidates cheaply at 1 repetition. The confirmatory test then
runs on the **held-out 80**, which the screen never touched. This is the whole
point of the split: choosing a challenger by its screening score and then
scoring it again on those same tasks would credit a model for the noise that
selected it. Any model promoted from exploratory to confirmatory on screening
evidence is tested only on the held-out split.

The task library is the 120 versioned JSON prompts in `bench/toolcall/tasks/`, each
carrying the real OpenHands Tools 1.41.0 `terminal` and `file_editor` schemas
transcribed from the pinned SDK source. All task scoring is automated and pure:
selected tool, JSON-object arguments, and the task-declared required arguments
and types. There is no human scoring.

Sampling is the **Qwen3.6 precise-coding preset** in
[`bench/SAMPLING.md`](../SAMPLING.md): `temperature=0.6`, `top_p=0.95`,
`top_k=20`, `min_p=0.0`, `presence_penalty=0.0`, and
`repetition_penalty=1.0`. The harness sends those values explicitly for both
cells and records them per replicate. It strips any emitted
`<think>...</think>` block before grading.

Replicates are never overwritten or reduced at capture: each cell × task ×
replicate is an immutable JSON file. The pre-declared majority fold is applied
only during subsequent paired analysis. A task with fewer than two measured
(`resolved` boolean) replicates after tool-call failures folds to `null`, not
false or zero. The paired mid-p McNemar test then drops `null` tasks by its
inherited limits and consumes the one folded boolean outcome per task.

## Registered runtime environment

Tool-call emission is a property of the serving runtime's chat and tool templates, not of the
model weights alone. The runtime version is therefore part of the registered design, and results
are scoped to it.

| Field | Value | Captured |
|---|---|---|
| Ollama version | **0.30.7** (`ollama --version`, `/api/version` agree) | 2026-08-09 04:42 EDT |
| Endpoint | `http://127.0.0.1:11434/v1` | — |
| GPU | RTX 5090, 32607 MiB total, 11268 MiB in use at capture | 2026-08-09 04:42 EDT |
| Host | Colossus (Kubuntu, 128 GB RAM, Blackwell SM_120) | — |

This version was captured **after** the timing and tool-call probes but **before** any benchmark
cell ran, and Ollama was not upgraded or restarted between the probes and this capture, so the
probe results are attributable to 0.30.7. Recording that ordering rather than implying the version
was pinned up front.

`laguna-xs-2.1:q4_K_M` and `ornith:35b` return HTTP 412 on 0.30.7 (`requires a newer version of
Ollama`) and cannot be pulled. Both are exploratory cells; no confirmatory cell is affected. The
upgrade is deferred by decision, not oversight — see `KNOWN_ISSUES.md`.

**Comparability rule.** Any Ollama upgrade invalidates cross-runtime comparison until all four
confirmatory models (A–D) are re-probed for tool-call emission and re-timed. Results produced
under 0.30.7 must be labelled as such and must not be silently pooled with post-upgrade results.

## ADR-013 pre-run discrimination gate

**Target baseline acceptance:** 50–70%; the registered calibration target for
cell A is 60%. This is inside ADR-013 clause 2's required 50–70% band.

For two Bernoulli task outcomes with acceptance rates \(p_A,p_B\) and
within-task outcome correlation \(\rho\), the expected discordant fraction is:

\[
q = p_A+p_B-2p_Ap_B - 2\rho\sqrt{p_A(1-p_A)p_B(1-p_B)}.
\]

The pre-registered calibration is \(p_A=0.60\), \(p_B=0.50\), and a
**conservative** \(\rho=0.80\), scored against the **80-task confirmatory
split** — not the 120-task library. Power comes only from the tasks the
inferential test actually consumes; scoring 120 here would overstate it by
half.

The correlation term is the load-bearing assumption and is registered
pessimistically on purpose. Two models graded on an identical task set share
the difficulty structure of that set, so their per-task outcomes are positively
correlated; an optimistic \(\rho\) inflates attainability precisely when the
design is least able to deliver it. At \(\rho=0.80\):

\[
q = 0.60+0.50-2(0.60)(0.50)
    -2(0.80)\sqrt{(0.60)(0.40)(0.50)(0.50)}
  = 0.10807\ldots
\]

At \(N=80\), expected discordant pairs are \(80q=8.65\), clearing the floor
**at the pessimistic bound** with genuine margin rather than squeaking past.
At \(\rho=0.70\) the design yields \(12.56\), at \(\rho=0.60\) \(16.48\), and at
\(\rho=0.50\) \(20.41\).

The floor also holds under the null of equal models: \(p_A=p_B=0.60\) gives
\(11.52\) expected discordant pairs at \(\rho=0.70\), so a genuine tie still
produces a publishable, interpretable result instead of an unusable run.

Ceiling behavior still fails, as it should: \(p_A=p_B=0.90,\rho=0.80\) gives
\(q=0.036\) and only \(2.88\) expected discordant pairs at \(N=80\) — below the
floor. If both models are near-perfect on these tasks the design cannot
separate them, and the gate says so instead of pretending otherwise. The gate
implements this arithmetic and must pass before any model request.

**Design-history note (pre-run, no data seen).** This manifest has been resized
twice, both times before any model was invoked and before any outcome data
existed. Recording the full sequence here keeps the pre-registration honest.

1. \(N=20\) at \(\rho=0.50\) → 5.10 pairs. Resized because the margin survived
   only under an optimistic correlation.
2. \(N=47\) at \(\rho=0.80\) → 5.08 pairs. Cleared the floor but with almost no
   headroom.
3. \(N=120\) library, **80-task confirmatory split** at \(\rho=0.80\) → 8.65
   pairs. Adopted 2026-08-09 after measurement showed the GPU cost of a cell was
   roughly 40x smaller than estimated, which moved the binding constraint from
   wall-clock to statistical power. Repetitions were also raised 3 → 5.
   Repetitions stabilise each task's folded outcome; they do **not** create
   discordant pairs, so the added power comes from \(N\), not from reps.

<!-- attainability: {"task_count":80,"acceptance_a":0.60,"acceptance_b":0.50,"correlation":0.80,"minimum_discordant_pairs":5,"total_task_files":120,"screening_task_count":40} -->

## Power / variance disclosure (ADR-013 status amendment clauses 8–9)

No fixed-configuration repeat data exists for these new tool-call tasks before
the run. Consequently the required 80%-power MDE over empirical per-task pass
probabilities is **`null`**, not assumed. Per-task run-to-run variance is also
pre-run **`null`**. The post-run report must calculate both from retained
replicates before making a model-selection claim; attainability is necessary,
not sufficient.

## Budget and publication rules

Per-request latency was **measured**, not assumed, by
`bench/toolcall/timing_probe.py` on 2026-08-09 04:23 EDT: warm times ranged from
0.32 s (Devstral) to 1.30 s (`qwen3.5:27b-q4_K_M`). The earlier registered
estimate of 24 s/request was a 30B-class guess that overstated real latency by
roughly 40x. The harness projects the budget from these measurements inflated by
a **5x safety factor** plus a 70 s cold-load allowance per cell, because the
probe task was short and real tasks carry larger schemas.

The ADR-016 amendment of 2026-08-09 03:56 EDT, which raised the GPU cap to 3.5 h,
rested entirely on that disproven 24 s figure and is therefore **withdrawn as
premise-falsified** rather than left standing. The operator authorised an
overnight window of up to 8 hours at 04:26 EDT; the harness enforces that as its
ceiling and refuses to dispatch if the projection exceeds it.

A run violating this manifest or ADR-013 clauses 1–7 is exploratory only and
must not support a model-selection claim.
