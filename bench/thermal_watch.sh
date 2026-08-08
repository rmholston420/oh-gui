#!/usr/bin/env bash
# Log GPU temperature, power and clocks once a second. Run in a second terminal for the
# whole duration of any timed benchmark, then check the summary.
#
# Exists because the operator originally capped this card at 435 W for thermal reasons.
# Any timing run at a raised cap must carry evidence that it did not thermally throttle,
# otherwise the tok/s numbers are not comparable across cells.
#
#   bash bench/thermal_watch.sh          # ctrl-C to stop and print the summary
set -euo pipefail
OUT=~/.oh-gui/thermal; mkdir -p "$OUT"
LOG="$OUT/$(date +%Y%m%d_%H%M)_thermal.csv"
echo "ts,temp_c,power_w,sm_mhz,util_pct,throttle" > "$LOG"
echo "logging to $LOG - ctrl-C to stop"

summary() {
  echo; echo "== summary =="
  python3 - "$LOG" <<'PY'
import csv, sys
rows = list(csv.DictReader(open(sys.argv[1])))
if not rows: print("no samples"); raise SystemExit
t = [float(r["temp_c"]) for r in rows]; p = [float(r["power_w"]) for r in rows]
s = [float(r["sm_mhz"]) for r in rows]
thr = [r for r in rows if r["throttle"] != "Not Active"]
print(f"samples      : {len(rows)}")
print(f"temp   max/avg: {max(t):.0f} / {sum(t)/len(t):.1f} C")
print(f"power  max/avg: {max(p):.0f} / {sum(p)/len(p):.1f} W")
print(f"sm clk min/avg: {min(s):.0f} / {sum(s)/len(s):.0f} MHz")
print(f"throttled samples: {len(thr)}")
print()
# Operator limits: 88 C redline, 83 C hard ceiling, 78 C warn.
if max(t) >= 83:   print("VERDICT: CEILING BREACHED. Revert to 435 W: sudo nvidia-smi -pl 435")
elif max(t) >= 78: print("VERDICT: warm but under the 83 C ceiling. Acceptable; watch it.")
else:              print("VERDICT: thermally fine at this cap.")
if thr: print("WARNING: throttling occurred - tok/s figures are NOT comparable across cells.")
PY
}
trap 'summary; exit 0' INT

while true; do
  read -r temp power sm util <<<"$(nvidia-smi \
    --query-gpu=temperature.gpu,power.draw,clocks.sm,utilization.gpu \
    --format=csv,noheader,nounits | tr -d ',')"
  thr=$(nvidia-smi -q -d PERFORMANCE | awk '/SW Power Cap|HW Thermal Slowdown/ {print $NF}' | grep -m1 Active || echo "Not Active")
  echo "$(date +%H:%M:%S),$temp,$power,$sm,$util,$thr" >> "$LOG"
  sleep 1
done
