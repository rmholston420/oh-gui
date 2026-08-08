#!/usr/bin/env bash
# Regression tests for gpu_cold_calibrate in bench/lib/gpu.sh.
#
# WHY THIS FILE EXISTS
# --------------------
# gpu_cold_calibrate replaced a fixed 45 C cold gate. It cannot be tested on Colossus
# without waiting for the card to actually cool, so it is tested here against a stubbed
# temperature sensor with a fake clock. Six scenarios, each with an exact expected gate.
#
# It also exists because the first attempt at this test was itself broken, and I misread
# that as a bug in gpu.sh. The fixture kept its sample index in a shell variable
# incremented inside the stub, but the caller invokes it as `t=$(gpu_temp)` - a command
# substitution, which runs in a SUBSHELL. The increment never reached the parent, so every
# reading returned SEQ[0], calibration correctly saw six identical samples, and correctly
# declared the curve settled. The function was right; the test was wrong. The counter now
# lives in a file for exactly that reason - do not "simplify" it back to a variable.
#
#     bash bench/tests/test_gpu_cold_calibrate.sh
#
# Exits non-zero on any failure.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAILURES=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export GPU_CALIB_MIN_S=30 GPU_CALIB_TIMEOUT_S=120 GPU_COLD_MARGIN_C=3 GPU_COLD_FALLBACK_C=45
# shellcheck source=/dev/null
source "$REPO/bench/lib/gpu.sh"

NOW=0
date() { echo "$NOW"; }                 # fake clock: no real waiting
sleep() { NOW=$((NOW + 5)); }           # each poll advances 5 simulated seconds

# Counter on disk, NOT in a variable - see the header comment.
SEQ=(); TAIL=44
gpu_temp() {
  local n; n=$(cat "$TMP/i"); echo $((n + 1)) > "$TMP/i"
  if [ "$n" -lt "${#SEQ[@]}" ]; then echo "${SEQ[$n]}"; else echo "$TAIL"; fi
}

run() {                                  # run <logfile>
  echo 0 > "$TMP/i"; NOW=0
  GPU_COLD_C=""; GPU_COLD_FLOOR_C=""
  gpu_cold_calibrate > "$1" 2>&1
}

expect() {                               # expect <desc> <want_gate> <want_floor|-> <log>
  local desc="$1" want_gate="$2" want_floor="$3" log="$4"
  if [ "$GPU_COLD_C" = "$want_gate" ] && { [ "$want_floor" = "-" ] || [ "$GPU_COLD_FLOOR_C" = "$want_floor" ]; }; then
    echo "  ok    $desc  (gate=$GPU_COLD_C floor=${GPU_COLD_FLOOR_C:--})"
  else
    echo "  FAIL  $desc"
    echo "          want gate=$want_gate floor=$want_floor"
    echo "          got  gate=$GPU_COLD_C floor=${GPU_COLD_FLOOR_C:--}"
    sed 's/^/          | /' "$log"
    FAILURES=$((FAILURES + 1))
  fi
}

expect_log() {                           # expect_log <desc> <pattern> <log>
  if grep -q "$2" "$3"; then
    echo "  ok    $1"
  else
    echo "  FAIL  $1 (pattern '$2' not in output)"
    sed 's/^/          | /' "$3"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "gpu_cold_calibrate"

# 1. The card is still cooling. Calibration must wait out the falling curve and settle on
#    the TRUE floor (44), not on the first reading (70). This is the whole point of the
#    function: a gate derived from a hot card is not a cold gate.
TAIL=44; SEQ=(70 66 62 58 54 50 47 45 44 44 44 44 44 44 44 44 44 44)
run "$TMP/l1"; expect "waits out a falling curve, settles on the true floor" 47 44 "$TMP/l1"

# 2. Already at idle. Should settle almost immediately at the observation minimum.
TAIL=41; SEQ=(41 41 41 41 41 41 41 41)
run "$TMP/l2"; expect "already-cold flat curve" 44 41 "$TMP/l2"

# 3. Real sensors jitter by a degree. A 1 C spread must count as settled, or calibration
#    would run to timeout on a perfectly idle card.
TAIL=44; SEQ=(50 49 48 47 46 45 44 45 44 44 45 44 44 44 45 44)
run "$TMP/l3"; expect "tolerates 1C sensor jitter" 47 44 "$TMP/l3"

# 4. Never settles (background load sawtooth). Must give up at the timeout, warn, and fall
#    back to the lowest temperature actually observed rather than hanging or inventing one.
TAIL=50; SEQ=(60 50 62 48 65 47 61 49 66 46 63 51 60 52 64 50 62 48 66 47 61 49 60 52 65 46 63 51 60 55 62 48)
run "$TMP/l4"; expect "sawtooth: uses lowest observed + margin" 49 46 "$TMP/l4"
expect_log "sawtooth: warns that the curve never settled" "never settled" "$TMP/l4"

# 5. Operator override must skip calibration entirely and be honoured verbatim.
echo 0 > "$TMP/i"; GPU_COLD_C=39; gpu_cold_calibrate > "$TMP/l5" 2>&1
expect "preset GPU_COLD_C is honoured" 39 "-" "$TMP/l5"
expect_log "preset skips calibration" "skipped" "$TMP/l5"

# 6. Dead/absent sensor must fall back to the documented default, not loop forever and not
#    set a gate from garbage. Colossus has already lost the fan tach and VRAM temp sensors,
#    so a missing reading is a real scenario, not a hypothetical.
gpu_temp() { echo "N/A"; }
run "$TMP/l6"; expect "dead sensor falls back to GPU_COLD_FALLBACK_C" 45 "-" "$TMP/l6"
expect_log "dead sensor warns" "no valid temperature" "$TMP/l6"

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES FAILURE(S)"
  exit 1
fi
echo "all calibration tests passed"
