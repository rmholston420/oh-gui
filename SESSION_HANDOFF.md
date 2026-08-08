# SESSION_HANDOFF

Overwritten 2026-08-08 08:31 EDT.

## Stage in progress

Phase 0 baseline. Path E model selection **closed** — ADR-005 Ratified, then hardened by
Amendment #1 (out-of-sample replication).

## Completed this session

- ADR-005 ratified: planner `qwen3.6:27b` @131,072 `planner` preset; coder
  `qwen3.6:35b-a3b-mtp-q4_K_M` @131,072 `precise` preset. Roles do NOT collapse.
- ADR-004 Amendment #8 closes A#3's reopened planner question.
- KNOWN_ISSUES.md created (3 entries).
- ADR-005 Amendment #1: replication run `20260808_0804`. Combined c12 6/6 vs c13 1/6 on the
  gold decision. Medians c12 72/72, c13 66/58.
- Two self-corrections recorded: the retracted comparability caveat (run predated the commit it
  warned about), and the retracted ~3,500 MiB desktop premise inside `bench/gold/arch.md`.

## THE OPERATOR MUST RUN THIS FIRST

    cd ~/dev/oh-gui && git pull

Their clone is at `49a70c0`. `main` is 8 commits ahead. This is why
`bench/oneoff/embed_query_latency.sh` reported `No such file or directory` — the script exists
only from `01c2f56` onward. It is not a bug.

## Remaining before Phase 0 Definition of Done

1. **Apply `OLLAMA_MAX_LOADED_MODELS` 2 -> 1** (ADR-005 consequence, still unapplied). Must
   change `bench/lib/ollama_env.sh` **and** `ollama_guard`'s expected value in the SAME commit,
   or every preflight fails.
2. Upstream artifact pins — agent-server digest, pip/npm versions (ADR-001,
   `docs/specs/02-repo-setup.md` item 1).
3. Read-only stock Agent Canvas reference checkout (`docs/specs/03-layout.md` §3.0.1).
4. First-run wizard stating the default trust-dial stop `ConfirmRisky()` in-UI (§3.4).

## Open / unrun

- `NUM_CTX=2048 bash bench/oneoff/embed_query_latency.sh` — never yet executed. Run after pull.
- Pre-registered c13 `precise` (temp 0.6) `arch` test, `REPS=3`. Binding: Option C 3/3 **and**
  median > 75 reopens the planner slot.
- The security-analyzer architecture is **NOT decided**. `bench/gold/arch.md` is a scoring
  rubric, not an ADR. Option C + CPU second stage needs its own ADR before any code is written.
- KNOWN_ISSUES: arch.txt still carries the retracted desktop figure (deliberately unedited to
  preserve cross-run comparability); 262,144 envelope unmeasured; 450 W vs 435 W cap anomaly
  now less likely to be a telemetry artifact.
- ADR-004 A#2's absolute embedder throughput (13.7 chunks/s) conflicts ~12x with A#7's
  1.09 chunks/s. Unresolved. A#2's *ranking* stands.

## Exact next action

`git pull`, then `NUM_CTX=2048 bash bench/oneoff/embed_query_latency.sh`.
