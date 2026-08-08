#!/usr/bin/env bash
# Prove or disprove that OLLAMA_FLASH_ATTENTION is actually doing anything on this host.
#
# Log-grepping failed twice (OLLAMA_DEBUG=1 captured no runner flags). So do not ask the
# server what it is doing - measure it. This is the same falsification method that proved
# OLLAMA_KV_CACHE_TYPE=q8_0 is a no-op on the Go engine (ADR-004).
#
# Flash attention should change two observable quantities at long context:
#   1. VRAM: the attention workspace shrinks (FA avoids materialising the full score matrix).
#   2. Prompt-eval throughput: FA is normally faster to prefill.
# If BOTH are identical between FA=1 and FA=0, flash attention is not engaging.
#
#   bash bench/fa_probe.sh
set -euo pipefail
MODEL="${MODEL:-qwen3.6:27b}"     # dense, 74.6 KB/token KV - largest signal of the candidates
CTX="${CTX:-131072}"
OUT=~/.oh-gui/fa_probe; mkdir -p "$OUT"
STAMP=$(date +%Y%m%d_%H%M); CSV="$OUT/${STAMP}_fa_probe.csv"
DIR=/etc/systemd/system/ollama.service.d; FILE=$DIR/oh-gui.conf

# ~24k-token prompt so prefill time is large enough to compare meaningfully.
PROMPT=$(python3 - <<'PY'
para = ("The middleware owns the entire policy plane: authorization, prompt-injection "
        "screening, action gating, and audit. It never modifies the OpenHands checkout. ")
print((para * 900).strip())
PY
)
REQ=$(python3 - "$MODEL" "$CTX" <<'PY'
import json,sys
model,ctx=sys.argv[1],int(sys.argv[2])
import os
p=os.environ["PROMPT"]
print(json.dumps({"model":model,"messages":[{"role":"user","content":p+"\n\nReply with exactly one word: ack"}],
 "stream":False,"options":{"num_ctx":ctx,"num_predict":16,"temperature":0.6,"top_p":0.95,"top_k":20},
 "think":False}))
PY
)
export PROMPT

echo "model=$MODEL ctx=$CTX" | tee "$CSV.meta"
echo "fa,idle_mib,used_mib,model_mib,prompt_tokens,prefill_s,prefill_tok_s,eval_tok_s" > "$CSV"

for FA in 1 0; do
  sudo tee "$FILE" >/dev/null <<EOF
[Service]
Environment="OLLAMA_FLASH_ATTENTION=$FA"
Environment="OLLAMA_KV_CACHE_TYPE=f16"
Environment="OLLAMA_GPU_OVERHEAD=1073741824"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
Environment="OLLAMA_NUM_PARALLEL=1"
EOF
  sudo systemctl daemon-reload
  sudo systemctl restart ollama || { echo "FATAL: restart failed"; exit 1; }
  for i in $(seq 1 30); do curl -sf localhost:11434/api/version >/dev/null && break; sleep 1; done

  # hard precondition: nothing resident, or the baseline is meaningless
  n=$(curl -s localhost:11434/api/ps | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("models",[])))')
  [ "$n" -eq 0 ] || { echo "FATAL: $n model(s) resident before baseline"; exit 1; }
  sleep 2
  idle=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)

  resp=$(curl -s localhost:11434/api/chat -d "$REQ")
  used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)

  read -r ptok pdur ecnt edur <<<"$(python3 - <<PY
import json
d=json.loads(r'''$resp''')
print(d.get("prompt_eval_count",0), d.get("prompt_eval_duration",0),
      d.get("eval_count",0), d.get("eval_duration",0))
PY
)"
  pre_s=$(python3 -c "print(f'{$pdur/1e9:.2f}')")
  pre_ts=$(python3 -c "print(f'{($ptok/($pdur/1e9)) if $pdur else 0:.1f}')")
  ev_ts=$(python3 -c "print(f'{($ecnt/($edur/1e9)) if $edur else 0:.1f}')")
  echo "$FA,$idle,$used,$((used-idle)),$ptok,$pre_s,$pre_ts,$ev_ts" | tee -a "$CSV"
  ollama stop "$MODEL" >/dev/null 2>&1 || true
done

echo
column -s, -t < "$CSV"
echo
echo "INTERPRETATION"
echo " model_mib differs materially between fa=1 and fa=0  -> flash attention IS active"
echo " model_mib and prefill_tok_s both ~identical         -> flash attention is a NO-OP,"
echo "                                                        exactly like q8_0 KV (ADR-004)"
echo
echo "Restore the normal operating state afterwards with: bash bench/ollama_env.sh f16"
echo "CSV: $CSV"
