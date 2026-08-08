#!/usr/bin/env bash
# Validate the two production VRAM configs co-resident with the embedding model,
# and measure role-switch (hot-swap) cost. Run after bench/ollama_env.sh f16.
set -uo pipefail
source "$(dirname "$0")/lib/gpu.sh"   # MANDATORY thermal instrumentation

EMB=qwen3-embedding:4b   # ADR-004 A#2
EMB_CTX=512
PLANNER=qwen3.6:27b;     PLANNER_CTX=131072
CODER=qwen3-coder:30b;   CODER_CTX=65536

total=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)
gpu_guard 80
gpu_watch_start

unload_all() {
  curl -s http://localhost:11434/api/ps \
    | python3 -c 'import sys,json;[print(m["name"]) for m in json.load(sys.stdin).get("models",[])]' 2>/dev/null \
    | while read -r n; do [ -n "$n" ] && ollama stop "$n" >/dev/null 2>&1; done
}
used() { nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits; }

load_llm() { # model ctx -> seconds
  local t0=$(date +%s.%N)
  curl -s -m 900 -X POST http://localhost:11434/api/generate -H 'Content-Type: application/json' \
    -d "{\"model\":\"$1\",\"prompt\":\"hi\",\"stream\":false,\"keep_alive\":\"10m\",\"options\":{\"num_ctx\":$2,\"num_predict\":1}}" >/dev/null
  echo "$(date +%s.%N) $t0" | awk '{printf "%.1f", $1-$2}'
}
load_emb() {
  # num_gpu:0 pins the embedder to CPU per ADR-004 - removes the eviction race.
  curl -s -X POST http://localhost:11434/api/embed -H 'Content-Type: application/json' \
    -d "{\"model\":\"$EMB\",\"input\":\"warmup\",\"keep_alive\":\"10m\",\"options\":{\"num_ctx\":$EMB_CTX,\"num_gpu\":0}}" >/dev/null
}

unload_all; sleep 3
idle=$(used); echo "gpu_total=${total} MiB   idle=${idle} MiB"
echo

for pair in "$PLANNER $PLANNER_CTX" "$CODER $CODER_CTX"; do
  set -- $pair; m=$1; c=$2
  unload_all; sleep 3
  load_emb
  secs=$(load_llm "$m" "$c")
  u=$(used)
  echo "== $m @ ${c} + $EMB @ ${EMB_CTX}"
  ollama ps
  # v2 fix: the old check only looked for CPU spill and reported FITS even when Ollama
  # had EVICTED the embedding model to make room. Both models must be resident AND 100% GPU.
  ps_out=$(ollama ps)
  spill=$(echo "$ps_out" | grep -cE '[0-9]+% CPU' || true)
  have_llm=$(echo "$ps_out" | grep -c "$m" || true)
  have_emb=$(echo "$ps_out" | grep -c "$EMB" || true)
  if   [ "$have_llm" -eq 0 ]; then verdict="FAIL (llm not resident)"
  elif [ "$have_emb" -eq 0 ]; then verdict="FAIL (embedder EVICTED by Ollama scheduler)"
  elif [ "$spill" -ne 0 ];    then verdict="FAIL (CPU spill)"
  else verdict="CO-RESIDENT"; fi
  echo "   vram_used=${u} MiB   free=$(( total - u )) MiB   load=${secs}s   verdict=${verdict}"
  echo "   gpu: $(gpu_sample)"
  echo
done

echo "== role-switch cost (planner <-> coder, embedding stays resident) =="
unload_all; sleep 3; load_emb
load_llm "$PLANNER" "$PLANNER_CTX" >/dev/null
for i in 1 2; do
  ollama stop "$PLANNER" >/dev/null 2>&1
  a=$(load_llm "$CODER" "$CODER_CTX")
  ollama stop "$CODER" >/dev/null 2>&1
  b=$(load_llm "$PLANNER" "$PLANNER_CTX")
  echo "  cycle $i:  ->coder ${a}s   ->planner ${b}s   gpu=$(gpu_sample)"
done
unload_all
echo
echo "NOTE: OLLAMA_KEEP_ALIVE=-1 is set on this host, so models never auto-unload."
echo "The middleware MUST explicitly 'ollama stop' the outgoing model on every role switch."
gpu_watch_stop
