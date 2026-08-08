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
  # The card reported power.limit=435 W against power.max_limit=600 W, and the
  # "SW Power Capping" counter was already non-zero (854,692 us) at IDLE - the card has
  # been hitting its cap. Raising the limit lets Blackwell hold boost clocks under a
  # sustained decode load. Check PSU headroom and case thermals before using this.
  sudo nvidia-smi -pl 600 && echo "power limit raised to 600 W"
  echo "Revert with: sudo nvidia-smi -pl 435"
fi

if [[ "$ACTION" == "lock" ]]; then
  MAXSM=$(nvidia-smi --query-gpu=clocks.max.sm --format=csv,noheader,nounits)
  sudo nvidia-smi -lgc "${MAXSM},${MAXSM}" && echo "graphics clocks LOCKED at ${MAXSM} MHz"
  echo "Release with: sudo nvidia-smi -rgc"
  echo "NOTE: locking trades peak boost for run-to-run comparability. Use it for the bench,"
  echo "release it afterwards - do not leave the card locked for normal use."
fi
