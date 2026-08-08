#!/usr/bin/env bash
# Put the GPU into a reproducible state before timing anything, and report whether the
# card is being held back. Run once per boot, before the quality bench.
#
#   bash bench/gpu_pin.sh            # persistence mode on + report
#   bash bench/gpu_pin.sh lock       # additionally lock graphics clocks for reproducibility
set -euo pipefail
ACTION="${1:-report}"

# Persistence mode keeps the driver initialised between model loads. Without it every
# ollama load pays driver re-init. Role switches were measured at 2.8-6.9 s (ADR-004);
# this targets the fixed part of that cost.
sudo nvidia-smi -pm 1 >/dev/null && echo "persistence mode: ON"

echo
echo "== clocks / power / thermal =="
nvidia-smi --query-gpu=name,clocks.sm,clocks.max.sm,power.draw,power.limit,power.max_limit,temperature.gpu,utilization.gpu \
  --format=csv

echo
echo "== throttle reasons (all should read 'Not Active' when unconstrained) =="
nvidia-smi -q -d PERFORMANCE | sed -n '/Clocks Event Reasons/,/^$/p' || true

if [[ "$ACTION" == "power" ]]; then
  # BENCH POWER CAP: 435 W. Decided 2026-08-08 on measurement, not preference.
  #
  # 600 W is this card's factory default (power.limit == default_limit == max_limit ==
  # 600 W), so a cap must be applied explicitly after every boot - it does not persist.
  #
  # Measured, qwen3.6:27b @131072, ~26k-token prefill + 256 decode:
  #   435 W -> peak 69-70 C edge, completed cleanly, prefill 2901-2929 tok/s
  #   600 W -> peak 82 C edge (1 C under the ceiling), 12 s above the 78 C warn,
  #            1 thermally-throttled sample, prefill 3303-3352 tok/s
  # 600 W buys ~+13% prefill and costs 12 C. A 41-second probe is a far shorter heat
  # soak than a seven-cell matrix, and a thermal abort mid-matrix costs more than the
  # prefill gain is worth. A/B validity needs the cap IDENTICAL across cells, not high.
  #
  # An earlier comment here claimed the "SW Power Capping: 854,692 us" counter showed the
  # card hitting its cap at idle. That was wrong: the counter is cumulative since driver
  # init, not live state, and "SW Power Cap: Not Active" appeared in the same output.
  #
  # Operator thermal limits: 88 C hardware slowdown (confirmed: T.Limit 57 at 33 C => 90 C
  # max operating, minus the -2 C slowdown spec), 83 C hard ceiling, 78 C warn.
  # bench/lib/gpu.sh aborts any run reaching 83 C edge.
  CAP="${2:-435}"
  sudo nvidia-smi -pl "$CAP" && echo "power limit set to ${CAP} W (83 C ceiling enforced by bench/lib/gpu.sh)"
  echo "This does NOT survive a reboot - 600 W is the factory default. Re-run after every boot."
  nvidia-smi --query-gpu=power.limit --format=csv,noheader
fi

if [[ "$ACTION" == "lock" ]]; then
  MAXSM=$(nvidia-smi --query-gpu=clocks.max.sm --format=csv,noheader,nounits)
  sudo nvidia-smi -lgc "${MAXSM},${MAXSM}" && echo "graphics clocks LOCKED at ${MAXSM} MHz"
  echo "Release with: sudo nvidia-smi -rgc"
  echo "NOTE: locking trades peak boost for run-to-run comparability. Use it for the bench,"
  echo "release it afterwards - do not leave the card locked for normal use."
fi
