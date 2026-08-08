#!/usr/bin/env bash
# Prove or disprove that OLLAMA_FLASH_ATTENTION does anything on this host.
#
# Log-grepping failed twice (OLLAMA_DEBUG=1 captured no runner flags). So do not ask the
# server what it is doing - measure it. Same falsification method that proved
# OLLAMA_KV_CACHE_TYPE=q8_0 is a no-op on the Go engine (ADR-004).
#
# Flash attention should change two observable quantities at long context:
#   1. VRAM: the attention workspace shrinks (FA avoids materialising the score matrix).
#   2. Prompt-eval throughput: FA normally prefills faster.
# If BOTH are identical between FA=1 and FA=0, flash attention is not engaging.
#
# v2 (2026-08-08): fixes a fatal ordering bug in v1 - PROMPT was consumed by a heredoc
# before it was exported, so the request was never built. Request JSON is now generated
# by a single Python step that writes a file; nothing depends on shell export ordering.
#
#   bash bench/fa_probe.sh
set -euo pipefail
MODEL="${MODEL:-qwen3.6:27b}"     # dense, 74.6 KB/token KV - largest signal of the candidates
CTX="${CTX:-131072}"
OUT=~/.oh-gui/fa_probe; mkdir -p "$OUT"
STAMP=$(date +%Y%m%d_%H%M); CSV="$OUT/${STAMP}_fa_probe.csv"; REQ="$OUT/${STAMP}_req.json"
DIR=/etc/systemd/system/ollama.service.d; FILE=$DIR/oh-gui.conf

python3 - "$MODEL" "$CTX" "$REQ" <<'PY'
import json, sys
model, ctx, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
para = ("The middleware owns the entire policy plane: authorization, prompt-injection "
        "screening, action gating, and audit. It never modifies the OpenHands checkout. ")
prompt = (para * 900).strip() + "\n\nReply with exactly one word: ack"
json.dump({"model": model,
           "messages": [{"role": "user", "content": prompt}],
           "stream": False,
           "think": False,
           "options": {"num_ctx": ctx, "num_predict": 16,
                       "temperature": 0.6, "top_p": 0.95, "top_k": 20}},
          open(out, "w"))
print(f"request written: {out} (~{len(prompt)//4} tokens)")
PY

echo "model=$MODEL ctx=$CTX" | tee "$CSV.meta"
echo "fa,idle_mib,used_mib,model_mib,prompt_tokens,prefill_s,prefill_tok_s,eval_tok_s,temp_c,power_w,sm_mhz" > "$CSV"

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

  n=$(curl -s localhost:11434/api/ps | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("models",[])))')
  [ "$n" -eq 0 ] || { echo "FATAL: $n model(s) resident before baseline"; exit 1; }
  sleep 2
  idle=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)

  echo "-- fa=$FA running (this prefills ~24k tokens, allow a minute)"
  curl -s localhost:11434/api/chat -d @"$REQ" -o "$OUT/${STAMP}_fa${FA}.json"
  used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
  read -r temp power sm <<<"$(nvidia-smi --query-gpu=temperature.gpu,power.draw,clocks.sm \
        --format=csv,noheader,nounits | tr -d ',')"

  python3 - "$OUT/${STAMP}_fa${FA}.json" "$FA" "$idle" "$used" "$temp" "$power" "$sm" >> "$CSV" <<'PY'
import json, sys
f, fa, idle, used, temp, power, sm = sys.argv[1:8]
d = json.load(open(f))
pt = d.get("prompt_eval_count", 0); pd = d.get("prompt_eval_duration", 0)
ec = d.get("eval_count", 0);        ed = d.get("eval_duration", 0)
pre_s  = pd/1e9 if pd else 0
pre_ts = pt/pre_s if pre_s else 0
ev_ts  = ec/(ed/1e9) if ed else 0
print(f"{fa},{idle},{used},{int(used)-int(idle)},{pt},{pre_s:.2f},{pre_ts:.1f},{ev_ts:.1f},{temp},{power},{sm}")
PY
  tail -1 "$CSV"
  ollama stop "$MODEL" >/dev/null 2>&1 || true
done

echo
column -s, -t < "$CSV"
echo
echo "INTERPRETATION"
echo " model_mib differs materially between fa=1 and fa=0  -> flash attention IS active"
echo " model_mib AND prefill_tok_s both ~identical         -> flash attention is a NO-OP,"
echo "                                                        exactly like q8_0 KV (ADR-004)"
echo
echo "Restore the normal operating state with: bash bench/ollama_env.sh f16"
echo "CSV: $CSV"
