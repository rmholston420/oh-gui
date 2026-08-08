#!/usr/bin/env bash
# One-off: does the Raphael iGPU beat the CPU for the embedder? (ADR-004 A#2)
#
# NOT part of the Path E matrix. Deliberately outside it: this measures a component that
# supports the bench rather than a candidate being benched, and it must never appear in a
# planner/coder verdict.
#
#   bash bench/oneoff/embed_igpu_ab.sh
#
# WHY THIS EXISTS
#   Every cell in round 1 failed debug question C, and the suspected cause is the embedder
#   being evicted from the 5090's 32 GB between the 65536 and 131072 context rows. Moving it
#   off the discrete card removes that contention. The CPU already achieves that isolation,
#   so the ONLY open question is whether the iGPU is faster than the CPU - not whether it
#   frees VRAM, which both options do equally.
#
#   Prior expectation, recorded before measuring: the CPU wins. Raphael's iGPU is a 2-CU
#   RDNA2 part that Ollama itself reports as compute=0.0, against 12 Zen4 cores with
#   AVX-512 sharing the same DDR5 bandwidth. If the measurement contradicts this, the
#   measurement wins - but the prediction is written down so it cannot be quietly revised.
#
# METHOD
#   Two throwaway ollama instances on port 11435, run sequentially, each with the discrete
#   GPU hidden (CUDA_VISIBLE_DEVICES=""). Arm 1 is CPU-only. Arm 2 adds OLLAMA_IGPU_ENABLE=1.
#   The bench server on 11434 is never touched, never stopped, and keeps its resident model.
#
#   The device each arm ACTUALLY used is read back from the instance log, because asking for
#   the iGPU and getting the CPU silently is the obvious way for this test to lie.
set -euo pipefail
cd "$(dirname "$0")/../.."
source bench/lib/gpu.sh          # MANDATORY: any script that runs a model watches the card

MODEL="${EMBED_MODEL:-qwen3-embedding:4b}"
PORT=11435
REPS="${REPS:-3}"
STAMP=$(date +%Y%m%d_%H%M)
OUT="$HOME/.oh-gui/oneoff/embed_igpu_ab/${STAMP}"
mkdir -p "$OUT"

if ss -ltnH "sport = :${PORT}" 2>/dev/null | grep -q .; then
  echo "FATAL: :${PORT} is already in use. This script needs it for its own instances." >&2
  echo "  ss -ltnp \"sport = :${PORT}\"" >&2
  exit 1
fi

# The workload: enough distinct chunks to be dominated by compute rather than startup, sized
# like the wiki/graph chunks this embedder actually serves in Axiom.
python3 - "$OUT/inputs.json" <<'PY'
import json, sys
para = ("Hexagonal architecture separates the domain from its adapters through explicit "
        "ports, so an adapter may be replaced without the domain observing the change. ")
# 64 chunks of ~120 tokens each - representative of real chunk size, not a microbenchmark.
docs = [f"Chunk {i}. " + para * 6 for i in range(64)]
json.dump(docs, open(sys.argv[1], "w"))
print(f"{len(docs)} chunks, ~{sum(len(d.split()) for d in docs)} words total")
PY

gpu_watch_start "$HOME/.oh-gui/thermal/${STAMP}_embed_ab.csv"

run_arm() {                              # run_arm <arm> <igpu_enable>
  local arm="$1" igpu="$2" log="$OUT/${arm}_server.log" pid
  echo
  echo "================ arm: ${arm} (OLLAMA_IGPU_ENABLE=${igpu}) ================"

  # Discrete GPU hidden from BOTH arms. Without this the 5090 would serve the model and the
  # comparison would measure nothing at all.
  #
  # CUDA_VISIBLE_DEVICES="" alone is NOT sufficient: NVIDIA cards also expose a Vulkan device,
  # so with OLLAMA_VULKAN=1 the 5090 could still be selected through the Vulkan backend and
  # the "cpu" arm would silently be a 5090 arm. Vulkan is therefore enabled ONLY for the iGPU
  # arm, which needs it, and the device actually chosen is asserted after the run either way.
  local vulkan=0
  [ "$igpu" = "1" ] && vulkan=1

  CUDA_VISIBLE_DEVICES="" \
  OLLAMA_IGPU_ENABLE="$igpu" \
  OLLAMA_VULKAN="$vulkan" \
  OLLAMA_HOST="127.0.0.1:${PORT}" \
  OLLAMA_KEEP_ALIVE=-1 \
  OLLAMA_NUM_PARALLEL=1 \
    ollama serve > "$log" 2>&1 &
  pid=$!

  local i
  for i in $(seq 1 60); do
    curl -sf "http://127.0.0.1:${PORT}/api/version" >/dev/null 2>&1 && break
    sleep 1
  done
  if ! curl -sf "http://127.0.0.1:${PORT}/api/version" >/dev/null 2>&1; then
    echo "FATAL: arm ${arm} server never became ready. Tail of log:" >&2
    tail -20 "$log" >&2
    kill "$pid" 2>/dev/null || true
    return 1
  fi

  python3 - "$OUT/inputs.json" "$OUT/${arm}.json" "$MODEL" "$PORT" "$REPS" "$arm" <<'PY'
import json, sys, time, urllib.request

inputs, outp, model, port, reps, arm = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]), sys.argv[6]
docs = json.load(open(inputs))

def embed(batch):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/embed",
        data=json.dumps({"model": model, "input": batch}).encode(),
        headers={"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=1200) as r:
        body = json.loads(r.read().decode())
    return body, time.time() - t0

# Warm the model in first; a cold load would otherwise be charged to rep 1 and inflate it.
_, load_s = embed(docs[:1])
print(f"  warm load: {load_s:.2f}s")

runs = []
for rep in range(1, reps + 1):
    body, wall = embed(docs)
    toks = body.get("prompt_eval_count") or 0
    n = len(body.get("embeddings", []))
    dims = len(body["embeddings"][0]) if n else 0
    runs.append({"rep": rep, "wall_s": round(wall, 3), "prompt_tokens": toks,
                 "chunks": n, "dims": dims,
                 "chunks_per_s": round(n / wall, 2) if wall else 0,
                 "tok_per_s": round(toks / wall, 2) if wall and toks else None})
    print(f"  rep {rep}: {wall:.2f}s  {n} chunks  {runs[-1]['chunks_per_s']} chunks/s"
          + (f"  {runs[-1]['tok_per_s']} tok/s" if runs[-1]["tok_per_s"] else ""))

walls = sorted(r["wall_s"] for r in runs)
median = walls[len(walls) // 2]
json.dump({"arm": arm, "model": model, "load_s": round(load_s, 3),
           "median_wall_s": median, "runs": runs,
           "dims": runs[0]["dims"] if runs else 0}, open(outp, "w"), indent=2)
print(f"  median wall: {median:.2f}s   dims: {runs[0]['dims'] if runs else 0}")
PY

  # Read back what the server actually used. An arm that asked for the iGPU and silently got
  # the CPU would otherwise report a plausible-looking result.
  echo "  device selected by this arm:"
  grep -iE "inference compute|dropping integrated|offloaded|library=" "$log" \
    | sed 's/^/    /' | tail -5 || echo "    (nothing matched in log)"

  # Assert, do not merely display. A silent fallback to the discrete card would produce
  # entirely plausible numbers and a wrong verdict - which is the failure mode this project
  # has hit repeatedly today. Fail loudly instead.
  if grep -qiE "inference compute.*(NVIDIA|RTX|CUDA)" "$log"; then
    echo "FATAL: arm ${arm} selected the DISCRETE GPU - this measurement is invalid." >&2
    grep -iE "inference compute" "$log" | sed 's/^/    /' >&2
    kill "$pid" 2>/dev/null || true
    return 1
  fi
  if [ "$arm" = "igpu" ] && ! grep -qiE "inference compute.*(Vulkan|RADV|Raphael)" "$log"; then
    echo "WARNING: the igpu arm does NOT appear to have used the iGPU. It likely fell back to" >&2
    echo "  CPU, in which case this arm duplicates the cpu arm and the comparison is void." >&2
    grep -iE "inference compute|dropping integrated|igpu" "$log" | sed 's/^/    /' >&2
  fi

  curl -sf -X POST "http://127.0.0.1:${PORT}/api/generate" \
    -d "{\"model\":\"${MODEL}\",\"keep_alive\":0}" >/dev/null 2>&1 || true
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  sleep 3
}

run_arm cpu  0
run_arm igpu 1

gpu_watch_stop

echo
echo "== comparison =="
python3 - "$OUT" <<'PY'
import json, sys
from pathlib import Path
out = Path(sys.argv[1])
arms = {}
for name in ("cpu", "igpu"):
    f = out / f"{name}.json"
    if f.exists():
        arms[name] = json.load(open(f))
if len(arms) < 2:
    print("INCOMPLETE: only", list(arms), "- no verdict")
    raise SystemExit(0)
c, g = arms["cpu"]["median_wall_s"], arms["igpu"]["median_wall_s"]
print(f"  cpu   median {c:.2f}s")
print(f"  igpu  median {g:.2f}s")
if arms["cpu"]["dims"] != arms["igpu"]["dims"]:
    print(f"  WARNING: dims differ ({arms['cpu']['dims']} vs {arms['igpu']['dims']}) - not comparable")
speedup = c / g if g else 0
print(f"  igpu is {speedup:.2f}x the cpu ({'faster' if speedup > 1 else 'SLOWER'})")
# 10% is the band below which this is not worth a second serving instance to maintain.
if speedup < 1.10:
    print("  VERDICT: keep the embedder on CPU. ADR-004 A#2 stands unchanged.")
    print("  The iGPU offers no speed gain, and CPU already removes it from the 5090.")
else:
    print("  VERDICT: iGPU wins. Amend ADR-004 A#2 and add a dedicated :11435 instance.")
PY
echo "results: $OUT"
