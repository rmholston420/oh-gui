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
# v3 (2026-08-08): v2 settled the VRAM and prefill axes but produced a garbage decode
# figure - num_predict=16 on a prompt whose correct answer is the single word "ack" meant
# eval_count was ~1, so eval_tok_s was first-token latency wearing a throughput costume
# (0.6 vs 85.8 tok/s, an artefact, not a finding). v3 forces a real generation of NPRED
# tokens, refuses to report tok/s below a 64-token floor, and samples the GPU DURING
# generation instead of after it, when the clocks have already decayed.
#
# v2 (2026-08-08): fixes a fatal ordering bug in v1 - PROMPT was consumed by a heredoc
# before it was exported, so the request was never built. Request JSON is now generated
# by a single Python step that writes a file; nothing depends on shell export ordering.
#
#   bash bench/fa_probe.sh
set -euo pipefail
source "$(dirname "$0")/lib/gpu.sh"   # MANDATORY thermal instrumentation
MODEL="${MODEL:-qwen3.6:27b}"     # dense, 74.6 KB/token KV - largest signal of the candidates
CTX="${CTX:-131072}"
OUT=~/.oh-gui/fa_probe; mkdir -p "$OUT"
STAMP=$(date +%Y%m%d_%H%M); CSV="$OUT/${STAMP}_fa_probe.csv"; REQ="$OUT/${STAMP}_req.json"
DIR=/etc/systemd/system/ollama.service.d; FILE=$DIR/oh-gui.conf
NPRED="${NPRED:-256}"
gpu_guard
gpu_watch_start

python3 - "$MODEL" "$CTX" "$REQ" "$NPRED" <<'PY'
import json, sys
model, ctx, out, npred = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])
# Non-degenerate filler AND a real generation instruction. Two separate defects lived
# here: 900 verbatim copies of one sentence is a degenerate context, and the instruction
# literally asked for one word - which is why eval_count was 2 in every run so far.
subj = ["The middleware", "The policy plane", "The audit sink", "The action gate",
        "The injection screen", "The trust dial", "The approval queue", "The event bus"]
verb = ["mediates", "records", "screens", "gates", "serialises", "authorises",
        "rejects", "replays"]
obj  = ["every policy-bearing call", "each tool invocation", "the agent's file writes",
        "outbound network access", "the shell execution request",
        "each plan-step transition", "the workspace mutation", "the confirmation prompt"]
prompt = "\n".join(
    f"Rule {i+1:04d}: {subj[i%8]} {verb[(i*3)%8]} {obj[(i*5)%8]} under trust level {i%7} "
    f"with a budget of {(i*37)%991} milliseconds."
    for i in range(900)
) + ("\n\nThe rules above describe a policy plane. Write roughly 250 words of continuous "
     "prose explaining how such a system should sequence authorisation, screening, gating "
     "and audit, and why that order matters. Do not use bullet points or lists.")
json.dump({"model": model,
           "messages": [{"role": "user", "content": prompt}],
           "stream": False,
           "think": False,
           "options": {"num_ctx": ctx, "num_predict": npred,
                       "temperature": 0.6, "top_p": 0.95, "top_k": 20}},
          open(out, "w"))
print(f"request written: {out} (~{len(prompt)//4} tokens)")
PY

echo "model=$MODEL ctx=$CTX" | tee "$CSV.meta"
echo "fa,idle_mib,used_mib,model_mib,prompt_tokens,prefill_s,prefill_tok_s,eval_tokens,eval_tok_s,peak_temp_c,peak_power_w,peak_sm_mhz" > "$CSV"

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

  echo "-- fa=$FA running (prefill ~26k tokens + $NPRED generated tokens)"
  curl -s localhost:11434/api/chat -d @"$REQ" -o "$OUT/${STAMP}_fa${FA}.json" &
  CURL_PID=$!
  # Sample while the GPU is actually working. v2 sampled after the request returned, by
  # which point clocks and power had already decayed - that is how fa=1 recorded 38C/65W
  # and fa=0 recorded 68C/435W for identical work.
  peak_t=0; peak_p=0; peak_sm=0
  while kill -0 $CURL_PID 2>/dev/null; do
    read -r ct cp cs <<<"$(nvidia-smi --query-gpu=temperature.gpu,power.draw,clocks.sm \
          --format=csv,noheader,nounits | tr -d ',')"
    [ "${ct%.*}" -gt "${peak_t%.*}" ] 2>/dev/null && peak_t=$ct
    [ "${cp%.*}" -gt "${peak_p%.*}" ] 2>/dev/null && peak_p=$cp
    [ "${cs%.*}" -gt "${peak_sm%.*}" ] 2>/dev/null && peak_sm=$cs
    sleep 1
  done
  wait $CURL_PID || true
  used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
  temp=$peak_t; power=$peak_p; sm=$peak_sm

  python3 - "$OUT/${STAMP}_fa${FA}.json" <<'PYX'
import json, sys
d = json.load(open(sys.argv[1]))
c = (d.get("message", {}) or {}).get("content", "")
print(f"   done_reason={d.get('done_reason')!r} eval_count={d.get('eval_count')} chars={len(c)}")
print(f"   preview: {c[:140]!r}")
if d.get("error"): print(f"   ERROR: {d['error']}")
PYX
  python3 - "$OUT/${STAMP}_fa${FA}.json" "$FA" "$idle" "$used" "$temp" "$power" "$sm" >> "$CSV" <<'PY'
import json, sys
f, fa, idle, used, temp, power, sm = sys.argv[1:8]
d = json.load(open(f))
pt = d.get("prompt_eval_count", 0); pd = d.get("prompt_eval_duration", 0)
ec = d.get("eval_count", 0);        ed = d.get("eval_duration", 0)
pre_s  = pd/1e9 if pd else 0
pre_ts = pt/pre_s if pre_s else 0
# Decode throughput is only meaningful over a decent number of tokens. Below the floor,
# tok/s is dominated by first-token latency - report INVALID rather than a fake number.
FLOOR = 64
ev_ts = f"{ec/(ed/1e9):.1f}" if (ed and ec >= FLOOR) else f"INVALID(n={ec})"
print(f"{fa},{idle},{used},{int(used)-int(idle)},{pt},{pre_s:.2f},{pre_ts:.1f},{ec},{ev_ts},{temp},{power},{sm}")
PY
  tail -1 "$CSV"
  ollama stop "$MODEL" >/dev/null 2>&1 || true
  gpu_aborted && { echo "thermal cutout tripped - abandoning remaining cells" >&2; break; }
done

echo
column -s, -t < "$CSV"
echo
echo "INTERPRETATION"
echo " v2 already settled two axes: model_mib 25509 vs 25518 (9 MiB = noise) and"
echo " prefill 2929.5 vs 2926.8 tok/s (0.09%). Flash attention changes NEITHER."
echo " This run tests the one axis v2 measured invalidly: sustained decode."
echo " If eval_tok_s also matches, FA is a confirmed no-op on all three axes."
echo
echo "Restore the normal operating state with: bash bench/ollama_env.sh f16"
echo "CSV: $CSV"
gpu_watch_stop
