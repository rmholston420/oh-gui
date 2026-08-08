# SESSION_HANDOFF

Overwritten 2026-08-08 08:40 EDT.

## Stage in progress

Phase 0 baseline. Path E model selection **closed** (ADR-005 Ratified, Amendments #1 and #2).

## Completed this session

- ADR-005 ratified: planner `qwen3.6:27b` @131,072 `planner` preset; coder
  `qwen3.6:35b-a3b-mtp-q4_K_M` @131,072 `precise` preset. Roles do NOT collapse.
- Amendment #1: out-of-sample replication (run `0804`).
- Amendment #2: third replicate set (run `0824`). **Combined c13 2/9 vs c12 6/6** on the gold
  decision. Nine draws per cell now support the verdict.
- **Harness defect fixed:** `SAMPLING` was silently ignored. Now a real `--sampling` override,
  validated against the harness's own preset table, recorded in every result JSON, with 8
  regression assertions in `bench/tests/test_sampling_override.sh`.
- Embedder query latency measured: 150.6 ms query band, not user-visible. Input length **ruled
  out** as the cause of the A#2/A#7 12x discrepancy.
- Three self-corrections recorded: the retracted comparability caveat, the retracted ~3,500 MiB
  desktop premise in `bench/gold/arch.md`, and the incorrect cold-gate "wrong side of warmup"
  claim.

## Exact next action

    cd ~/dev/oh-gui && git pull && bash bench/tests/test_sampling_override.sh

Then the pre-registered test, which NOW actually applies the preset:

    REPS=3 SAMPLING=precise bash bench/path_e/run_path_e.sh c13_planner_arch_35bmtp

Verify the banner prints `SAMPLING OVERRIDE: preset=precise` and `preset=precise` before
trusting the output. **Binding gate: Option C 3/3 AND median > 75 reopens the planner slot.**
Anything less and `27b` keeps it.

## Remaining before Phase 0 Definition of Done

1. **Apply `OLLAMA_MAX_LOADED_MODELS` 2 -> 1** (ADR-005 consequence, still unapplied). Must
   change `bench/lib/ollama_env.sh` **and** `ollama_guard`'s expected value in the SAME commit,
   or every preflight fails.
2. Upstream artifact pins — agent-server digest, pip/npm versions (ADR-001,
   `docs/specs/02-repo-setup.md` item 1).
3. Read-only stock Agent Canvas reference checkout (`docs/specs/03-layout.md` §3.0.1).
4. First-run wizard stating the default trust-dial stop `ConfirmRisky()` in-UI (§3.4).

## Open

- Pre-registered c13 `precise` test — command now works, still unrun.
- The security-analyzer architecture is **NOT decided**. `bench/gold/arch.md` is a scoring
  rubric, not an ADR. Option C + CPU second stage needs its own ADR before any code is written.
  Note run `0824` rep 3 (Option C, 79 pts) is the best available draft of that interface.
- KNOWN_ISSUES: A#2/A#7 embedder discrepancy (length ruled out, cause unknown); arch.txt's
  retracted desktop figure (deliberately unedited, preserves cross-run comparability); 262,144
  envelope unmeasured; 450 W vs 435 W anomaly (run `0824` peaked 197 W, so still unexplained).
