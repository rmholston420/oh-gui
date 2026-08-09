# ADR-016 — The benchmark gates a claim, not the code: decouple the baseline report from Phase 0 exit

> **STATUS AMENDMENT 2 (2026-08-09 06:20 EDT):** the same criterion is applied in full.
> `missing_tool_call` and malformed-envelope outcomes are measured quality failures, not
> unmeasurable ones; only a transport failure or an absent assistant message is unobserved.
> Amendment 1 alone left `lfm2.5:8b` ranked first on 4 of 40 tasks, because its 36 no-tool-call
> replies were dropped rather than counted. Coverage is now reported beside every rate. The
> attainability gate is re-run against re-graded screening rates before confirmatory GPU time.

> **STATUS AMENDMENT (2026-08-09 06:14 EDT):** the grading predicate is amended on screening
> evidence. Argument errors (`missing_required_arg:*`, `invalid_arg:*`) are measured quality
> failures, not unmeasurable tool-call failures; `resolved=None` is reserved for responses whose
> outcome could not be observed. The original predicate deleted a model's argument errors from its
> own denominator, compressing all nine screening cells to 89-100% and flattening the ranking. The
> screening split exists to catch exactly this before the confirmatory stage; the confirmatory run
> was stopped mid-flight and its partial output discarded rather than scored. See
> `bench/toolcall/MANIFEST.md`, "Protocol amendment — 2026-08-09".

> **STATUS AMENDMENT (2026-08-09 03:56 EDT):** Clause 5's one-hour GPU cap superseded for the
> tool-call benchmark only, raising it to 3.5 hours.
>
> **STATUS AMENDMENT (2026-08-09 04:35 EDT) — the 03:56 amendment is WITHDRAWN as
> premise-falsified.** Its budget arithmetic rested entirely on a 24.2 s/request figure that
> was an unmeasured 30B-class guess. Direct measurement (`bench/toolcall/timing_probe.py`,
> 04:23 EDT) found warm per-request latency of **0.32-1.30 s** across all six probed models —
> the estimate overstated real cost by roughly **40x**. A superseding amendment cannot inherit
> a disproven premise, so the 3.5-hour figure is withdrawn rather than left standing as though
> it had been reasoned to. See "Amendment II — budget re-derived from measurement" below.
> All original text is retained unaltered for the record.

**Status:** Ratified · Amended 2026-08-09 (twice; first amendment withdrawn)
**Lock-in phase:** Phase 0 / Phase 1 boundary
**Supersedes:** — (amends the Consequences of ADR-013)

## Context

ADR-013 ends with "**Phase 0 exit is blocked** until a compliant harness exists and has run." That
consequence was written while auditing the benchmark, and it inherited the dev plan's ordering
without asking whether the ordering was load-bearing.

It is not. Reviewing what Phase 1 actually needs:

- The **Phase 1 authorization slice** (spec `04-authorization.md`, ADR-014, ADR-015) is a
  confirmation surface over `SecurityAnalyzerBase` and `ActionEvent`. Nothing in it varies with
  which local model is faster or more accurate.
- **ADR-012 already selected a default coder model** (`qwen3.6:35b-a3b-mtp-coder`), explicitly on
  upstream recommendation *because* the harness could not decide. That selection stands and is
  usable today.
- What the benchmark produces is the **baseline metrics report** — an artifact that substantiates
  model claims. It is a reporting deliverable, not a dependency of any code path.

Meanwhile the cost is real and has been paid repeatedly: six Phase 0 blocks that ADR-013 showed
were incapable of a significant verdict, plus the hours around them. The operator's position as of
2026-08-08 19:47 EDT is a hard cap: **"i'm not willing to spend more than 1 hour on benchmarking"**,
and "we have barely started to build anything."

The two facts in tension are the operator's earlier standing position — "we can't close Phase 0
until we pull and benchmark the optimized LLMs we discussed earlier" — and the one-hour cap. This
ADR resolves them by separating *when Phase 0 closes* from *when a model claim may be made*.

## Decision

**The baseline metrics report moves to a parallel track. It no longer blocks Phase 0 exit.**

1. **Phase 0 exit criteria become:** the first-run wizard, and the already-completed items. The
   baseline metrics report is struck from the exit gate.
2. **ADR-013's seven clauses remain fully binding, unweakened.** Nothing about the quality bar
   changes. A benchmark that cannot reach p < 0.05 in principle is still not evidence.
3. **What the benchmark now gates is narrower and stricter:** no ADR, report, spec, or code comment
   may assert that one model, quantization, runtime, or sampling preset is better than another until
   a compliant run says so. ADR-012's model default is explicitly exempt — it is on record as
   deference to upstream in the absence of local evidence, not as a local finding.
4. **Phase 1 work proceeds immediately** against the ADR-012 default.
5. **The benchmark is budget-capped at one hour of GPU time.** A go/no-go attainability check runs
   *before* any GPU time: if the selected task set cannot reach ≥ 5 discordant pairs within the
   budget, the run is not started and the budget is not spent. Per ADR-013 clause 7 a
   non-compliant run is unpublishable, so starting one we know cannot comply is pure waste.

## Amendment I — budget resized to preserve ADR-013 clause 1 (2026-08-09 03:56 EDT) — WITHDRAWN 04:35 EDT

The one-hour cap in clause 5 and the ADR-013 clause 1 discrimination floor turned out to be in
direct conflict once the attainability arithmetic was actually done, rather than assumed.

The first compliant design that fit one hour was 20 tasks, and it cleared the five-discordant-pair
floor only at an assumed outcome correlation of rho = 0.50. That assumption does not survive
contact with the setup: both cells are graded on an identical task set, so they share its difficulty
structure and their per-task outcomes are positively correlated. At the realistic rho = 0.60-0.80,
20 tasks yield 4.12 to 2.16 expected discordant pairs - below the floor. Under ADR-013 clause 7
such a run is unpublishable, so the one-hour design would have spent the hour and produced nothing
citable. That is the precise waste clause 5 was written to prevent, arrived at from the other side.

Given the choice between a cheap unpublishable run and a longer publishable one, the operator chose
the latter on 2026-08-09 03:56 EDT, selecting 47 tasks x 3 repetitions.

**Amended budget.** For the tool-call benchmark registered in `bench/toolcall/MANIFEST.md`, the GPU
budget is capped at **3.5 hours** rather than one hour. Measured harness estimate is 24.2 s/call:
114 minutes for two cells (47 x 3 x 2 = 282 calls), or 171 minutes if a third cell is registered.
The run is unattended and overnight, so wall-clock cost to the operator is sleep time, not
working time - which is the specific reason the original cap does not apply to it.

**What is unchanged.** Clause 5's go/no-go structure survives intact and still binds: the
attainability gate runs *before* any GPU time, and if the registered design cannot reach five
discordant pairs the run is not started and the budget is not spent. The amendment resizes the
budget; it does not remove the gate, and it does not touch ADR-013's seven clauses. Clause 3's
publication ban likewise still holds until a compliant run says otherwise.

**Scope.** This amendment is specific to the tool-call benchmark. It sets no precedent for
open-ended GPU spend; any future benchmark re-inherits the one-hour default unless separately
amended.

## Amendment II — budget re-derived from measurement (2026-08-09 04:35 EDT)

**Amendment I is withdrawn.** Not revised — withdrawn. Its entire quantitative case was the
line "Measured harness estimate is 24.2 s/call", and that number was never measured. It was a
30B-class guess that had been carried forward until it reached a gate, at which point it was
setting policy. Measuring it took ten minutes and falsified it by a factor of about forty.

**Measured latency** (`bench/toolcall/timing_probe.py`, 2026-08-09 04:23 EDT, warm):

| Model | warm | cold |
|---|---:|---:|
| `qwen3.6:35b-a3b-mtp-coder` | 0.51 s | 29.5 s |
| `hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL` | 0.32 s | 6.0 s |
| `qwen3.5:27b-q4_K_M` | 1.30 s | 66.0 s |
| `qwen3.5:9b-q8_0` | 0.89 s | 12.8 s |
| `qwen3.5:4b-q8_0` | 0.73 s | 3.7 s |
| `qwen3.5:2b-q8_0` | 0.65 s | 5.5 s |

The probe used a single short task, so these are a floor, not a typical cost. The harness
therefore applies a **5x safety factor** to measured warm latency plus a 70 s cold-load
allowance per cell, and refuses to dispatch if the projection exceeds the authorised window.

**Re-derived budget.** The operator authorised an unattended overnight window of **up to 8
hours** at 04:26 EDT. That is the registered ceiling. Because cost per cell collapsed, the
binding constraint moved from wall-clock to **statistical power**, and the design was resized
accordingly: 120-task library, 40/80 disjoint screening/confirmatory split, 5 repetitions,
expected discordant pairs **8.65** at the pessimistic rho = 0.80 (was 5.08 at N = 47).

**What is unchanged.** ADR-013's seven clauses, the pre-GPU attainability gate, and clause 3's
publication ban all still bind, exactly as under Amendment I. The gate now scores the 80-task
confirmatory split rather than the full library, because power comes only from the tasks the
inferential test consumes.

**Process consequence.** A constant that feeds a gate must be measured before it is registered.
The failure here was not the wrong number; it was promoting an estimate to a premise without
marking it as one, so that a later decision could rest on it as if it were evidence.

## Rationale

**Why decouple rather than lower the bar.** The two available shortcuts were to weaken ADR-013 or to
move it off the critical path. Weakening it re-creates the exact failure it was written to prevent
and would invalidate ADR-013 three hours after ratifying it. Moving it off the critical path costs
nothing in rigour: the same run, held to the same seven clauses, simply happens beside the build
instead of in front of it.

**Why this is safe.** The coupling was never technical. No Phase 1 module imports a benchmark
result. The only real dependency runs the other way — ADR-012's revisit trigger wants the benchmark
to exist eventually, and clause 3 preserves that.

**Why the pre-run attainability gate.** ADR-013's core insight is that the cheap check comes first:
verifying headroom costs a table lookup, while discovering its absence costs the whole run. Under a
one-hour cap that asymmetry is sharper, not softer.

**Alternatives rejected:**

- **Keep the gate and run the bench first.** Honest but expensive, and it front-loads a reporting
  artifact ahead of the product. The operator has explicitly declined this.
- **Weaken ADR-013 to fit one hour.** Produces a number that looks like evidence and is not. This
  is the precise failure mode ADR-013 exists to forbid.
- **Drop local benchmarking entirely.** Already rejected in ADR-013; leaves ADR-012's revisit
  trigger permanently unsatisfiable.

## Consequences

- `docs/specs/11-dev-plan.md` Phase 0 exit list: the baseline metrics report is struck and
  cross-referenced here.
- ADR-013's Consequences bullet "Phase 0 exit is blocked" is **amended by this ADR**. Its clauses
  1–7 are untouched.
- Phase 1 authorization slice starts now, against ADR-012's default model.
- The benchmark inherits a one-hour cap and a pre-run go/no-go gate.
- `KNOWN_ISSUES.md` "the model benchmark cannot tell the candidates apart" keeps ADR-013 as its
  closing condition; that condition is now off the Phase 0 critical path.
- **Risk accepted:** Phase 0 closes without a published model comparison, so no model claim may be
  made until the parallel track completes. Clause 3 is what keeps this from silently becoming
  "we never measured and cited the default as if we had."

## Lock-in phase

Immediate. Binding on the next unit of work.

## References

- ADR-013 — discrimination floor; clauses 1–7 preserved in full
- ADR-012 — default coder model and its revisit trigger
- ADR-014, ADR-015 — Phase 1 authorization slice, which has no benchmark dependency
- `docs/specs/11-dev-plan.md` — Phase 0 exit criteria
- Operator instruction 2026-08-08 19:47 EDT — one-hour benchmarking cap
