#!/usr/bin/env bash
# Emit every cell's stripped output in a form that can be pasted back for scoring
# against bench/gold/{debug,arch,plan}.md.
#
#   bash bench/path_e/dump_for_scoring.sh ~/.oh-gui/bench_path_e/20260808_0530_run
#
# Reasoning traces are EXCLUDED. The gold answers score the final answer only, and the
# agent loop discards think blocks - scoring them would reward models for verbose
# reasoning that never reaches the user.
set -euo pipefail
RUN_DIR="${1:?usage: dump_for_scoring.sh <run_dir>}"
[[ -d "$RUN_DIR" ]] || { echo "no such run dir: $RUN_DIR" >&2; exit 1; }
OUT="$RUN_DIR/dump_$(date +%Y%m%d_%H%M).txt"

python3 - "$RUN_DIR" <<'PY' | tee "$OUT"
import json, sys
from pathlib import Path
run = Path(sys.argv[1])
files = sorted(run.glob("c*.json"))
if not files:
    sys.exit("no cell JSON files found")

print("=" * 78)
print("PATH E - CELL OUTPUTS FOR SCORING")
print("Score each task 0-100 against bench/gold/<task>.md using the weights stated in")
print("that gold file. Quality first; speed only breaks ties within 3 points.")
print("=" * 78)

summary = []
for f in files:
    d = json.loads(f.read_text())
    print(f"\n\n{'#'*78}\n# CELL {d['cell_id']}")
    print(f"# model={d['model_id']}  role={d['role']}  ctx={d['num_ctx']}  "
          f"think={d['think']}  cap={d.get('power_cap_w')}W")
    print(f"# sampling={d['sampling']}")
    if d.get("cold_start_ok") is False:
        print(f"# WARNING: cell started at {d.get('gpu_at_start',{}).get('temp_c','?')}C, "
              f"above the {d.get('cold_start_target_c')}C cold target - "
              f"timings not comparable with cold-started cells.")
    print('#'*78)
    for r in d["results"]:
        if "error" in r:
            print(f"\n--- task={r['task']}  ERROR: {r['error']}")
            summary.append((d["cell_id"], r["task"], None, None, "ERROR"))
            continue
        note = "" if r.get("valid") else f"   {r.get('validity_note')}"
        print(f"\n--- task={r['task']}  out={r['output_tokens']}tok  "
              f"decode={r['decode_tok_s']}tok/s  prefill={r['prefill_tok_s']}tok/s  "
              f"wall={r['wall_seconds']}s  "
              f"gpu={r['gpu_at_finish'].get('temp_c','?')}C  "
              f"done={r['done_reason']}{note}")
        if r.get("think_flag_honored") is False:
            print("    NOTE: think=false was NOT honored - model emitted reasoning anyway.")
        if r["done_reason"] == "length":
            print("    NOTE: hit num_predict - answer is TRUNCATED, score accordingly.")
        print()
        print(r["content_stripped"])
        summary.append((d["cell_id"], r["task"], r["decode_tok_s"],
                        r["output_tokens"], r["done_reason"]))

print("\n\n" + "=" * 78)
print("SPEED TABLE (quality is scored separately and outranks this)")
print("=" * 78)
print(f"{'cell':38s} {'task':6s} {'tok/s':>8s} {'out':>7s}  done")
for cid, task, tps, out, done in summary:
    print(f"{cid:38s} {task:6s} {str(tps):>8s} {str(out):>7s}  {done}")
PY

echo
echo "dump: $OUT"
