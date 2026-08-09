# Kosmos / OH-GUI Session Handoff — 2026-08-09 04:38 EDT

## Current build-sequencing position

- **Stage / phase:** Phase 0 parallel track (ADR-016 benchmark) + Phase 1 GUI slice
- **Component:** `bench/toolcall/` harness; `apps/gui/src/features/model-profiles/`
- **Ports in progress:** none (bench + GUI surface only)

## Completed this session

- Measured per-request latency; falsified the registered 24.2 s/request estimate by ~40x.
- **Withdrew** ADR-016 Amendment I as premise-falsified; added Amendment II derived from measurement.
- Task library 47 -> 120, independently verified (unique ids, no duplicate goals, no `_sdk_src` refs).
- Pre-registered disjoint 40/80 screening/confirmatory split, content-addressed by salted sha256.
- 10 cells in confirmatory (A-D) / exploratory (E-J) arms; Holm-Bonferroni over 3 comparisons.
- Attainability re-registered against the 80-task confirmatory split: **8.65** expected discordant pairs.
- Harness: `--mode`, resume, availability preflight, manifest-vs-filesystem drift check, live progress.
- GUI: model profiles, observed reliability tiers, failure signatures, 30-tool warning, disabled cloud fallback.
- Mutation-tested all three new gates; each produced the expected red before restore.
- Committed and pushed **`54ce691`**.

## Verification state (all green at handoff)

- `python3 -m pytest bench/toolcall/tests/ -q` — 29 passed
- `python3 scripts/check-hard-constraints.py` — `=== PASSED ===`
- `python3 bench/validate_harness.py` — all checks passed
- `apps/gui`: `npm run gate` — 24 files / 174 tests; `npx playwright test --grep-invert @live` — 28 passed

## Remaining before the current Definition of Done

1. Operator approves the registered manifest, then runs the screen (~66 min projected) and the
   confirmatory run.
2. Score, rank, and record the verdict in ADR-016.
3. Assign requirement IDs across the remaining Phase 1 specs (ADR-028).

## Open questions awaiting operator answer

- **Ollama upgrade.** `laguna-xs-2.1:q4_K_M` and `ornith:35b` return HTTP 412 (needs a newer
  Ollama). Deliberately deferred: upgrading before an unattended run risks the night, and it would
  change the tool-call templates being measured. Decide while awake, after this benchmark.
- Whether any exploratory cell that screens well should be promoted to confirmatory. If so it is
  tested **only** on the held-out 80, and the Holm family grows accordingly.

## Carried debt (unchanged)

- Wizard §3.4 items 1 & 3 inert; `trust-dial.ts` mirror owed; `docs/specs/15-middleware-harness.md`
  unwritten; ADR-030 `03-layout.md` object-set; 1600px breakpoint arithmetic unresolved
  (280+380+>=60% needs >=1620px).

## Exact next action

```bash
cd ~/dev/oh-gui && git pull --ff-only && python3 bench/toolcall/bench_toolcall.py --mode screen 2>&1 | tee /tmp/screen.log
```
