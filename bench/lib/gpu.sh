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
#   80 C  warn                       - report, keep going (report-only, never aborts)
#   80 C  refuse to start a new run
#   COLD threshold - not a safety limit. Benching from unequal starting temperatures makes
#         later cells clock down earlier and quietly penalises whatever ran last. This is
#         now MEASURED per run by gpu_cold_calibrate rather than hardcoded: the gate is the
#         observed idle floor plus GPU_COLD_MARGIN_C (default 3).
#
#         The previous fixed 45 C was marginal to the point of being decorative. Idle
#         troughs in runs 0531/0545/0555 measured 45-46 C with the operator's normal
#         desktop up, so the gate sat AT the floor: it either passed instantly or waited
#         out its timeout on an ambient degree of drift, and could not distinguish a cold
#         card from a heat-soaked one. A floor-relative gate adapts to ambient and to
#         whatever else the desktop is doing, which on a single-user workstation that
#         cannot be quiesced (the operator needs the browser to talk to the scoring model)
#         is the only version of this gate that means anything.
#
#         Set GPU_COLD_C explicitly in the environment to skip calibration.
# The card is capped at 435 W by LACT (power_cap in /etc/lact/config.yaml), and
# run_path_e.sh refuses to start at any other cap. These limits are still enforced in
# software rather than inferred from the cap: a cap bounds power, not temperature.
#
# This does not merely record temperature - it ABORTS. The watcher runs in the
# background, and on breaching the ceiling it unloads every resident model and signals
# the parent script to stop. A bench is never worth cooking the card for.
#
# Usage:
#   source "$(dirname "$0")/lib/gpu.sh"
#   gpu_guard          # refuse to start above GPU_START_C (safety)
#   gpu_cool_wait      # block until <=GPU_COLD_C (comparability)
#   gpu_watch_start    # 1 Hz sampler + hard cutout at GPU_MAX_C
#   ...                # gpu_sample -> "temp,power,sm,util,throttle"
#   gpu_watch_stop     # summary + verdict

GPU_REDLINE_C="${GPU_REDLINE_C:-88}"   # hardware limit, documentation only
GPU_MAX_C="${GPU_MAX_C:-83}"           # hard ceiling: abort
GPU_WARN_C="${GPU_WARN_C:-80}"         # warn (report-only; the abort is GPU_MAX_C)
GPU_COLD_C="${GPU_COLD_C:-}"           # empty = calibrate per run (see gpu_cold_calibrate)
GPU_COLD_FALLBACK_C="${GPU_COLD_FALLBACK_C:-45}"  # used only if calibration fails
GPU_COLD_MARGIN_C="${GPU_COLD_MARGIN_C:-3}"       # gate = measured idle floor + this
GPU_CALIB_MIN_S="${GPU_CALIB_MIN_S:-30}"          # shortest acceptable observation window
GPU_CALIB_TIMEOUT_S="${GPU_CALIB_TIMEOUT_S:-600}" # give up, use the best floor seen
GPU_COOL_TIMEOUT_S="${GPU_COOL_TIMEOUT_S:-300}"  # give up waiting, warn, continue
GPU_START_C="${GPU_START_C:-80}"       # refuse to begin above this

GPU_WATCH_PID=""; GPU_WATCH_LOG=""; GPU_ABORT_FLAG=""

# --- hotspot -----------------------------------------------------------------
# nvidia-smi on driver 610.57.04 does NOT expose the hotspot (junction) sensor. It
# reports only "GPU Current Temp" (edge). LACT reads hotspot over NVML, so when the
# lactd daemon is available we sample it from there.
#
# This matters: at idle the two sensors sit ~1 C apart (33 edge / 32 hotspot), but under
# sustained load hotspot runs materially hotter than edge. A guard watching only edge is
# watching the cooler of the two sensors. Hotspot is RECORDED unconditionally; whether it
# also ABORTS is controlled by GPU_MAX_HOTSPOT_C, unset by default (record-only) pending
# an operator-supplied limit.
GPU_LACT_ID="${GPU_LACT_ID:-}"
GPU_MAX_HOTSPOT_C="${GPU_MAX_HOTSPOT_C:-}"   # empty = record only, do not abort

gpu_lact_init() {
  command -v lact >/dev/null 2>&1 || { GPU_LACT_ID=""; return 1; }
  [ -n "$GPU_LACT_ID" ] && return 0
  GPU_LACT_ID=$(lact cli list-gpus 2>/dev/null | awk -F'[ (]' '/NVIDIA/{print $2; exit}')
  [ -n "$GPU_LACT_ID" ]
}

# Hotspot in whole degrees, or empty when unavailable.
gpu_hotspot() {
  [ -n "$GPU_LACT_ID" ] || return 0
  lact cli -g "$GPU_LACT_ID" stats 2>/dev/null \
    | sed -n 's/.*GPU Hotspot: \([0-9]\+\).*/\1/p' | head -1
}

gpu_sample() {
  local q thr hs
  # NOTE: fan.speed is UNRELIABLE on this card. Driver 610.57.04 does not expose the fan
  # tachometer for this 5090, so both nvidia-smi and LACT report 0% / 0 RPM while the fans
  # are visibly spinning (operator-confirmed 2026-08-08). The column is recorded for
  # completeness but a 0 here means "not reported", NOT "fans stopped". Do not infer
  # cooling behaviour from it, and do not build a guard on it.
  q=$(nvidia-smi --query-gpu=temperature.gpu,power.draw,clocks.sm,utilization.gpu,fan.speed \
        --format=csv,noheader,nounits | tr -d ' ')
  # Parse the value AFTER the colon, not $NF. "Not Active" has $NF == "Active", so the
  # naive parser reported throttling on every sample including idle ones.
  #
  # Power capping and thermal slowdown are reported SEPARATELY and mean different things:
  #   SW Power Cap  - expected whenever the card is at its power limit. At a 435 W cap
  #                   drawing 445 W this is Active for the whole load, which is normal and
  #                   is NOT a reason to distrust a measurement, provided the cap is the
  #                   same for every cell being compared.
  #   Thermal       - HW/SW thermal slowdown. This DOES invalidate cross-cell timing,
  #                   because it depends on how hot the card happened to be at that moment.
  local pcap thermal
  pcap=$(nvidia-smi -q -d PERFORMANCE 2>/dev/null \
        | awk -F':' '/SW Power Cap /{v=$2; gsub(/[ \t]/,"",v); if (v=="Active") print "1"}' | head -1)
  thermal=$(nvidia-smi -q -d PERFORMANCE 2>/dev/null \
        | awk -F':' '/HW Thermal Slowdown |SW Thermal Slowdown |HW Power Brake /\
                     {v=$2; gsub(/[ \t]/,"",v); if (v=="Active") print "1"}' | head -1)
  thr="${pcap:-0}${thermal:-0}"   # e.g. "10" = power-capped, not thermally throttled
  hs=$(gpu_hotspot)
  echo "${q},${hs:-},${thr}"
}

gpu_temp() { nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits; }

gpu_unload_all() {
  curl -s http://localhost:11434/api/ps 2>/dev/null \
    | python3 -c 'import sys,json;[print(m["name"]) for m in json.load(sys.stdin).get("models",[])]' 2>/dev/null \
    | while read -r n; do [ -n "$n" ] && ollama stop "$n" >/dev/null 2>&1; done
}

gpu_guard() {
  local t hs; t=$(gpu_temp)
  gpu_lact_init || true
  hs=$(gpu_hotspot)
  if [ "$t" -ge "$GPU_START_C" ]; then
    echo "ABORT: GPU is ${t}C, at or above the ${GPU_START_C}C start threshold." >&2
    echo "Let it cool, or lower the cap: sudo nvidia-smi -pl 435" >&2
    exit 1
  fi
  echo "thermal: start=${t}C  warn=${GPU_WARN_C}C  ceiling=${GPU_MAX_C}C  redline=${GPU_REDLINE_C}C  cap=$(nvidia-smi --query-gpu=power.limit --format=csv,noheader,nounits)W"
  if [ -n "$hs" ]; then
    echo "        hotspot=${hs}C via lact${GPU_MAX_HOTSPOT_C:+  hotspot ceiling=${GPU_MAX_HOTSPOT_C}C}"
    [ -z "$GPU_MAX_HOTSPOT_C" ] && echo "        (hotspot RECORDED but does not abort - set GPU_MAX_HOTSPOT_C to enforce)"
  else
    echo "        hotspot UNAVAILABLE - edge sensor only. Is lactd running?" >&2
  fi
}

gpu_watch_start() {
  GPU_WATCH_LOG="${1:-$HOME/.oh-gui/thermal/$(date +%Y%m%d_%H%M)_$$.csv}"
  GPU_ABORT_FLAG="${GPU_WATCH_LOG%.csv}.ABORT"
  mkdir -p "$(dirname "$GPU_WATCH_LOG")"; rm -f "$GPU_ABORT_FLAG"
  gpu_lact_init || true
  echo "ts,temp_c,power_w,sm_mhz,util_pct,fan_pct,hotspot_c,pcap_thermal" > "$GPU_WATCH_LOG"
  local parent=$$
  (
    warned=0
    while true; do
      s=$(gpu_sample); t=${s%%,*}
      echo "$(date +%H:%M:%S),$s" >> "$GPU_WATCH_LOG"
      hs=$(echo "$s" | cut -d, -f6)
      breach=""
      [ "${t:-0}" -ge "$GPU_MAX_C" ] && breach="edge ${t}C >= ${GPU_MAX_C}C"
      if [ -z "$breach" ] && [ -n "$GPU_MAX_HOTSPOT_C" ] && [ -n "$hs" ] \
         && [ "$hs" -ge "$GPU_MAX_HOTSPOT_C" ]; then
        breach="hotspot ${hs}C >= ${GPU_MAX_HOTSPOT_C}C"
      fi
      if [ -n "$breach" ]; then
        echo "$t" > "$GPU_ABORT_FLAG"
        echo "" >&2
        echo "!! THERMAL CUTOUT: ${breach}. Unloading models and stopping." >&2
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
  # The watcher signals the parent on breach. A bare 'gpu_watch_stop' trap prints the
  # summary and then lets execution continue to the next cell - which is exactly what
  # happened at 04:46: the cutout fired, said "stopping", and the fa=0 cell ran anyway.
  # TERM/INT must summarise AND exit non-zero.
  trap 'gpu_watch_stop' EXIT
  # INT/TERM is almost always the operator pressing Ctrl-C, NOT a thermal breach. Claiming
  # a cutout on every interrupt trained us to distrust the message; the abort flag is the
  # only authority on whether the card actually tripped.
  trap 'gpu_watch_stop; if gpu_aborted; then echo "run ABORTED: thermal cutout at $(cat "$GPU_ABORT_FLAG" 2>/dev/null)C" >&2; else echo "run interrupted by signal (no thermal breach) - partial results kept" >&2; fi; exit 1' INT TERM
}

# Block until the card is genuinely cold, so every cell of a matrix starts from the same
# thermal state. This is a COMPARABILITY gate, not a safety one - GPU_START_C handles
# safety. Without it, cell 1 starts at 29 C and cell 7 at 40 C, and the ordering of the
# matrix becomes a confound in its own results.
#
# On timeout this WARNS and continues rather than aborting: ambient temperature can drift
# above the target on a hot day, and refusing to run at all would be worse than running
# with a recorded caveat. The actual start temperature is always printed and recorded.
#
#   gpu_cool_wait [target_c] [timeout_s]
gpu_cool_wait() {
  local target="${1:-${GPU_COLD_C:-$GPU_COLD_FALLBACK_C}}" timeout="${2:-$GPU_COOL_TIMEOUT_S}"
  local t0 t elapsed
  t0=$(date +%s); t=$(gpu_temp)
  if [ "$t" -le "$target" ]; then
    echo "cold: ${t}C (target <=${target}C)"
    GPU_LAST_START_C="$t"; export GPU_LAST_START_C
    return 0
  fi
  printf 'cooling: %sC -> target <=%sC ' "$t" "$target"
  while : ; do
    sleep 5
    t=$(gpu_temp); elapsed=$(( $(date +%s) - t0 ))
    printf '.'
    if [ "$t" -le "$target" ]; then
      printf ' reached %sC after %ss\n' "$t" "$elapsed"
      GPU_LAST_START_C="$t"; export GPU_LAST_START_C
      return 0
    fi
    if [ "$elapsed" -ge "$timeout" ]; then
      printf '\nWARNING: still %sC after %ss (target %sC). Proceeding.\n' "$t" "$elapsed" "$target" >&2
      echo "  This cell starts hotter than the others - flag it when comparing timings." >&2
      GPU_LAST_START_C="$t"; export GPU_LAST_START_C
      return 1
    fi
  done
}

# Measure the card's actual idle floor, then set GPU_COLD_C to floor + GPU_COLD_MARGIN_C.
#
# Sampling a fixed window is not enough: at run start the card may still be shedding heat
# from an earlier probe, and the minimum of a falling curve is just "wherever it had got
# to", which would set the gate too high and let every subsequent cell through instantly.
# So this waits for the curve to FLATTEN - a 30 s window whose spread is <=1 C - and only
# then takes the floor. On an already-cold card that costs the 30 s minimum window.
#
# Idempotent: if GPU_COLD_C is already set in the environment, this returns immediately
# and leaves it alone.
#
#   gpu_cold_calibrate
gpu_cold_calibrate() {
  if [ -n "$GPU_COLD_C" ]; then
    echo "cold gate: ${GPU_COLD_C}C (preset, calibration skipped)"
    return 0
  fi

  local t0 elapsed t floor=999 spread wmin wmax
  local -a win=()      # explicit -a; the window length test depends on this being an array
  t0=$(date +%s)
  printf 'calibrating cold gate (waiting for idle floor) '

  while : ; do
    t=$(gpu_temp)
    case "$t" in ''|*[!0-9]*) t="" ;; esac
    if [ -n "$t" ]; then
      [ "$t" -lt "$floor" ] && floor="$t"
      win+=("$t")
      # keep a 6-sample / 30 s trailing window
      [ "${#win[@]}" -gt 6 ] && win=("${win[@]:1}")
    fi
    elapsed=$(( $(date +%s) - t0 ))

    if [ "${#win[@]}" -eq 6 ] && [ "$elapsed" -ge "$GPU_CALIB_MIN_S" ]; then
      wmin=999; wmax=0
      for v in "${win[@]}"; do
        [ "$v" -lt "$wmin" ] && wmin="$v"
        [ "$v" -gt "$wmax" ] && wmax="$v"
      done
      spread=$(( wmax - wmin ))
      if [ "$spread" -le 1 ]; then
        GPU_COLD_C=$(( wmin + GPU_COLD_MARGIN_C ))
        printf ' settled at %sC after %ss\n' "$wmin" "$elapsed"
        echo "cold gate: ${GPU_COLD_C}C (measured floor ${wmin}C + ${GPU_COLD_MARGIN_C}C margin)"
        export GPU_COLD_C GPU_COLD_FLOOR_C="$wmin"
        return 0
      fi
    fi

    if [ "$elapsed" -ge "$GPU_CALIB_TIMEOUT_S" ]; then
      if [ "$floor" -lt 999 ]; then
        GPU_COLD_C=$(( floor + GPU_COLD_MARGIN_C ))
        printf '\nWARNING: never settled in %ss; using lowest observed %sC.\n' "$elapsed" "$floor" >&2
        echo "  Something is keeping the card busy. Cell start temperatures will vary more" >&2
        echo "  than usual - check cold_start_ok per cell before comparing timings." >&2
      else
        GPU_COLD_C="$GPU_COLD_FALLBACK_C"
        printf '\nWARNING: calibration read no valid temperature; falling back to %sC.\n' \
          "$GPU_COLD_C" >&2
      fi
      echo "cold gate: ${GPU_COLD_C}C"
      export GPU_COLD_C GPU_COLD_FLOOR_C="$floor"
      return 1
    fi

    printf '.'
    sleep 5
  done
}

# True if the watcher has tripped. Call between cells of a long matrix.
gpu_aborted() { [ -n "$GPU_ABORT_FLAG" ] && [ -f "$GPU_ABORT_FLAG" ]; }

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
def col(r, k):
    v = (r.get(k) or "").strip()
    try: return float(v)
    except ValueError: return None
t=[float(r["temp_c"]) for r in rows]; p=[float(r["power_w"]) for r in rows]
s=[float(r["sm_mhz"]) for r in rows]; u=[float(r["util_pct"]) for r in rows]
fan=[x for x in (col(r,"fan_pct") for r in rows) if x is not None]
hot=[x for x in (col(r,"hotspot_c") for r in rows) if x is not None]
busy=[x for x,v in zip(t,u) if v>50]
# 1 Hz sampler, so a sample count is a second count.
over_warn=sum(1 for x in t if x>=WARN)
over_max =sum(1 for x in t if x>=MAX)
# field is a 2-char flag: [SW power cap][thermal slowdown]
def flag(r, i):
    v = (r.get("pcap_thermal") or "00")
    return len(v) > i and v[i] == "1"
pcap = [r for r in rows if flag(r, 0)]
thermal = [r for r in rows if flag(r, 1)]
print(f" samples {len(rows)} ({len(busy)} under load)")
print(f" temp    max {max(t):.0f}C   avg {sum(t)/len(t):.1f}C" + (f"   under load avg {sum(busy)/len(busy):.1f}C" if busy else ""))
print(f" power   max {max(p):.0f}W   avg {sum(p)/len(p):.1f}W")
if hot:
    print(f" hotspot max {max(hot):.0f}C   avg {sum(hot)/len(hot):.1f}C   (peak delta over edge {max(hot)-max(t):+.0f}C)")
else:
    print(" hotspot UNAVAILABLE - edge sensor only")
if fan and max(fan) > 0:
    print(f" fan     max {max(fan):.0f}%   avg {sum(fan)/len(fan):.1f}%")
elif fan:
    print(" fan     NOT REPORTED by this card (reads 0% while physically spinning) - ignore")
print(f" sm clk  min {min(s):.0f}MHz avg {sum(s)/len(s):.0f}MHz")
print(f" time >= {WARN:.0f}C warn: {over_warn}s     >= {MAX:.0f}C ceiling: {over_max}s")
print(f" power-capped samples: {len(pcap)} (expected at the cap - benign if constant across cells)")
print(f" THERMALLY throttled samples: {len(thermal)}")
if over_max:     print(f" VERDICT: CEILING BREACHED ({max(t):.0f}C). Revert the cap: sudo nvidia-smi -pl 435")
elif over_warn:  print(f" VERDICT: warm ({max(t):.0f}C) but under the {MAX:.0f}C ceiling. Acceptable; watch it.")
else:            print(f" VERDICT: thermally fine - peaked {max(t):.0f}C, well under {WARN:.0f}C.")
if thermal: print(" WARNING: THERMAL throttling occurred - tok/s in this run is NOT comparable across cells.")
print(f" log: {sys.argv[1]}")
PY
  if [ -n "$GPU_ABORT_FLAG" ] && [ -f "$GPU_ABORT_FLAG" ]; then
    echo " RUN ABORTED BY THERMAL CUTOUT at $(cat "$GPU_ABORT_FLAG")C - results are INCOMPLETE."
  fi
}
