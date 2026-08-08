# Known Issues — OH-GUI

Append-only. Each entry: symptom, scope, status, and the condition that closes it.

## 2026-08-08 08:15 EDT — `bench/prompts/arch.txt` states a retracted desktop-VRAM figure

**Symptom:** the prompt tells the model "Desktop idle consumes 650-850 MiB of VRAM and will
rise by 2-3 GB once a browser and the OH-GUI frontend are running." The 2–3 GB rise is
**not supported by measurement.** Idle VRAM recorded immediately before load, with the
operator's normal desktop and browser running: 657 MiB (`20260808_0531`), 666 MiB
(`20260808_0545`), 675 MiB (`20260808_0738`). ADR-004 A#6 retracts the ~3,500 MiB figure.

**Scope:** `bench/prompts/arch.txt`, `bench/gold/arch.md` (corrected in place), Path E
rounds 1 and 2 `arch` scoring.

**Impact on results: none.** All cells in a round receive the identical prompt, so the
premise error is common-mode and relative ranking is unaffected. ADR-005's planner verdict
stands.

**Deliberately NOT fixed:** editing the prompt would break comparability with rounds 1 and 2,
whose scores are already recorded. 

**Closes when:** a round 3 `arch` prompt is authored with the measured figure, at which point
round 3 scores must not be compared directly against rounds 1–2 without noting the change.

## 2026-08-08 08:15 EDT — 262,144 context remains unmeasured

**Symptom:** no cell has ever run at 262,144. A#5 declared it unusable from the retracted
3,500 MiB figure; A#6 retracted that reasoning without re-ratifying the context.

**Status:** working ceiling stays **131,072** because that is the value Path E actually
exercised — not because 262,144 was shown to fail.

**Closes when:** a cell runs at 262,144 with the desktop under interactive load and idle
VRAM recorded at start and peak.

## 2026-08-08 08:15 EDT — power sampled at 450 W against a 435 W cap

**Symptom:** run `20260808_0738` reported `power max 450W` with 102 power-capped samples;
`20260808_0705` peaked at 437 W. LACT cap is 435 W (`/etc/lact/config.yaml`).

**Hypothesis, not established:** telemetry sampling above the enforcement averaging window
rather than a genuine cap breach. No causal claim enters an artifact until executed.

**Impact:** none observed. 0 thermally throttled samples in both runs; peak temp 72 C.

**Closes when:** a sampling run at fixed load compares `nvidia-smi` instantaneous power
against the LACT enforcement window, or the cap is confirmed to be advisory for transients.
