# SESSION_HANDOFF

Overwritten 2026-08-08 08:48 EDT.

## Stage in progress

Phase 0 baseline. **Path E model selection is CLOSED** — ADR-005 Ratified, Amendments #1, #2, #3.
No further planner or coder benching is warranted.

## Final selection (ADR-005)

| Role | Model | ctx | Preset | Think | num_predict |
|---|---|---:|---|---|---:|
| Planner | `qwen3.6:27b` | 131,072 | `planner` 1.0/0.95/20 | on | 16,384 |
| Coder | `qwen3.6:35b-a3b-mtp-q4_K_M` | 131,072 | `precise` 0.6/0.95/20 | on | 16,384 |

Roles do NOT collapse. `OLLAMA_MAX_LOADED_MODELS=1` required (26,140 + 26,390 = 52,530 MiB vs a
32,607 MiB card).

## Completed this session

- ADR-005 ratified, then hardened by three amendments across four independent runs.
- Planner evidence: **c12 `27b` 6/6** on the gold decision (medians 72, 72) vs **c13 `35b-mtp`
  3/12** (medians 66, 58, 66, 64). The pre-registered `precise` test failed its gate (1/3,
  median 64), so temperature was ruled out as the cause of c13's instability.
- Harness defect fixed: `SAMPLING` was silently ignored. Real `--sampling` override, validated
  against the harness's own preset table, recorded in every result JSON, 8 regression assertions.
- Embedder query latency 150.6 ms (not user-visible); input length **ruled out** as the cause of
  the ADR-004 A#2/A#7 12x discrepancy, which stays open.
- Four self-corrections recorded this session: retracted comparability caveat; retracted
  ~3,500 MiB desktop premise in `bench/gold/arch.md`; incorrect cold-gate "wrong side of warmup"
  claim; and an ADR follow-up pre-registered without a command that could execute it.

## Exact next action — the last ADR-005 consequence

Apply `OLLAMA_MAX_LOADED_MODELS` 2 -> 1. **`bench/lib/ollama_env.sh` and `ollama_guard`'s
expected value must change in the SAME commit, or every preflight fails.** The live systemd user
unit must change too, or the guard will correctly reject the running server. Not yet started —
inspect both files before editing.

## Remaining before Phase 0 Definition of Done

1. `OLLAMA_MAX_LOADED_MODELS` 2 -> 1 (above).
2. Upstream artifact pins — agent-server digest, pip/npm versions (ADR-001,
   `docs/specs/02-repo-setup.md` item 1).
3. Read-only stock Agent Canvas reference checkout (`docs/specs/03-layout.md` §3.0.1).
4. First-run wizard stating the default trust-dial stop `ConfirmRisky()` in-UI (§3.4).

## Open

- **Security-analyzer architecture is NOT decided.** `bench/gold/arch.md` is a scoring rubric, not
  an ADR. Option C plus a CPU second stage needs its own ADR before any code is written. Best
  available port drafts: run `0824` rep 3 (frozen dataclasses, `ActionType` incl. `TEXT_INGEST`,
  `TaintTag` with propagation rules) and run `0836` rep 1 (`ActionDisposition` separated from risk
  level, `analyze_action` + `analyze_text`).
- KNOWN_ISSUES: A#2/A#7 embedder discrepancy (length ruled out, cause unknown); arch.txt's
  retracted desktop figure (deliberately unedited to preserve cross-run comparability); 262,144
  envelope unmeasured; 450 W vs 435 W anomaly (runs `0824` and `0836` peaked 197 W and 193 W, so
  still unexplained).
