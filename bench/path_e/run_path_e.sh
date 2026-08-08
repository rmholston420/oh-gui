#!/usr/bin/env bash
# Path E driver - owns the thermal guard, the run directory, and model lifecycle.
#
# The Python harness runs ONE cell per invocation and knows nothing about the GPU. This
# script is where the mandatory instrumentation lives (bench/lib/gpu.sh), because that
# library is bash and shelling into it from Python would break the contract that every
# script invoking a local model monitors temperature inline.
#
#   bash bench/path_e/run_path_e.sh            # all cells
#   bash bench/path_e/run_path_e.sh c01_planner_ollama_qwen36_27b c06_coder_ollama_qwen3coder30b
#   bash bench/path_e/run_path_e.sh list       # print the matrix and exit
#
# Ollama runs with OLLAMA_KEEP_ALIVE=-1, so models NEVER auto-unload. Every cell therefore
# explicitly stops its model afterwards; otherwise cell 2 would run with cell 1 still
# resident and the second model would be squeezed or spilled to CPU.
set -euo pipefail
cd "$(dirname "$0")/../.."
source bench/lib/gpu.sh          # MANDATORY thermal instrumentation

HARNESS=bench/path_e/bench_path_e.py

if [[ "${1:-}" == "list" ]]; then exec python3 "$HARNESS" list; fi

STAMP=$(date +%Y%m%d_%H%M)
RUN_DIR="$HOME/.oh-gui/bench_path_e/${STAMP}_run"
mkdir -p "$RUN_DIR"

if [[ $# -gt 0 ]]; then
  CELLS=("$@")
else
  mapfile -t CELLS < <(python3 "$HARNESS" list | awk '{print $1}')
fi

# --- preflight ---------------------------------------------------------------
# Every one of these has already caused a wasted or invalid run in this project.
curl -sf "${OLLAMA_ENDPOINT:-http://localhost:11434}/api/version" >/dev/null \
  || { echo "FATAL: ollama is not responding" >&2; exit 1; }

CAP=$(nvidia-smi --query-gpu=power.limit --format=csv,noheader,nounits | cut -d. -f1)
if [[ "$CAP" != "435" ]]; then
  echo "FATAL: power cap is ${CAP} W, expected 435 W." >&2
  echo "  A/B validity requires an identical cap across every cell, and 600 W was" >&2
  echo "  measured at 82 C peak with thermal throttling (BUILD_LOG 2026-08-08 08:20)." >&2
  echo "  LACT owns this setting: check power_cap in /etc/lact/config.yaml, then" >&2
  echo "  sudo systemctl restart lactd" >&2
  exit 1
fi
export BENCH_POWER_CAP_W="$CAP"

# The bench must not be measuring the desktop. 2-3 GB of browser changes which cells fit.
IDLE_MIB=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
if [[ "$IDLE_MIB" -gt 2000 ]]; then
  echo "WARNING: ${IDLE_MIB} MiB of VRAM is already in use before any model loads." >&2
  echo "  Close the browser and any GPU-accelerated apps - at 131072 context the" >&2
  echo "  planner cells need nearly all of the card." >&2
  read -r -p "  Continue anyway? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || exit 1
fi

# Verify every model tag exists BEFORE running anything. Discovering a missing tag at
# cell 7 wastes the preceding twenty minutes and leaves a partial matrix that cannot be
# compared, since cells must share thermal conditions to be comparable.
MISSING=()
for cell in "${CELLS[@]}"; do
  tag=$(python3 "$HARNESS" list | awk -v c="$cell" '$1==c{print $NF}')
  [[ -n "$tag" ]] || { echo "FATAL: unknown cell '$cell'" >&2; exit 1; }
  ollama list | awk '{print $1}' | grep -qxF "$tag" || MISSING+=("$tag")
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  printf 'FATAL: model tag not present locally: %s\n' "${MISSING[@]}" >&2
  echo "  Pull them first, then re-run." >&2
  exit 1
fi

echo "run dir: $RUN_DIR"
echo "cells:   ${#CELLS[@]}"
echo "cap:     ${CAP} W   idle VRAM: ${IDLE_MIB} MiB"
gpu_guard
gpu_watch_start "$HOME/.oh-gui/thermal/${STAMP}_path_e.csv"

FAILED=()
for cell in "${CELLS[@]}"; do
  # The watcher signals the parent on a thermal breach, but a breach detected between
  # cells must also stop the matrix. Not checking this is exactly the defect that let a
  # cutout announce itself and then run the next cell anyway (DEBUG_LOG 2026-08-08 06:55).
  if gpu_aborted; then
    echo "ABORTING matrix: thermal cutout already tripped." >&2
    break
  fi

  echo
  echo "================ $cell ================"
  if python3 "$HARNESS" "$cell" --out "$RUN_DIR"; then :; else
    echo "cell FAILED: $cell" >&2
    FAILED+=("$cell")
  fi

  # Unload everything before the next cell. KEEP_ALIVE=-1 means nothing expires on its own.
  gpu_unload_all
  # Let VRAM actually free and the card shed heat before the next load. Role switches were
  # measured at 2.8-6.9 s; this is deliberately longer so cells start from a similar
  # thermal state rather than inheriting the previous cell's heat soak.
  sleep 20
done

gpu_watch_stop

echo
echo "== run complete =="
echo "results: $RUN_DIR"
ls -1 "$RUN_DIR" 2>/dev/null || true
[[ ${#FAILED[@]} -gt 0 ]] && { echo "FAILED cells: ${FAILED[*]}"; exit 1; }

echo
echo "Next: dump the outputs for scoring against bench/gold/"
echo "  bash bench/path_e/dump_for_scoring.sh $RUN_DIR"
exit 0
