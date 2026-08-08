# ADR-008 — Phase 0 Baseline Metrics: Method, and Verdict

**Status:** Proposed — method ratified on first use; verdict section is a skeleton pending the run
**Lock-in phase:** Phase 0 exit
**Supersedes:** —

## Context

`docs/specs/02-repo-setup.md` item 5 makes a baseline metrics report a Phase 0 exit criterion:
5-10 representative coding tasks through the unmodified app, logging time-to-first-review,
turns-to-acceptance, lines-accepted-without-inspection, "lost track" incidents, and GPU
temperature/power. Item 6 adds mental-model formation; item 7 requires the run be against a
Qwen3 27B-35B model with variant and quantization recorded.

Three questions had to be settled before any number could be collected.

**1. Can this be automated?** No. Two of the five item-5 metrics are irreducibly human:
"lost track" is a state of the operator's mind, and "accepted without inspection" is a fact about
whether a person read a diff. Nothing observable from outside distinguishes a read diff from an
unread one.

**2. Which backend does "the unmodified app" run against?** The reference checkout is Agent Canvas
v1.12.0, which depends on `@openhands/typescript-client@1.36.1`. This repo pins the Agent Server
image at v1.41.0. Running the stock frontend against a server five minor versions ahead would
measure a combination that neither upstream nor OH-GUI ships.

**3. What code do the tasks operate on?** OH-GUI itself is mid-build and changes hourly; a baseline
taken against a moving target cannot be re-run later for comparison, which is the entire purpose.

## Decision

**Method.** An instrumented observation harness, not an automated benchmark
(`bench/baseline/`). The operator drives the stock app by hand. The harness timestamps marked
events, counts accepted lines from `git` rather than operator recall, samples the GPU at 1 Hz under
the standard `bench/lib/gpu.sh` cutout, and records resident models from `ollama ps`.

**Backend.** The baseline runs the stock app **from source via `npm run dev`, which starts the
backend the app itself pins through `uvx`** — not the `ghcr.io/openhands/agent-server` image pinned
in `docs/UPSTREAM_PINS.md`. The image pin governs what OH-GUI builds against in Phase 1. A baseline
must measure the app as shipped, so it uses the app's own backend, and the harness records the
versions actually observed.

**Task set.** Eight tasks against a purpose-built, script-seeded fixture (`notes-api`), ordered
additive → behavioral → refactor → cross-cutting, with t08 expected to be hard. The fixture is
recreated byte-identically by `seed_fixture.sh`, so the same eight tasks can be re-run against
OH-GUI at any later phase and compared.

**Item 7 evidence.** Variant and quantization are taken from `ollama ps` samples captured during
the run, not from the settings screen. If no samples are captured, `report.py` states that item 7
is **not** satisfied rather than leaving the field blank.

## Rationale

A fabricated baseline is worse than no baseline, because Phase 1 gets measured against it. Any
scheme that synthesised "lines accepted without inspection" would be inventing the number that
`13-hard-constraints.md:16` exists to control.

Alternatives rejected:

- **Fully scripted agent runs.** Produces turns and tokens, but cannot produce three of the five
  named metrics. It would look rigorous and measure the wrong thing.
- **Tasks against this repo.** Not reproducible; the target changes between Phase 0 and any later
  comparison.
- **Baseline against the pinned v1.41.0 server image.** Measures a pairing nobody ships.

## Consequences

- New: `bench/baseline/` (fixture seeder, 8 task cards, runner, recorder, aggregator, 10 tests).
- The report lands at `docs/BASELINE-METRICS-<stamp>.md` and closes the last Phase 0 exit item.
- `docs/UPSTREAM_PINS.md` gains the backend versions actually observed during the baseline, which
  may differ from the pinned image; that difference is expected and is recorded, not reconciled.
- The same eight tasks become the regression comparison for later phases.

## Verdict — PENDING

> Filled after the run. Do not cite this section until it is.

| Metric | Baseline (stock app) | Notes |
|---|---:|---|
| Mean time to first review | — | |
| Mean turns to acceptance | — | |
| Lines accepted | — | |
| …without inspection | — | share of total |
| Lost-track incidents | — | |
| Turns before first corrective | — | item 6 |
| Corrective encoded durably | — | item 6 |
| Peak GPU °C / W | — | thermally throttled? |
| Model variant / quantization | — | from `ollama ps`, item 7 |

**Tasks abandoned:** —
**What the stock app did worst:** —
**Which OH-GUI design commitments this evidence supports or contradicts:** —

## Lock-in phase

Phase 0 exit.

## References

- `docs/specs/02-repo-setup.md` items 5-7
- `bench/baseline/README.md`
- ADR-005 (model pair), ADR-001 Amendment #2 (reference checkout location)
- `docs/specs/08-telemetry.md` §8.6 (failure-signature vocabulary)
