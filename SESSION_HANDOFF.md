# SESSION_HANDOFF

Overwritten 2026-08-08 09:52 EDT.

## Stage in progress

Phase 0 baseline. **Path E model selection is CLOSED** — ADR-005 Ratified, Amendments #1, #2, #3.
No further planner or coder benching is warranted.

## Final selection (ADR-005)

| Role | Model | ctx | Preset | Think | num_predict |
|---|---|---:|---|---|---:|
| Planner | `qwen3.6:27b` | 131,072 | `planner` 1.0/0.95/20 | on | 16,384 |
| Coder | `qwen3.6:35b-a3b-mtp-q4_K_M` | 131,072 | `precise` 0.6/0.95/20 | on | 16,384 |

Roles do NOT collapse: 26,140 + 26,390 = 52,530 MiB against a 32,607 MiB card, so the router
MUST call `ollama stop` on the outgoing role model (`OLLAMA_KEEP_ALIVE=-1`, nothing auto-unloads).
`OLLAMA_MAX_LOADED_MODELS` stays **2** — see Amendment #4; `=1` was retracted, not applied.

## Completed this session

- ADR-005 ratified, then hardened by three amendments across four independent runs.
- Planner evidence: **c12 `27b` 6/6** on the gold decision (medians 72, 72) vs **c13 `35b-mtp`
  3/12** (medians 66, 58, 66, 64). The pre-registered `precise` test failed its gate (1/3,
  median 64), so temperature was ruled out as the cause of c13's instability.
- Harness defect fixed: `SAMPLING` was silently ignored. Real `--sampling` override, validated
  against the harness's own preset table, recorded in every result JSON, 8 regression assertions.
- Embedder query latency 150.6 ms (not user-visible); input length **ruled out** as the cause of
  the ADR-004 A#2/A#7 12x discrepancy, which stays open.
- **Frontend scaffolded and the first-run wizard shipped** (Phase 0 exit item 4): five steps,
  25 unit tests, `tsc -b` clean. Step 2 computes its decision table from the real predicate rather
  than showing canned copy.
- **A specified authorization control was found to decide nothing** and fixed — ADR-006. The
  out-of-worktree stop's "elevate to at least MEDIUM" sat below standard `ConfirmRisky`'s HIGH
  threshold, so it would have shipped pausing on nothing new. Caught by a failing ordering test.
- **The frontend gate now renders in a real browser** — ADR-007. axe contrast, clipping, narrow
  viewport, and per-step screenshots; both assertions proven against forced defects, and the first
  clipping check was itself wrong and was caught by its own probe.
- Four self-corrections recorded this session: retracted comparability caveat; retracted
  ~3,500 MiB desktop premise in `bench/gold/arch.md`; incorrect cold-gate "wrong side of warmup"
  claim; and an ADR follow-up pre-registered without a command that could execute it.

## Exact next action

Phase 0 exit item 3 (baseline metrics report) is the **only** open item. The harness is built,
self-tested and committed; the run is operator work.

```bash
cd ~/dev/oh-gui && git pull
bash bench/baseline/seed_fixture.sh
bash scripts/provision-reference-checkout.sh --run-copy
cd ~/.oh-gui/reference/agent-canvas-run && npm ci && npm run dev
```

Point the stock app's settings at Ollama, select the ADR-005 pair, then in a second terminal:

```bash
cd ~/dev/oh-gui
export OH_GUI_BASELINE_STAMP=$(date +%Y%m%d_%H%M)
bash bench/baseline/run_baseline.sh t01     # ... through t08
python3 bench/baseline/report.py ~/.oh-gui/baseline/${OH_GUI_BASELINE_STAMP}_run \
  --out docs/BASELINE-METRICS-${OH_GUI_BASELINE_STAMP}.md
```

Then fill ADR-008's Verdict section from that report and move it Proposed → Ratified. Phase 0
closes at that point. `bench/baseline/README.md` documents the event keys.

**Prerequisite to check first:** the stock app needs `uv` on PATH (it starts its backend via
`uvx`). Node is already 24.16.0.
