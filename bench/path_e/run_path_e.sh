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
#   REPS=3 bash bench/path_e/run_path_e.sh c12_planner_arch_27b c13_planner_arch_35bmtp
#     Runs each named cell REPS times, interleaved (r1 of every cell, then r2, ...) rather
#     than back to back. Interleaving matters: three consecutive runs of one model share
#     that model's heat soak and its resident weights, so a block design would confound
#     replicate variance with position in the run. Results land in <cell>_r<N>.json.
#
# Ollama runs with OLLAMA_KEEP_ALIVE=-1, so models NEVER auto-unload. Every cell therefore
# explicitly stops its model afterwards; otherwise cell 2 would run with cell 1 still
# resident and the second model would be squeezed or spilled to CPU.
set -euo pipefail
cd "$(dirname "$0")/../.."
source bench/lib/gpu.sh          # MANDATORY thermal instrumentation
source bench/lib/ollama.sh       # MANDATORY server identity + configuration guard

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

REPS="${REPS:-1}"
[[ "$REPS" =~ ^[1-9][0-9]*$ ]] || { echo "FATAL: REPS must be a positive integer" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
# Every one of these has already caused a wasted or invalid run in this project.
curl -sf "${OLLAMA_ENDPOINT:-http://localhost:11434}/api/version" >/dev/null \
  || { echo "FATAL: ollama is not responding" >&2; exit 1; }

# Responding is NOT the same as being the right server, correctly configured, reading the
# right store. On 2026-08-08 a stray user-unit ollama answered every request for five hours
# while ollama.service crash-looped 1260 times unable to bind; /api/version was healthy
# throughout and three runs were silently invalidated. The guard writes the serving
# process's real OLLAMA_* environment into the run directory, so every result set carries
# the configuration it actually ran under instead of the one it was assumed to run under.
ollama_guard "$RUN_DIR/ollama_provenance.txt" || exit 1
mapfile -t MATRIX_MODELS < <(python3 "$HARNESS" models)
ollama_require_models "${MATRIX_MODELS[@]}" || exit 1

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

# Record idle VRAM. The operator uses this machine interactively DURING the bench - the
# browser is how they talk to the scoring model - so closing it is not an option and this
# is NOT a gate. It is recorded so a cell that fails to fit can be explained afterwards.
# Measured idle with the normal working desktop up: 657-666 MiB (runs 0531, 0545).
IDLE_MIB=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
if [[ "$IDLE_MIB" -gt 4000 ]]; then
  echo "NOTE: ${IDLE_MIB} MiB of VRAM already in use - unusually high for this desktop." >&2
  echo "  The 131072-context planner cells need ~26.4 GB; if one fails to load, this is why." >&2
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
echo "cells:   ${#CELLS[@]}   reps: ${REPS}   total: $(( ${#CELLS[@]} * REPS ))"
echo "cap:     ${CAP} W   idle VRAM: ${IDLE_MIB} MiB"
gpu_guard

# Unload BEFORE the first cell, not only between cells. With OLLAMA_KEEP_ALIVE=-1 an
# interrupted earlier run leaves its models resident forever: run 20260808_0555 began with
# 26,196 MiB already allocated from the aborted 0545 run, so c01 reported a 0.56 s
# warmup/load against 4-6 s for every other cell. Decode and prefill were unaffected
# (both are measured after warmup), but the load figure was meaningless and the first cell
# had less free VRAM than the matrix assumed.
echo "unloading any resident models before cell 1 ..."
gpu_unload_all
sleep 5
RESIDENT=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
echo "  VRAM after unload: ${RESIDENT} MiB (idle baseline was ${IDLE_MIB} MiB)"
if [[ "$RESIDENT" -gt 4000 ]]; then
  echo "WARNING: ${RESIDENT} MiB still resident after unloading every model Ollama lists." >&2
  echo "  Something outside Ollama holds VRAM. The planner cells need ~26.4 GB." >&2
  echo "  Check: nvidia-smi --query-compute-apps=pid,used_memory --format=csv" >&2
fi

# Measure the idle floor and set the cold gate relative to it. Must run AFTER the unload
# above, or the floor would be measured on a card still holding a previous run's heat.
gpu_cold_calibrate || true

# Every cell must start from the same thermal state, including the first one. A 34 C start
# after an earlier probe is residual heat, not a cold card.
gpu_cool_wait || true
gpu_watch_start "$HOME/.oh-gui/thermal/${STAMP}_path_e.csv"

# Interleaved replicate order: r1 of every cell, then r2 of every cell, and so on.
QUEUE=()
for ((rep=1; rep<=REPS; rep++)); do
  for cell in "${CELLS[@]}"; do QUEUE+=("${cell}:${rep}"); done
done

FAILED=()
for item in "${QUEUE[@]}"; do
  cell="${item%:*}"; rep="${item##*:}"
  if [[ "$REPS" -gt 1 ]]; then
    REP_ARGS=(--rep "$rep"); label="${cell} (rep ${rep}/${REPS})"
  else
    REP_ARGS=(); label="$cell"
  fi
  # The watcher signals the parent on a thermal breach, but a breach detected between
  # cells must also stop the matrix. Not checking this is exactly the defect that let a
  # cutout announce itself and then run the next cell anyway (DEBUG_LOG 2026-08-08 06:55).
  if gpu_aborted; then
    echo "ABORTING matrix: thermal cutout already tripped." >&2
    break
  fi

  echo
  echo "================ $label ================"
  if python3 "$HARNESS" "$cell" --out "$RUN_DIR" "${REP_ARGS[@]}"; then :; else
    echo "cell FAILED: $label" >&2
    FAILED+=("$label")
  fi

  # Unload everything before the next cell. KEEP_ALIVE=-1 means nothing expires on its own.
  gpu_unload_all
  # Let VRAM actually free, then wait for the card to be genuinely cold again rather than
  # sleeping a guessed interval. A fixed sleep does not know how hot the last cell got, so
  # a long planner cell would hand its heat soak to whatever ran next.
  sleep 5
  gpu_cool_wait || true
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
