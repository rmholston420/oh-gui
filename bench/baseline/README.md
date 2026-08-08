# Phase 0 Baseline Metrics Harness

Satisfies `docs/specs/02-repo-setup.md` items 5, 6 and 7 — the last open Phase 0 exit item.

## What this is, and what it deliberately is not

Item 5 asks for time-to-first-review, turns-to-acceptance, **lines accepted without inspection**,
**"lost track" incidents**, and GPU temperature/power, across 5-10 representative coding tasks run
through the **unmodified** app. Item 6 adds turns-before-first-corrective-instruction and whether
it was encoded durably.

Only the GPU figures and the line counts can be measured by a machine. "Lost track" is a state of
the operator's mind. "Accepted without inspection" is a fact about whether a person read a diff.
An automated benchmark cannot produce either, and one that pretended to would produce a Phase 0
number that Phase 1 gets compared against — a fabricated baseline is worse than none.

So this harness is a stopwatch and a notebook. **You drive the stock app by hand.** It timestamps
what you mark, counts accepted lines from `git` rather than from memory, samples the GPU at 1 Hz
with the standard cutout, and records which model Ollama actually had resident.

## Run it

```bash
# once
bash bench/baseline/seed_fixture.sh
bash scripts/provision-reference-checkout.sh --run-copy
cd ~/.oh-gui/reference/agent-canvas-run && npm ci && npm run dev   # stock app, own backend
```

### Colossus port deviation (permanent)

The stock app defaults to ingress `8000` and vite `3001`. On Colossus both are permanently taken —
`8000` by the Kosmos uvicorn dev server, `3001` by gitea (system service, wildcard bind). Neither is
disposable, so the baseline runs shifted:

```bash
VITE_WORKING_DIR=${OH_GUI_BASELINE_FIXTURE:-$HOME/oh-gui-baseline/fixture} \
  PORT=8010 OH_CANVAS_SAFE_VITE_PORT=3011 npm run dev
```

`VITE_WORKING_DIR` is **not optional**. Without it the app works in
`~/.openhands/agent-canvas/workspaces` (`dev-safe.mjs:672`), the fixture is never touched, and every
accepted-line count is zero — a baseline of zeros that looks like data. The recorder shouts if an
accept changes nothing, but setting the variable is what prevents it. The variable is baked into the
frontend at startup, so it must be set when the app is launched, not after.

Open the **ingress** port (8010) in the browser, not the vite port. Variable names read from
`scripts/dev-with-automation.mjs` at the pinned SHA. This is a configuration deviation from stock
and nothing more — no app code is modified — but it is recorded here and in ADR-008 because a
baseline whose run conditions are undocumented cannot be re-run. The automation service hardcodes
`localhost:3001` in its CORS origin list; harmless here, because the browser talks to ingress, and
the ingress port is added to that list dynamically.

In the stock app's settings, point it at Ollama and select the ADR-005 pair. Do not record the
model by hand — the harness reads what is actually resident.

```bash
# per task, in a second terminal
export OH_GUI_BASELINE_STAMP=$(date +%Y%m%d_%H%M)   # same stamp for all tasks in a sitting
bash bench/baseline/run_baseline.sh t01
# ... t02 ... t08

python3 bench/baseline/report.py ~/.oh-gui/baseline/${OH_GUI_BASELINE_STAMP}_run \
  --out docs/BASELINE-METRICS-${OH_GUI_BASELINE_STAMP}.md
```

Give the agent each task card's text **verbatim**. Paraphrasing makes the tasks
non-reproducible, and reproducibility is the only reason the fixture exists.

## Marking events

| Key | Meaning |
|---|---|
| `t` | you sent the agent an instruction |
| `r` | first review — the agent's first proposal is on screen |
| `a` | you accepted a change; asks whether you read the diff |
| `l` | you lost track of what it was doing |
| `c` | you gave a corrective instruction (how it works, not what to do) |
| `x` | tool-call failure: malformed, abandonment, or circular retry |
| `n` | free-text note |
| `d` / `q` | done / abandon |

Mark `a` honestly. A run where you claim to have read everything is a run that measures nothing.

## Files

- `seed_fixture.sh` — recreates the `notes-api` fixture byte-identically
- `tasks/t01..t08` — eight task cards, additive → behavioral → refactor → cross-cutting
- `run_baseline.sh` — thermal guard, GPU + `ollama ps` samplers, launches the recorder
- `mark.py` — event recorder; git-measured line counts
- `report.py` — aggregates a run directory into the markdown report
- `tests/` — 10 tests pinning the arithmetic and the thermal parsing

## Thermal

`bench/lib/gpu.sh` as everywhere else: 83 °C hard ceiling, 80 °C warning, 45 °C cold gate,
1 Hz sampling, automatic model unload and abort on breach. The app runs the model rather than this
script, which changes nothing about the card.
