#!/usr/bin/env bash
# Configure Ollama server env via a systemd drop-in and PROVE it applied.
# `systemctl set-environment` does not reliably reach the service; a drop-in does.
#
#   bash bench/ollama_env.sh q8      # flash attention + q8_0 KV cache + 1 GiB GPU reserve
#   bash bench/ollama_env.sh f16     # back to defaults
set -euo pipefail
MODE="${1:-f16}"
DIR=/etc/systemd/system/ollama.service.d
FILE=$DIR/oh-gui.conf

case "$MODE" in
  q8)  KV=q8_0; FA=1 ;;
  f16) KV=f16;  FA=1 ;;
  *) echo "usage: $0 [q8|f16]"; exit 2 ;;
esac

sudo mkdir -p "$DIR"
sudo tee "$FILE" >/dev/null <<EOF
[Service]
Environment="OLLAMA_FLASH_ATTENTION=$FA"
Environment="OLLAMA_KV_CACHE_TYPE=$KV"
Environment="OLLAMA_GPU_OVERHEAD=1073741824"
EOF

sudo systemctl daemon-reload
sudo systemctl restart ollama
sleep 6

echo "== effective service environment =="
systemctl show ollama --property=Environment | tr ' ' '\n' | grep -i ollama || true

echo
echo "== server startup lines mentioning flash attention / kv cache =="
sudo journalctl -u ollama --since "1 min ago" --no-pager \
  | grep -iE "flash|kv.?cache|OLLAMA_(FLASH|KV|GPU_OVERHEAD)" | tail -20 || echo "(none found)"

echo
echo "Requested: OLLAMA_KV_CACHE_TYPE=$KV OLLAMA_FLASH_ATTENTION=$FA OLLAMA_GPU_OVERHEAD=1GiB"
echo "If the lines above do not confirm it, KV quantization is NOT active - do not trust"
echo "any sweep numbers taken in this state."
