# Tool-call benchmark — pre-registered manifest

**Status:** Pre-run; created before any GPU/model invocation. This benchmark is an
objective tool-call-format comparison for wiring a local coder into OH-GUI. The
observed direct probe motivating it was a Qwen3.6 coder response with no
`tool_calls`; therefore tool-call correctness, not human-rated prose, is the
decision-relevant outcome.

## Cells and immutable design

| Cell | Model | Role | Repetitions | Fold rule |
|---|---|---|---:|---|
| A (baseline) | `qwen3.6:35b-a3b-mtp-coder` | coder | 3/task | **majority vote of 3** valid `resolved` outcomes per task |
| B (treatment) | `hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL` | coder | 3/task | **majority vote of 3** valid `resolved` outcomes per task |

The task set is the 47 versioned JSON prompts in `bench/toolcall/tasks/`, each
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

## ADR-013 pre-run discrimination gate

**Target baseline acceptance:** 50–70%; the registered calibration target for
cell A is 60%. This is inside ADR-013 clause 2's required 50–70% band.

For two Bernoulli task outcomes with acceptance rates \(p_A,p_B\) and
within-task outcome correlation \(\rho\), the expected discordant fraction is:

\[
q = p_A+p_B-2p_Ap_B - 2\rho\sqrt{p_A(1-p_A)p_B(1-p_B)}.
\]

The pre-registered calibration is \(p_A=0.60\), \(p_B=0.50\), and a
**conservative** \(\rho=0.80\).

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

At \(N=47\), expected discordant pairs are \(47q=5.08\), clearing the floor
**at the pessimistic bound**. At the more plausible \(\rho=0.70\) the design
yields \(7.38\), at \(\rho=0.60\) it yields \(9.68\), and at \(\rho=0.50\) it
yields \(11.99\) — so the registered set has real headroom everywhere inside
the plausible range rather than squeaking past at one favourable point.

The floor also holds under the null of equal models: \(p_A=p_B=0.60\) gives
\(6.77\) expected discordant pairs at \(\rho=0.70\), so a genuine tie still
produces a publishable, interpretable result instead of an unusable run.

A smaller set fails: at the registered \(\rho=0.80\), \(N=46\) gives \(4.97\),
below the floor. Ceiling behavior also fails: \(p_A=p_B=0.90,\rho=0.80\) gives
\(q=0.036\) and only \(1.69\) expected discordant pairs at \(N=47\). The gate
implements this arithmetic and must pass before any model request.

**Design-history note (pre-run, no data seen).** An earlier draft of this
manifest registered \(N=20\) at \(\rho=0.50\), yielding \(5.10\). That design
was resized to \(N=47\) at \(\rho=0.80\) on 2026-08-09 on the operator's
instruction, *before any model was invoked and before any outcome data
existed*, because the original margin survived only under an optimistic
correlation. Recording the revision here keeps the pre-registration honest.

<!-- attainability: {"task_count":47,"acceptance_a":0.60,"acceptance_b":0.50,"correlation":0.80,"minimum_discordant_pairs":5} -->

## Power / variance disclosure (ADR-013 status amendment clauses 8–9)

No fixed-configuration repeat data exists for these new tool-call tasks before
the run. Consequently the required 80%-power MDE over empirical per-task pass
probabilities is **`null`**, not assumed. Per-task run-to-run variance is also
pre-run **`null`**. The post-run report must calculate both from retained
replicates before making a model-selection claim; attainability is necessary,
not sufficient.

## Budget and publication rules

The pre-run estimate is 120 requests × 24 seconds plus 60 seconds for two
model warmups = **2,940 seconds (49 minutes)**, inside ADR-016's one-hour GPU
cap. The harness prints the same calculation before dispatch. A run violating
this manifest or ADR-013 clauses 1–7 is exploratory only and must not support a
model-selection claim.
