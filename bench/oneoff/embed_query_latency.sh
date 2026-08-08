#!/usr/bin/env bash
# embed_query_latency.sh — single-embed latency vs input length, CPU, qwen3-embedding:4b.
#
# WHY THIS EXISTS
#   ADR-004 A#2 recorded 161 ms per embed and 13.7 chunks/s for 4b at num_ctx 512.
#   bench/oneoff/embed_igpu_ab.sh (2026-08-08 07:21) measured 58.58 s for 64 chunks of
#   ~140 tokens on the same model and the same box = 915 ms/chunk, 1.09 chunks/s.
#   That is a ~12x disagreement recorded as an OPEN discrepancy in A#7.
#
#   Hypothesis under test: the gap is input length, not a regression. A#2's figure was taken
#   on short text; the A/B used ~140-token chunks. If latency scales with input tokens, both
#   numbers can be correct and the label "161 ms" is simply not a query-length figure.
#
#   The decision this feeds: whether CPU placement is user-VISIBLE at query time. Indexing
#   cost is amortised and irrelevant; a single query embed sits in the interactive path.
#
# PRE-REGISTERED BANDS (fixed before running — do not edit after seeing output)
#   At the query length band (16-64 tokens), median single-embed latency:
#     < 250 ms  -> not user-visible next to seconds of LLM generation.
#                  ADR-004 A#2 + A#7 stand unchanged. No further work.
#     250-500 ms -> borderline. Note it in A#7; revisit only if retrieval becomes the
#                  bottleneck in practice.
#     > 500 ms  -> user-visible. Reopen embedder placement, because the 39x GPU figure from
#                  A#7 then buys something real and the eviction risk must be weighed
#                  against a latency the operator can feel.
#
# PRE-REGISTERED PREDICTION (written before running)
#   Latency scales roughly linearly with input tokens, so the query band lands well under
#   250 ms and A#2's 161 ms is approximately reproducible at short input. Stated so it can
#   be wrong on the record.
#
# WHAT IT DOES NOT DO
#   Does not touch the bench server on 11434 and does not evict anything: it starts its own
#   throwaway instance on 11435. Outside the Path E matrix, per operator instruction.
#   CPU only — the discrete GPU is excluded from CUDA *and* Vulkan, because
#   CUDA_VISIBLE_DEVICES="" alone does not hide an NVIDIA card from the Vulkan loader
#   (see DEBUG_LOG 2026-08-08 07:22 EDT).
set -euo pipefail
cd "$(dirname "$0")/../.."
source bench/lib/gpu.sh          # MANDATORY: any script that runs a model watches the card

MODEL="${MODEL:-qwen3-embedding:4b}"
PORT="${PORT:-11435}"
REPS="${REPS:-9}"                # odd, so the median is a real sample
NUM_CTX="${NUM_CTX:-512}"        # matches ADR-004 A#2's condition
LENGTHS="${LENGTHS:-8 16 32 64 128 256 512}"   # approximate input tokens
STAMP="$(date +%Y%m%d_%H%M)"
OUT="$HOME/.oh-gui/oneoff/embed_query_latency/$STAMP"
mkdir -p "$OUT"

if ss -ltnH "sport = :${PORT}" | grep -q .; then
  echo "FATAL: port ${PORT} is already in use. Refusing to attach to an unknown server —" >&2
  echo "  that is how the three voided runs happened this morning." >&2
  ss -ltnpH "sport = :${PORT}" | sed 's/^/    /' >&2
  exit 1
fi

echo "model=${MODEL}  reps=${REPS}  num_ctx=${NUM_CTX}"
echo "lengths (approx input tokens): ${LENGTHS}"
echo "cpu: $(nproc) hardware threads"
echo "out: ${OUT}"

gpu_watch_start "$HOME/.oh-gui/thermal/${STAMP}_embed_query.csv"

LOG="$OUT/server.log"
CUDA_VISIBLE_DEVICES="" \
OLLAMA_VULKAN=0 \
OLLAMA_IGPU_ENABLE=0 \
OLLAMA_HOST="127.0.0.1:${PORT}" \
OLLAMA_MODELS="$HOME/.ollama/models" \
OLLAMA_KEEP_ALIVE=-1 \
OLLAMA_NUM_PARALLEL=1 \
  ollama serve >"$LOG" 2>&1 &
SRV=$!
cleanup() { kill "$SRV" 2>/dev/null || true; wait "$SRV" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:${PORT}/api/version" >/dev/null 2>&1 && break
  sleep 1
done
if ! curl -sf "http://127.0.0.1:${PORT}/api/version" >/dev/null 2>&1; then
  echo "FATAL: throwaway server on ${PORT} never became ready." >&2
  tail -20 "$LOG" >&2
  exit 1
fi

# Assert CPU, do not assume it. A silent GPU fallback would make this measurement worthless
# while producing entirely plausible numbers.
python3 - "$PORT" "$MODEL" "$NUM_CTX" <<'PY' >/dev/null
import json, sys, urllib.request
port, model, ctx = sys.argv[1], sys.argv[2], int(sys.argv[3])
req = urllib.request.Request(
    f"http://127.0.0.1:{port}/api/embed",
    data=json.dumps({"model": model, "input": "warm", "options": {"num_ctx": ctx}}).encode(),
    headers={"Content-Type": "application/json"})
urllib.request.urlopen(req, timeout=900).read()
PY
sleep 1
if grep -qiE 'inference compute.*(NVIDIA|RTX|CUDA|Vulkan)' "$LOG"; then
  echo "FATAL: this server did not select the CPU — measurement invalid." >&2
  grep -iE 'inference compute' "$LOG" | sed 's/^/    /' >&2
  exit 1
fi
echo "  device: $(grep -oE 'library=[a-zA-Z]+' "$LOG" | head -1) (asserted CPU)"

python3 - "$PORT" "$MODEL" "$REPS" "$NUM_CTX" "$OUT" $LENGTHS <<'PY'
import json, statistics, sys, time, urllib.request
from pathlib import Path

port, model, reps, ctx, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), Path(sys.argv[5])
lengths = [int(x) for x in sys.argv[6:]]

# ~1.3 tokens per word for English prose, so words = tokens / 1.3. Deliberately plain text:
# a repeated-word string would compress oddly under BPE and understate real work.
WORDS = ("the harness records power cap and thermal throttle state for every sample because a "
         "run that silently throttles produces plausible numbers and a wrong verdict which is "
         "the failure this bench exists to prevent so each field is parsed strictly and any "
         "unknown value raises rather than defaulting to false ").split()

def text_for(tok):
    n = max(1, int(round(tok / 1.3)))
    return " ".join((WORDS * ((n // len(WORDS)) + 1))[:n])

def embed(text):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/embed",
        data=json.dumps({"model": model, "input": text,
                         "options": {"num_ctx": ctx}}).encode(),
        headers={"Content-Type": "application/json"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=900) as r:
        body = json.loads(r.read().decode())
    return (time.perf_counter() - t0) * 1000.0, body

rows = []
print(f"\n{'tokens':>7s} {'words':>6s} {'median':>9s} {'min':>8s} {'max':>8s} {'ms/tok':>8s}")
print("-" * 52)
for tok in lengths:
    text = text_for(tok)
    embed(text)                      # discard: first call at a new length warms the graph
    ms = sorted(embed(text)[0] for _ in range(reps))
    med = statistics.median(ms)
    _, body = embed(text)
    dims = len(body["embeddings"][0]) if "embeddings" in body else len(body.get("embedding", []))
    # A row whose input approaches num_ctx is silently truncated by the server, so its
    # latency understates the real cost at that length. Flag it rather than reporting a
    # number that looks like a measurement but is a ceiling.
    truncated = tok >= ctx * 0.9
    rows.append({"approx_tokens": tok, "words": len(text.split()), "ctx_limited": truncated,
                 "median_ms": round(med, 1), "min_ms": round(ms[0], 1),
                 "max_ms": round(ms[-1], 1), "all_ms": [round(x, 1) for x in ms],
                 "dims": dims})
    print(f"{tok:>7d} {len(text.split()):>6d} {med:>8.1f}ms {ms[0]:>7.1f}ms "
          f"{ms[-1]:>7.1f}ms {med/tok:>7.2f}"
          + ("   <- at/over num_ctx, input truncated: not a valid length measurement" if truncated else ""))

(out / "results.json").write_text(json.dumps(
    {"model": model, "num_ctx": ctx, "reps": reps, "device": "cpu", "rows": rows}, indent=2))

by_tok = {r["approx_tokens"]: r["median_ms"] for r in rows if not r["ctx_limited"]}
band = [r["median_ms"] for r in rows
        if 16 <= r["approx_tokens"] <= 64 and not r["ctx_limited"]]
q = statistics.median(band) if band else None

print("\n=== interpretation ===")
if q is not None:
    print(f"query band (16-64 tok) median: {q:.1f} ms")
    if q < 250:
        print("  VERDICT: NOT user-visible. ADR-004 A#2 and A#7 stand unchanged.")
    elif q <= 500:
        print("  VERDICT: borderline. Note in A#7; revisit only if retrieval is the bottleneck.")
    else:
        print("  VERDICT: user-VISIBLE. Reopen embedder placement — the 39x GPU figure now buys")
        print("           something real and must be weighed against eviction risk.")

# Resolve the A#2 vs A#7 discrepancy explicitly rather than leaving it to the reader.
short = by_tok.get(8) or by_tok.get(16)
long_ = by_tok.get(128)
print("\n=== A#2 (161 ms) vs A#7 (915 ms/chunk) ===")
if short:
    print(f"  shortest input measured here: {short:.1f} ms  (A#2 claimed 161 ms)")
if long_:
    print(f"  ~140-token input:             {long_:.1f} ms  (A#7 measured 915 ms/chunk)")
if short and long_:
    print(f"  ratio across that range:      {long_/short:.1f}x")
    print("  If this ratio is close to the ~12x A#7 flagged, LENGTH explains the discrepancy")
    print("  and both figures were correct for their own input size. If it is not, something")
    print("  other than input length differs and the discrepancy stays OPEN.")
PY

gpu_watch_stop
echo
echo "results: $OUT/results.json"
echo "NOTE: numbers above are CPU single-embed latency. They say nothing about indexing"
echo "  throughput, which is amortised and was measured in bench/oneoff/embed_igpu_ab.sh."
