#!/usr/bin/env bash
# Phase 0 baseline matrix — 2 models x 8 tasks, sequential, fully instrumented.
#
# Sequential is not a preference. 26,140 MiB + 26,390 MiB exceeds the card's 32,607 MiB, so the
# two models cannot be resident together; the outgoing one is stopped before the next is used.
# OLLAMA_KEEP_ALIVE=-1 means nothing unloads on its own.
#
# Per cell: run_baseline.sh applies the GPU guard and cold wait, samples thermals at 1 Hz and
# `ollama ps` every 5 s, records server_info, then drive_task.mjs restores the fixture from its
# seed commit, selects the profile, submits the card verbatim and runs to idle.
#
# Usage: bash bench/baseline/run_matrix.sh [t01 t02 ...]
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILES="${OH_GUI_BASELINE_PROFILES:-qwen3.6-27b,qwen3.6-35b-a3b-mtp-q4_K_M}"
TASKS=("$@"); [ ${#TASKS[@]} -eq 0 ] && TASKS=(t01 t02 t03 t04 t05 t06 t07 t08)
STAMP="$(date +%Y%m%d_%H%M)"

echo "matrix: ${PROFILES//,/ + } x ${TASKS[*]}"
echo "stamp:  $STAMP"
echo

IFS=',' read -ra PLIST <<< "$PROFILES"
for profile in "${PLIST[@]}"; do
  # Free the card before this model's block. Every model, not just the ones we think are loaded.
  for m in $(ollama ps 2>/dev/null | tail -n +2 | awk '{print $1}'); do
    echo "  ollama stop $m"; ollama stop "$m" >/dev/null 2>&1 || true
  done
  sleep 5

  export OH_GUI_BASELINE_STAMP="${STAMP}_${profile}"
  echo "=============================================================================="
  echo "  MODEL BLOCK: $profile   ->  ~/.oh-gui/baseline/${OH_GUI_BASELINE_STAMP}_run"
  echo "=============================================================================="
  for task in "${TASKS[@]}"; do
    echo
    echo "--- $profile / $task ---"
    bash "$HERE/run_baseline.sh" "$task" --auto --profile "$profile" \
      || echo "  (cell failed; continuing — one bad cell must not cost the other fifteen)"
  done

  # Report for THIS block now, not after both. The first matrix produced no report at all because
  # the reporter crashed after all 16 cells had already run.
  d="$HOME/.oh-gui/baseline/${STAMP}_${profile}_run"
  out="$HERE/../../docs/BASELINE-METRICS-${STAMP}-${profile}.md"
  python3 "$HERE/report.py" "$d" --out "$out" && echo "  report: $out" \
    || echo "  REPORT FAILED for $profile — raw JSON is intact in $d"
done

echo
echo "=============================================================================="
echo "  accepted cells per model"
for profile in "${PLIST[@]}"; do
  python3 "$HERE/accepted_summary.py" "$HOME/.oh-gui/baseline/${STAMP}_${profile}_run" "$profile"
done
