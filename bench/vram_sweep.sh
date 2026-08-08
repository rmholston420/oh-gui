#!/usr/bin/env bash
# VRAM context sweep for OH-GUI Phase 0 baseline (Colossus, RTX 5090 32607 MiB).
# Determines the largest num_ctx that stays 100% GPU for each candidate model,
# with and without q8_0 KV-cache quantization.
#
# Usage:
#   bash bench/vram_sweep.sh            # fp16 KV (Ollama default)
#   bash bench/vram_sweep.sh q8         # q8_0 KV (restarts Ollama with env vars)
set -uo pipefail

MODELS=("qwen3.6:27b" "qwen3-coder:30b")
CTXS=(32768 65536 131072 262144)
MODE="${1:-fp16}"
OUT="$HOME/.oh-gui/vram_sweep"
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d_%H%M)
CSV="$OUT/${STAMP}_${MODE}.csv"

total=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)

if [[ "$MODE" == "q8" ]]; then
  echo "# restarting Ollama with flash attention + q8_0 KV cache"
  sudo systemctl set-environment OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 2>/dev/null || true
  sudo systemctl restart ollama 2>/dev/null || {
    pkill -x ollama; sleep 2
    OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 nohup ollama serve >/tmp/ollama.log 2>&1 &
  }
  sleep 6
fi

# idle baseline AFTER any restart, with nothing loaded
for m in "${MODELS[@]}"; do ollama stop "$m" >/dev/null 2>&1; done
sleep 3
idle=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
echo "gpu_total_mib=$total  idle_used_mib=$idle  mode=$MODE"
echo "model,ctx,ollama_size,processor,vram_used_mib,vram_free_mib,model_cost_mib,status" > "$CSV"

for m in "${MODELS[@]}"; do
  for ctx in "${CTXS[@]}"; do
    ollama stop "$m" >/dev/null 2>&1; sleep 2

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

    ollama stop "$m" >/dev/null 2>&1
    [[ "$status" != "OK" ]] && { echo "   -> stopping sweep for $m, larger contexts will also spill"; break; }
  done
done

# co-residency: largest passing ctx for the planner + the embedding model
echo
echo "== embedding co-residency check =="
ollama stop qwen3.6:27b >/dev/null 2>&1; sleep 2
curl -s -X POST http://localhost:11434/api/embed \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen3-embedding:0.6b","input":"warmup","keep_alive":"2m"}' >/dev/null
embed_used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
echo "embedding resident: used=${embed_used} MiB (cost $(( embed_used - idle )) MiB)"
ollama ps

echo
echo "CSV: $CSV"
[[ "$MODE" == "q8" ]] && echo "NOTE: Ollama is still running with q8_0 KV. To revert:
  sudo systemctl unset-environment OLLAMA_FLASH_ATTENTION OLLAMA_KV_CACHE_TYPE && sudo systemctl restart ollama"
