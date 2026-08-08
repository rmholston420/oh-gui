# ADR-013 — A benchmark that cannot reach significance is not evidence: the discrimination floor for Phase 0

**Status:** Ratified
**Lock-in phase:** Phase 0 (blocks Phase 0 exit)
**Supersedes:** —

> **STATUS AMENDMENT (2026-08-08 19:55 EDT) — clause 8 added: attainability is necessary but not
> sufficient; a power floor is now required.**
>
> Executing the go/no-go gate mandated by ADR-016 clause 5 against the surviving Path F calibration
> data (`~/.forge-oh/swebench_runs`, 754 report dirs, 385 distinct tasks, cell
> `c01_coder_vllm_qwen36_27b_int4`) produced a result that this ADR's original clauses would have
> passed and should not have.
>
> **The finding.** 58 tasks were run more than once under an *identical* configuration. **23 of
> those 58 (40%) returned different answers between runs.** Pooled over their 119 runs those 23
> tasks accept at **53.8%** — dead centre of the clause 2 band — with a mean per-task pass
> probability of **0.515**. They are not near the decision boundary in the useful sense. They are
> coin flips.
>
> **Why that breaks clause 1.** Discordance headroom is trivially satisfied by noisy tasks: two
> candidates disagree constantly when a single candidate already disagrees with itself. A task set
> selected *for* mixed outcomes maximises attainable discordant pairs and simultaneously minimises
> the share of that discordance carrying signal. Clause 1 can therefore be satisfied by the worst
> possible task set. Type I error remains correctly controlled (measured 3.6–4.3% at zero true gap,
> as mid-p guarantees), so the danger is not false positives — it is spending GPU hours on a run
> that was always overwhelmingly likely to return "inconclusive".
>
> **Measured power**, simulated over the empirical per-task pass probabilities, single replicate:
>
> | true gap | N=18 | N=23 | N=28 |
> |---:|---:|---:|---:|
> | 10 pts | 7.9% | 9.9% | 12.0% |
> | 20 pts | 22.7% | 30.2% | 36.2% |
> | 30 pts | 47.1% | 59.9% | 69.7% |
>
> One hour of GPU buys N=28 at one replicate: **36% power against a 20-point gap.** Cost to reach
> 80% on that same gap, at 64 s/task: **N=80 single-rep (171 min)** or **N=50 × 3 reps (320 min)**.
> A properly powered local model comparison on this instrument costs three to five hours, not one.
>
> **Clause 8 (new, binding).** A benchmark manifest must state its **minimum detectable effect at
> 80% power**, computed over the empirical per-task pass probabilities of the selected task set,
> before the run. Attainability of ≥ 5 discordant pairs (clause 1) remains necessary and is no
> longer sufficient. A run whose MDE exceeds the gap it is meant to detect is not published, under
> clause 7.
>
> **Clause 9 (new, binding).** Per-task run-to-run variance under a fixed configuration is a
> reportable property of the harness. Where repeat data exists it must be used to compute clause 8;
> where it does not, the manifest says so and the MDE is reported as `null`, never assumed.
>
> **Consequence.** The binding constraint on this benchmark is **instrument noise, not sample
> size** — halving the flip rate buys more power than tripling the tasks. Reducing that noise
> (ADR-013 clause 6 malformed tool calls; sampling determinism under ADR-011) is code work, and is
> the cheaper path to a decisive comparison. No GPU time was spent to learn this.

## Context

`docs/specs/11-dev-plan.md` gates Phase 0 exit on a **baseline metrics report**. `KNOWN_ISSUES.md`
(2026-08-08) records that the report we have cannot support the claim it looks like it makes: 48
cells across six blocks, **every block scored 7/8, and every block failed a different task.**
The entry attributes this to n=1 and to ceiling effects, and states what is owed — repetitions,
harder tasks, a metric besides pass/fail, and reported variance.

That diagnosis is correct but understates the problem, and the understatement matters because it
makes the defect look like a precision issue that more runs would fix.

The Forge-OH review (`docs/forge-oh-code-review.md`) surfaced `bench/lib/mcnemar.py`, a paired mid-p
McNemar test for exactly this comparison — same tasks, same seed, same prompts, one variable
changed. Its 6-test suite was executed during the review and passes. Running its `_midp_two_sided`
over the discordant-pair range settles the question numerically:

| discordant pairs (b+c), all flipping one way | smallest attainable two-tailed p |
|---:|---:|
| 1 | 0.500 |
| 2 | 0.250 |
| 3 | 0.125 |
| 4 | 0.0625 |
| **5** | **0.03125** |
| 6 | 0.0156 |

**A paired comparison needs at least five discordant tasks, all flipping in the same direction, to
reach p < 0.05.** Fewer than five and the *best possible outcome* — a clean sweep — is still not
significant.

The six Phase 0 blocks produced roughly **two** discordant tasks per pair. The harness was therefore
**incapable of returning a significant verdict for any model, at any quality gap, before it was
ever run.** No amount of repetition of that task set fixes this: repetitions reduce per-cell noise,
but the significance ceiling is set by how many tasks can *change outcome*, and at 7/8 acceptance
there are at most one or two such tasks in the whole set.

This is a stronger and more actionable statement than "n=1 measures variance", and it is checkable
rather than argued.

## Decision

**No local benchmark may be cited as evidence for a model, quantization, or configuration choice
unless it can reach p < 0.05 in principle.** Concretely, before any bench run is executed:

1. **Discordance headroom is a pre-registered design parameter.** The task set must be sized and
   calibrated so that **≥ 5 discordant pairs are attainable**. Attainability is a property of the
   task set, not of the run, and must be argued in the harness's own manifest before execution.
2. **Ceiling avoidance is quantitative.** Target baseline acceptance in the **50–70 %** band.
   87.5 % (7/8) is disqualifying: it leaves at most one task with room to change.
3. **The significance test is `mcnemar_paired`**, ported per `PORTING_LEDGER.md`. Its two documented
   limits are inherited and must be stated wherever it is used: it drops tasks with
   `resolved=None`, and it takes **one outcome per task**, so it does not itself consume
   repetitions.
4. **Repetitions are retained in full, never reduced at capture.** Every replicate is written to
   disk as its own record. The donor's harnesses retain only the last of three calls
   (`forge-oh-review/05-bench-ops-scripts.md`); that is the specific mistake this clause forbids.
   How repetitions are folded into the single per-task outcome McNemar consumes — majority vote,
   any-pass, all-pass — is declared in the manifest **before** the run, not chosen after seeing it.
5. **Unmeasurable is null, never zero.** A metric that was not captured is `null`. Zero is a
   measurement.
6. **Tool-call failures are accounted separately from quality failures.** Malformed tool-call JSON
   ran ~2 per cell on every build and destroyed one cell outright. A cell lost to a malformed call
   is `resolved=None`, not `resolved=False`; recording it as a quality failure attributes a harness
   defect to the model. Counts are reported per cell.
7. **A run that violates 1–6 is not published.** It may exist as an exploratory artifact, clearly
   labelled, but it does not enter an ADR, a report, or a selection claim.

`docs/BASELINE-COMPARE-six-blocks.md` remains a **baseline of record for the application** — it
describes what this app did on this hardware. It is **not** a model comparison and may not be cited
as one. `KNOWN_ISSUES.md` already carries that prohibition; this ADR gives the reason a number.

## Rationale

**Why a floor rather than "add repetitions".** Repetitions and discordance headroom fix different
things. Repetitions address whether an observed difference is real; headroom addresses whether a
real difference could ever be observed. The Phase 0 harness failed the second, which is the cheaper
one to check and the one that invalidates the run before any GPU time is spent. Checking it costs a
table lookup; discovering it afterwards cost the six blocks already run.

**Why 5 and not a softer target.** It is not a preference. It is the smallest b+c for which the
extreme outcome clears α = 0.05 under the test we have adopted, computed from that test's own
implementation rather than quoted from literature.

**Why the 50–70 % band.** Discordant pairs are drawn from tasks near the decision boundary. At 90 %+
or 10 %− the candidates agree by construction. The band is a heuristic for keeping enough tasks in
play; the binding constraint is clause 1, and the band is how it is usually met.

**Why pre-registering the fold rule.** Choosing majority-vote versus any-pass after seeing the
replicates is a researcher-degrees-of-freedom problem: with three reps and two candidates the choice
alone can flip the sign. Declaring it in the manifest costs nothing and removes the degree of
freedom.

**Alternatives rejected:**

- **Keep the eight-task set and add repetitions.** Cheapest, and does not work. The ceiling is in
  the task set. Three reps of an unwinnable comparison is an unwinnable comparison costing 3× the
  GPU time.
- **Abandon local benchmarking and defer to upstream recommendations permanently.** This is what
  ADR-012 did as a stopgap, explicitly because the harness could not decide. Making it permanent
  would leave ADR-012's revisit trigger unsatisfiable and give up on measuring our own hardware,
  which is the one thing we can measure that upstream cannot.
- **Report effect sizes without significance testing.** Weaker, not stronger: an effect size from
  two discordant tasks is a point estimate with an interval spanning the entire plausible range.
  It would read as a finding and carry none.

## Consequences

- **Phase 0 exit is blocked** until a compliant harness exists and has run. This is not a new
  blocker — the operator's standing position is that Phase 0 cannot close until the optimized
  models are pulled and benchmarked — but it now has a pass/fail criterion instead of a judgement.
- `KNOWN_ISSUES.md` "the model benchmark cannot tell the candidates apart" gains this ADR as its
  closing condition.
- `PORTING_LEDGER.md`: `bench/lib/mcnemar.py` and `bench/_common/nvml_sampler.py` are promoted from
  **port-later** to **port-early**, and the immutable per-trial manifest design with it. They serve
  Phase 0, not Phase 1.
- **ADR-012's revisit trigger becomes satisfiable.** It selected `qwen3.6:35b-a3b-mtp-coder` on
  upstream recommendation *because* the harness could not decide, and made revisiting conditional on
  this work existing.
- The malformed tool-call defect is reclassified from an annoyance to a **measurement contaminant**
  with a required accounting rule (clause 6). It still wants its own ADR for the fix; this ADR only
  stops it corrupting the numbers.
- Any future comparison — quantization, runtime, sampling preset, context length — inherits clauses
  1–7. This is a standing gate, not a one-off.

## Lock-in phase

Phase 0. Binding before the next bench run.

## References

- `KNOWN_ISSUES.md` 2026-08-08 — "the model benchmark cannot tell the candidates apart"
- `docs/specs/11-dev-plan.md` — Phase 0 exit criterion
- `docs/forge-oh-code-review.md` §§3, 5 — measurement critique
- `docs/forge-oh-review/05-bench-ops-scripts.md` — final-only retention; `mcnemar.py` suite executed 6/6
- Donor `bench/lib/mcnemar.py` @ `df73ebed` — MIT; mid-p rationale and Fagerland/Lydersen/Laake 2013
- ADR-012 — default coder model, and its revisit trigger
- `docs/BASELINE-COMPARE-six-blocks.md` — baseline of record, not a ranking
