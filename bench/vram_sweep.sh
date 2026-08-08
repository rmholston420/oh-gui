#!/usr/bin/env bash
# VRAM context sweep for OH-GUI Phase 0 baseline (Colossus, RTX 5090 32607 MiB).
# Determines the largest num_ctx that stays 100% GPU for each candidate model,
# with and without q8_0 KV-cache quantization.
#
# Usage:
#   bash bench/vram_sweep.sh            # fp16 KV (Ollama default)
#   bash bench/vram_sweep.sh q8         # q8_0 KV (restarts Ollama with env vars)
set -uo pipefail

# qwen3.6:35b == qwen3.6:35b-a3b (same digest 07d35212591f): MoE, 3B active, 24 GB.
# 7 GB more weight than 27b but far fewer active params -> expect faster gen, worse KV.
MODELS=("qwen3.6:27b" "qwen3.6:35b" "qwen3.6:35b-a3b-mtp-q4_K_M" "qwen3-coder:30b")
CTXS=(32768 65536 131072 262144)
MODE="${1:-fp16}"
OUT="$HOME/.oh-gui/vram_sweep"
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d_%H%M)
CSV="$OUT/${STAMP}_${MODE}.csv"

total=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)

# v2: this script no longer changes server env. Run bench/ollama_env.sh first and
# confirm it reported the setting as active. MODE is a label for the output file only.
echo "# mode label: $MODE (server env is whatever bench/ollama_env.sh last applied)"
systemctl show ollama --property=Environment 2>/dev/null | tr ' ' '\n' | grep -i "KV_CACHE\|FLASH" || true

# idle baseline: unload EVERY resident model, not just the sweep candidates.
# (v2 fix: the embedding model stayed loaded in v1 and contaminated the q8 baseline.)
unload_all() {
  curl -s http://localhost:11434/api/ps \
    | python3 -c 'import sys,json;[print(m["name"]) for m in json.load(sys.stdin).get("models",[])]' 2>/dev/null \
    | while read -r n; do [ -n "$n" ] && ollama stop "$n" >/dev/null 2>&1; done
}
unload_all
sleep 3
resident=$(curl -s http://localhost:11434/api/ps | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("models",[])))' 2>/dev/null || echo "?")
if [ "$resident" != "0" ]; then
  echo "ABORT: $resident model(s) still resident; idle baseline would be wrong." >&2
  ollama ps >&2; exit 1
fi
idle=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
echo "gpu_total_mib=$total  idle_used_mib=$idle  mode=$MODE"
echo "model,ctx,ollama_size,processor,vram_used_mib,vram_free_mib,model_cost_mib,status" > "$CSV"

for m in "${MODELS[@]}"; do
  for ctx in "${CTXS[@]}"; do
    unload_all; sleep 2

    body=$(printf '{"model":"%s","prompt":"hi","stream":false,"keep_alive":"2m","options":{"num_ctx":%d,"num_predict":1}}' "$m" "$ctx")
    err=$(curl -s -m 600 -X POST http://localhost:11434/api/generate \
            -H 'Content-Type: application/json' -d "$body" \
          | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("error",""))' 2>/dev/null)

    if [[ -n "$err" ]]; then
      echo "$m,$ctx,-,-,-,-,-,LOAD_ERROR" >> "$CSV"
      printf '%-18s %7d  LOAD ERROR: %s\n' "$m" "$ctx" "${err:0:80}"
      continue
    fi

    line=$(ollama ps | awk -v M="$m" '$1==M {print}')
    size=$(echo "$line" | awk '{print $3" "$4}')
    proc=$(echo "$line" | grep -oE '[0-9]+% (GPU|CPU)[^ ]*' | head -1)
    [[ -z "$proc" ]] && proc=$(echo "$line" | grep -oE '[0-9]+%/[0-9]+% CPU/GPU' | head -1)
    used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
    free=$(( total - used ))
    cost=$(( used - idle ))

    if [[ "$proc" == "100% GPU" ]]; then status=OK; else status=SPILLED; fi
    echo "$m,$ctx,$size,$proc,$used,$free,$cost,$status" >> "$CSV"
    printf '%-18s %7d  size=%-8s %-16s used=%6s free=%6s  %s\n' "$m" "$ctx" "$size" "$proc" "$used" "$free" "$status"

    unload_all
    [[ "$status" != "OK" ]] && { echo "   -> stopping sweep for $m, larger contexts will also spill"; break; }
  done
done

# co-residency: largest passing ctx for the planner + the embedding model
echo
echo "== embedding footprint vs num_ctx =="
echo "(v1 loaded this at the 32768 default and it cost 6110 MiB for a 639 MB model)"
echo "embed_ctx,ollama_size,vram_used_mib,cost_mib" > "$OUT/${STAMP}_${MODE}_embed.csv"
for ectx in 512 2048 8192 32768; do
  unload_all; sleep 2
  curl -s -X POST http://localhost:11434/api/embed -H 'Content-Type: application/json' \
    -d "{\"model\":\"qwen3-embedding:0.6b\",\"input\":\"warmup\",\"keep_alive\":\"2m\",\"options\":{\"num_ctx\":$ectx}}" >/dev/null
  eu=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
  es=$(ollama ps | awk '/qwen3-embedding/ {print $3" "$4}')
  printf '  num_ctx=%-6s size=%-8s used=%6s  cost=%6s MiB\n' "$ectx" "$es" "$eu" "$(( eu - idle ))"
  echo "$ectx,$es,$eu,$(( eu - idle ))" >> "$OUT/${STAMP}_${MODE}_embed.csv"
done
unload_all

echo
echo "CSV: $CSV"
echo "Embed CSV: $OUT/${STAMP}_${MODE}_embed.csv"
echo "Revert server env with: bash bench/ollama_env.sh f16"
