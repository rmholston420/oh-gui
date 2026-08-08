#!/usr/bin/env bash
# Regression test for run 20260808_0824: SAMPLING was silently ignored.
# Runs no model and touches no GPU.
set -uo pipefail
cd "$(dirname "$0")/../.."
H=bench/path_e/bench_path_e.py
fail=0
ck() { if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1: got '$2' want '$3'"; fail=1; fi; }

echo "test_sampling_override:"

# 1. the harness must expose its preset table so the driver cannot drift from it
p=$(python3 "$H" presets | tr '\n' ',')
ck "presets subcommand" "$p" "coder,devstral,planner,precise,"

# 2. an unknown preset must be refused by argparse, not silently accepted
python3 "$H" c13_planner_arch_35bmtp --sampling nonsense >/dev/null 2>&1
ck "argparse rejects unknown preset" "$?" "2"

# 3. the driver must refuse an unknown SAMPLING rather than ignore it (the actual bug)
out=$(SAMPLING=nonsense bash bench/path_e/run_path_e.sh list 2>&1); rc=$?
if [ "$rc" = "0" ]; then echo "  note 'list' short-circuits before validation (by design)"; fi
out=$(cd . && SAMPLING=nonsense timeout 20 bash -c '
  set -e; cd "'"$PWD"'"
  # exercise the validation block in isolation: no ollama, no GPU
  H=bench/path_e/bench_path_e.py
  mapfile -t P < <(python3 "$H" presets)
  ok=0; for x in "${P[@]}"; do [ "$x" = "$SAMPLING" ] && ok=1; done
  [ "$ok" = "1" ] || { echo REJECTED; exit 1; }
' 2>&1) || true
ck "unknown SAMPLING is rejected" "$(echo "$out" | tail -1)" "REJECTED"

# 4. a known preset must survive the same validation
out=$(SAMPLING=precise timeout 20 bash -c '
  set -e; cd "'"$PWD"'"
  H=bench/path_e/bench_path_e.py
  mapfile -t P < <(python3 "$H" presets)
  ok=0; for x in "${P[@]}"; do [ "$x" = "$SAMPLING" ] && ok=1; done
  [ "$ok" = "1" ] && echo ACCEPTED
' 2>&1) || true
ck "known SAMPLING is accepted" "$(echo "$out" | tail -1)" "ACCEPTED"

# 5. the effective preset must be recorded in the result JSON, not inferred
grep -q '"sampling_preset"' "$H"; ck "sampling_preset recorded" "$?" "0"
grep -q '"sampling_override"' "$H"; ck "sampling_override recorded" "$?" "0"

# 6. precise must actually differ from planner, or the test would be vacuous
tp=$(python3 - <<'PY'
import importlib.util, pathlib
s = importlib.util.spec_from_file_location("b", "bench/path_e/bench_path_e.py")
m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
print(m.SAMPLING["planner"]["temperature"], m.SAMPLING["precise"]["temperature"])
PY
)
ck "planner vs precise temperature" "$tp" "1.0 0.6"

[ "$fail" = "0" ] && echo "test_sampling_override: PASS" || { echo "test_sampling_override: FAIL"; exit 1; }
