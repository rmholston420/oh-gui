#!/usr/bin/env bash
# Which model does Ollama evict when MAX_LOADED_MODELS=2 is exceeded?
#
# WHY THIS EXISTS
#   ADR-005 proposed OLLAMA_MAX_LOADED_MODELS 2 -> 1 on the premise that the CPU-resident
#   embedder does not occupy a model slot. BUILD_LOG 2026-08-08 05:50 EDT had already MEASURED
#   that it does, so =1 would thrash the embedder on every role switch and the change was
#   retracted (ADR-005 Amendment #4).
#
#   That leaves the opposite risk unmeasured. With =2 and {embedder, planner} resident, loading
#   the coder must evict something. If the scheduler evicts the EMBEDDER, both role models end up
#   resident - 26,140 + 26,390 MiB at 131,072 against a 32,607 MiB card - which is the exact
#   co-residency ADR-004 forbids. If it evicts the PLANNER, =2 is a correct backstop.
#
#   num_ctx is deliberately SMALL (4096). At 131,072 the two role models cannot both fit
#   regardless of slot policy, so a VRAM failure would mask the scheduling answer. Shrinking the
#   context lets both physically fit, which isolates the question to LRU policy alone.
#
# READ-ONLY with respect to configuration: changes no env var, edits no unit, restarts nothing.
set -uo pipefail
cd "$(dirname "$0")/../.."
source bench/lib/gpu.sh
source bench/lib/ollama.sh

EP="${OLLAMA_ENDPOINT:-http://localhost:11434}"
EMBED=qwen3-embedding:4b
PLANNER=qwen3.6:27b
CODER=qwen3.6:35b-a3b-mtp-q4_K_M
CTX=4096
STAMP=$(date +%Y%m%d_%H%M)
OUT="$HOME/.oh-gui/oneoff/max_loaded_lru/$STAMP"
mkdir -p "$OUT"

ollama_guard "$OUT/ollama_provenance.txt" || exit 1
ollama_require_models "$EMBED" "$PLANNER" "$CODER" || exit 1

# gpu_guard aborts if the card is already too hot to start; gpu_watch_start installs the
# 1 Hz sampler AND its own EXIT/INT/TERM traps, including the hard cutout at GPU_MAX_C.
# Do not add a competing trap here - gpu_watch_start's traps are the enforcing ones.
gpu_guard
gpu_watch_start "$HOME/.oh-gui/thermal/${STAMP}_lru_probe.csv"

ps_snapshot() {  # $1 = label
  local j; j=$(curl -sf "$EP/api/ps")
  echo "$j" > "$OUT/ps_$1.json"
  echo "--- /api/ps after $1"
  python3 - "$j" <<'PY'
import json, sys
d = json.loads(sys.argv[1] or '{"models":[]}')
ms = d.get("models", [])
if not ms:
    print("   (nothing resident)")
for m in ms:
    vram = m.get("size_vram", 0)
    total = m.get("size", 0)
    where = "GPU" if vram else "CPU"
    print(f"   {m.get('name','?'):34s} {where}  size_vram={vram/1048576:.0f} MiB  "
          f"size={total/1048576:.0f} MiB")
print(f"   count={len(ms)}")
PY
}

load() {  # $1 = model, $2 = kind
  echo "loading $1 (num_ctx=$CTX) ..."
  if [ "$2" = "embed" ]; then
    curl -sf "$EP/api/embed" -d "$(python3 -c '
import json,sys; print(json.dumps({"model": sys.argv[1], "input": "slot probe",
  "options": {"num_ctx": 512}}))' "$1")" >/dev/null
  else
    curl -sf "$EP/api/chat" -d "$(python3 -c '
import json,sys; print(json.dumps({"model": sys.argv[1], "stream": False, "think": False,
  "messages": [{"role":"user","content":"ok"}],
  "options": {"num_ctx": int(sys.argv[2]), "num_predict": 1}}))' "$1" "$CTX")" >/dev/null
  fi
  local rc=$?
  [ "$rc" = "0" ] || { echo "  LOAD FAILED rc=$rc for $1" >&2; return 1; }
  # The 1 Hz watcher owns the hard cutout. Report the reading here so each step's temperature
  # appears inline in the transcript rather than only in the CSV.
  echo "  loaded; GPU $(gpu_temp)C"
  if gpu_aborted; then echo "  thermal cutout during load" >&2; return 1; fi
}

echo "== clearing all resident models =="
for m in "$EMBED" "$PLANNER" "$CODER"; do ollama stop "$m" >/dev/null 2>&1 || true; done
sleep 3
ps_snapshot 0_clear

echo; echo "== step 1: embedder only =="
load "$EMBED" embed || exit 1
ps_snapshot 1_embed

echo; echo "== step 2: + planner (should be 2 resident, at the limit) =="
load "$PLANNER" chat || exit 1
ps_snapshot 2_embed_planner

echo; echo "== step 3: + coder (limit exceeded - something must go) =="
load "$CODER" chat || exit 1
ps_snapshot 3_all_three

echo
echo "=============================== VERDICT ==============================="
python3 - "$OUT" "$EMBED" "$PLANNER" "$CODER" <<'PY'
import json, pathlib, sys
out, embed, planner, coder = pathlib.Path(sys.argv[1]), *sys.argv[2:5]
names = lambda f: {m["name"] for m in json.loads((out/f).read_text()).get("models", [])}
final = names("ps_3_all_three.json")
print(f"resident after step 3: {sorted(final) or '(none)'}")
both_roles = planner in final and coder in final
if both_roles:
    print("RESULT: BOTH ROLE MODELS RESIDENT - the scheduler evicted the embedder.")
    print("  =2 does NOT prevent role co-residency. The router MUST call `ollama stop` on the")
    print("  outgoing role model explicitly; MAX_LOADED_MODELS is not a sufficient backstop.")
    print("  At 131,072 this configuration would demand 52,530 MiB on a 32,607 MiB card.")
elif planner in final and embed in final:
    print("RESULT: coder did not displace the pair - inspect ps_3 manually.")
elif coder in final and embed in final:
    print("RESULT: the scheduler evicted the PLANNER and kept the embedder.")
    print("  =2 IS a correct backstop: exactly one role model plus the CPU embedder.")
else:
    print("RESULT: unexpected - inspect the ps_*.json files.")
print(f"\nartifacts: {out}")
PY
