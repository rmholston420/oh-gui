# Session Handoff

**Updated:** 2026-08-08 06:47 EDT
**Stage:** Phase 0 · local model selection · ADR-005 (OPEN)

## State

Path E round 1 (`20260808_0555`) is scored in full at
`bench/path_e/SCORING-20260808_0555.md`. **The verdict was withheld** — three confounds
meant the numbers did not answer the question ADR-005 asks. All three are now fixed in
the harness, which is committed and statically validated but **has not been run**.
Round 2 needs the GPU.

Two round-1 findings do stand and are recorded in ADR-005 so they are not re-litigated:
the Devstral contingency (criterion 8) did **not** fire (38 on `debug`, no Q6_K retest
owed), and the earlier "Ollama ignores the MTP head" conclusion is **retracted** — both
cells in run `20260531` had truncated at exactly 8,192 tokens, and untruncated the MTP
build leads the base 308.05 to 279.01 tok/s while also scoring higher (62 vs 57).

## Completed this session

- Scored round 1 against `bench/gold/`; wrote `SCORING-20260808_0555.md`.
- Closed two false alarms (a foreign GPU client on :11434 that was our own bench; LACT
  allegedly pinning fans at 0%). Run 0555 is uncontaminated.
- Added a real code-generation task: `bench/prompts/code.txt`, a 30-case stdlib
  `unittest` suite, a reference solution verified 30/30, and `score_code.py`.
- Added planner replicates (cells c12/c13, interleaved `REPS` loop).
- Replaced the fixed 45 C cold gate with `gpu_cold_calibrate` (idle floor + 3 C).
- Added `bench/validate_harness.py`; it caught two defects in code written this session
  (see DEBUG_LOG 06:44 and 06:45).
- Amended ADR-005 with round-1 results and criteria 9-12, fixed before round 2 runs.

## Next action — needs the operator and the GPU

Two runs, in this order. Each starts by unloading all models and calibrating the cold
gate against the measured idle floor, so **do not** preheat the card.

```bash
cd ~/dev/oh-gui && git pull

# 1. Planner replicates (~35-45 min). Interleaved c12,c13,c12,c13,c12,c13.
REPS=3 bash bench/path_e/run_path_e.sh c12_planner_arch_27b c13_planner_arch_35bmtp

# 2. Code-generation cells (~25-35 min).
bash bench/path_e/run_path_e.sh c08_code_ollama_qwen3coder30b c09_code_ollama_devstral \
     c10_code_ollama_qwen36_35bmtp c11_code_ollama_qwen36_27b

# 3. Machine-score the code cells (60 of 100 points, no judgement involved).
python3 bench/path_e/score_code.py ~/.oh-gui/bench_path_e/<STAMP>_run
```

Then paste the run directory listing and `score_code.py` output back. Remaining work:
judge the 40 non-machine code points and the three `arch` replicates against
`bench/gold/`, take the median per planner, fill ADR-005's Decision / Rationale /
Consequences, flip its status, and update `adrs/README.md`.

## Open questions

None awaiting an answer. Criteria 9-12 in ADR-005 were fixed before round 2 runs, so the
verdict is determined by the numbers once they exist.

## Definition of Done for this slice

ADR-005 ratified with a named planner model, a named coder model, an explicit answer on
whether the two roles collapse to one model, and the implied `OLLAMA_MAX_LOADED_MODELS`
and unload policy.

## Phase 0 exit — still blocked on

1. This bench (ADR-005).
2. Upstream artifact pins (agent-server digest, pip/npm versions).
3. Read-only stock Agent Canvas reference checkout.
4. First-run wizard stating the default trust-dial stop `ConfirmRisky()` in-UI.
