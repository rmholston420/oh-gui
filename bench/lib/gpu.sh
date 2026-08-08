#!/usr/bin/env bash
# Shared GPU thermal instrumentation + cutout. MANDATORY in every OH-GUI script
# that invokes an LLM.
#
# Standing requirement (operator, 2026-08-08): any script that runs a local model must
# monitor and record GPU temperature inline. A timing number taken during a throttle is
# not a measurement of the model - it is a measurement of the cooling.
#
# Operator thermal limits for this RTX 5090:
#   88 C  hardware redline           - never to be reached
#   83 C  HARD CEILING               - abort the run
#   78 C  warn                       - report, keep going
#   80 C  refuse to start a new run
# The card was previously capped at 435 W for heat reasons; it currently sits at 600 W,
# so these limits are enforced in software rather than assumed from the power cap.
#
# This does not merely record temperature - it ABORTS. The watcher runs in the
# background, and on breaching the ceiling it unloads every resident model and signals
# the parent script to stop. A bench is never worth cooking the card for.
#
# Usage:
#   source "$(dirname "$0")/lib/gpu.sh"
#   gpu_guard          # refuse to start above GPU_START_C
#   gpu_watch_start    # 1 Hz sampler + hard cutout at GPU_MAX_C
#   ...                # gpu_sample -> "temp,power,sm,util,throttle"
#   gpu_watch_stop     # summary + verdict

GPU_REDLINE_C="${GPU_REDLINE_C:-88}"   # hardware limit, documentation only
GPU_MAX_C="${GPU_MAX_C:-83}"           # hard ceiling: abort
GPU_WARN_C="${GPU_WARN_C:-78}"         # warn
GPU_START_C="${GPU_START_C:-80}"       # refuse to begin above this

GPU_WATCH_PID=""; GPU_WATCH_LOG=""; GPU_ABORT_FLAG=""

gpu_sample() {
  local q thr
  q=$(nvidia-smi --query-gpu=temperature.gpu,power.draw,clocks.sm,utilization.gpu \
        --format=csv,noheader,nounits | tr -d ' ')
  thr=$(nvidia-smi -q -d PERFORMANCE 2>/dev/null \
        | awk '/SW Power Cap|HW Thermal Slowdown|SW Thermal Slowdown/ {print $NF}' \
        | grep -m1 '^Active$' || echo "None")
  echo "${q},${thr}"
}

gpu_temp() { nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits; }

gpu_unload_all() {
  curl -s http://localhost:11434/api/ps 2>/dev/null \
    | python3 -c 'import sys,json;[print(m["name"]) for m in json.load(sys.stdin).get("models",[])]' 2>/dev/null \
    | while read -r n; do [ -n "$n" ] && ollama stop "$n" >/dev/null 2>&1; done
}

gpu_guard() {
  local t; t=$(gpu_temp)
  if [ "$t" -ge "$GPU_START_C" ]; then
    echo "ABORT: GPU is ${t}C, at or above the ${GPU_START_C}C start threshold." >&2
    echo "Let it cool, or lower the cap: sudo nvidia-smi -pl 435" >&2
    exit 1
  fi
  echo "thermal: start=${t}C  warn=${GPU_WARN_C}C  ceiling=${GPU_MAX_C}C  redline=${GPU_REDLINE_C}C  cap=$(nvidia-smi --query-gpu=power.limit --format=csv,noheader,nounits)W"
}

gpu_watch_start() {
  GPU_WATCH_LOG="${1:-$HOME/.oh-gui/thermal/$(date +%Y%m%d_%H%M)_$$.csv}"
  GPU_ABORT_FLAG="${GPU_WATCH_LOG%.csv}.ABORT"
  mkdir -p "$(dirname "$GPU_WATCH_LOG")"; rm -f "$GPU_ABORT_FLAG"
  echo "ts,temp_c,power_w,sm_mhz,util_pct,throttle" > "$GPU_WATCH_LOG"
  local parent=$$
  (
    warned=0
    while true; do
      s=$(gpu_sample); t=${s%%,*}
      echo "$(date +%H:%M:%S),$s" >> "$GPU_WATCH_LOG"
      if [ "${t:-0}" -ge "$GPU_MAX_C" ]; then
        echo "$t" > "$GPU_ABORT_FLAG"
        echo "" >&2
        echo "!! THERMAL CUTOUT: ${t}C >= ${GPU_MAX_C}C ceiling. Unloading models and stopping." >&2
        gpu_unload_all
        kill -TERM "$parent" 2>/dev/null
        exit 0
      elif [ "${t:-0}" -ge "$GPU_WARN_C" ] && [ "$warned" -eq 0 ]; then
        echo "   [thermal warning: ${t}C, ceiling ${GPU_MAX_C}C]" >&2; warned=1
      fi
      sleep 1
    done
  ) &
  GPU_WATCH_PID=$!
  trap 'gpu_watch_stop' EXIT INT TERM
}

gpu_watch_stop() {
  [ -n "$GPU_WATCH_PID" ] || return 0
  kill "$GPU_WATCH_PID" 2>/dev/null || true
  wait "$GPU_WATCH_PID" 2>/dev/null || true
  GPU_WATCH_PID=""
  echo; echo "== GPU thermal summary =="
  GPU_MAX_C="$GPU_MAX_C" GPU_WARN_C="$GPU_WARN_C" python3 - "$GPU_WATCH_LOG" <<'PY'
import csv, os, sys
MAX=float(os.environ.get("GPU_MAX_C",83)); WARN=float(os.environ.get("GPU_WARN_C",78))
try: rows=list(csv.DictReader(open(sys.argv[1])))
except Exception: sys.exit(0)
rows=[r for r in rows if (r.get("temp_c") or "").strip().isdigit()]
if not rows: print(" no samples"); sys.exit(0)
t=[float(r["temp_c"]) for r in rows]; p=[float(r["power_w"]) for r in rows]
s=[float(r["sm_mhz"]) for r in rows]; u=[float(r["util_pct"]) for r in rows]
busy=[x for x,v in zip(t,u) if v>50]
thr=[r for r in rows if r.get("throttle")=="Active"]
over_warn=sum(1 for x in t if x>=WARN); over_max=sum(1 for x in t if x>=MAX)
print(f" samples {len(rows)} ({len(busy)} under load)")
print(f" temp    max {max(t):.0f}C   avg {sum(t)/len(t):.1f}C" + (f"   under load avg {sum(busy)/len(busy):.1f}C" if busy else ""))
print(f" power   max {max(p):.0f}W   avg {sum(p)/len(p):.1f}W")
print(f" sm clk  min {min(s):.0f}MHz avg {sum(s)/len(s):.0f}MHz")
print(f" time >= {WARN:.0f}C warn: {over_warn}s     >= {MAX:.0f}C ceiling: {over_max}s")
print(f" throttled samples: {len(thr)}")
if over_max:     print(f" VERDICT: CEILING BREACHED ({max(t):.0f}C). Revert the cap: sudo nvidia-smi -pl 435")
elif over_warn:  print(f" VERDICT: warm ({max(t):.0f}C) but under the {MAX:.0f}C ceiling. Acceptable; watch it.")
else:            print(f" VERDICT: thermally fine - peaked {max(t):.0f}C, well under {WARN:.0f}C.")
if thr: print(" WARNING: throttling occurred - tok/s in this run is NOT comparable across cells.")
print(f" log: {sys.argv[1]}")
PY
  if [ -n "$GPU_ABORT_FLAG" ] && [ -f "$GPU_ABORT_FLAG" ]; then
    echo " RUN ABORTED BY THERMAL CUTOUT at $(cat "$GPU_ABORT_FLAG")C - results are INCOMPLETE."
  fi
}
