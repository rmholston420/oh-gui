#!/usr/bin/env bash
# Configure the Ollama server env via a systemd drop-in and PROVE it applied.
# `systemctl set-environment` does not reliably reach the service; a drop-in does.
#
#   bash bench/ollama_env.sh f16            # normal operating state
#   bash bench/ollama_env.sh q8             # flash attention + q8_0 KV (known no-op, see ADR-004)
#   bash bench/ollama_env.sh f16 debug      # same, but OLLAMA_DEBUG=1 to PROVE flash attention
#
# v3 (2026-08-08): adds OLLAMA_MAX_LOADED_MODELS and OLLAMA_NUM_PARALLEL. Supersedes v2 -
# do not keep a v2 copy around; this is the single path.
set -euo pipefail
MODE="${1:-f16}"
DEBUG="${2:-}"
DIR=/etc/systemd/system/ollama.service.d
FILE=$DIR/oh-gui.conf

case "$MODE" in
  q8)  KV=q8_0; FA=1 ;;
  f16) KV=f16;  FA=1 ;;
  *) echo "usage: $0 [q8|f16] [debug]"; exit 2 ;;
esac
[[ "$DEBUG" == "debug" ]] && DBG=1 || DBG=0

# WHY MAX_LOADED_MODELS=2 (not the Ollama default of 3-per-GPU, not 1):
#   The default of 3 is what let the scheduler hold the embedder resident alongside a role
#   model and then evict it non-deterministically (BUILD_LOG 2026-08-08).
#   1 would be wrong: the CPU-resident embedder occupies a model slot, so 1 would evict and
#   reload it on every planner<->coder switch.
#   2 = exactly one GPU role model + the CPU embedder. Enforces ADR-004's "planner and coder
#   are never co-resident" at the server, instead of trusting the router to call ollama stop.
# WHY NUM_PARALLEL=1:
#   Parallel slots divide the context window between them. Pinning to 1 guarantees a request
#   receives the whole num_ctx it asked for. The documented default is already 1; pinning it
#   removes any dependence on that default staying 1.
sudo mkdir -p "$DIR"
sudo tee "$FILE" >/dev/null <<EOF
[Service]
Environment="OLLAMA_FLASH_ATTENTION=$FA"
Environment="OLLAMA_KV_CACHE_TYPE=$KV"
Environment="OLLAMA_GPU_OVERHEAD=1073741824"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_DEBUG=$DBG"
EOF

sudo systemctl daemon-reload
sudo systemctl restart ollama
sleep 6

echo "== effective service environment =="
systemctl show ollama --property=Environment | tr ' ' '\n' | grep -i ollama || true

echo
echo "== startup lines mentioning flash attention / kv cache =="
sudo journalctl -u ollama --since "1 min ago" --no-pager \
  | grep -iE "flash|kv.?cache|num_parallel|parallel|OLLAMA_(FLASH|KV|GPU_OVERHEAD|MAX_LOADED|NUM_PARALLEL)" \
  | tail -30 || echo "(none found)"

if [[ "$DBG" == "1" ]]; then
  echo
  echo "== DEBUG probe: load a model and capture the actual runner flags =="
  curl -s http://localhost:11434/api/chat -d \
    '{"model":"qwen3.6:35b-a3b-mtp-q4_K_M","messages":[{"role":"user","content":"hi"}],
      "stream":false,"options":{"num_ctx":32768,"num_predict":8}}' >/dev/null || true
  sleep 2
  sudo journalctl -u ollama --since "1 min ago" --no-pager \
    | grep -iE "flash.?attn|flash attention|kv cache type|n_ctx|n_batch|n_parallel" | tail -25 \
    || echo "(no runner flags captured - raise with OLLAMA_DEBUG=2)"
fi

echo
echo "Requested: KV=$KV FA=$FA GPU_OVERHEAD=1GiB MAX_LOADED_MODELS=2 NUM_PARALLEL=1 DEBUG=$DBG"
echo "Flash attention was NEVER confirmed active in runs before 2026-08-08; the grep above"
echo "returned nothing. Run with 'debug' to prove it before trusting any tok/s measurement."
