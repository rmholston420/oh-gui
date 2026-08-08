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
#   v1 (run 20260808_0850) was INCONCLUSIVE for two reasons, both fixed here:
#     (a) It omitted "num_gpu": 0 on the embed call, so the embedder loaded onto the GPU at
#         2,754 MiB instead of CPU-resident at 0. Evicting a GPU-resident embedder frees real
#         VRAM, which is exactly the slot-policy/VRAM-pressure confound this probe exists to
#         remove. ADR-004 A#2 places the embedder on CPU; the probe must reproduce that.
#     (b) Its stated rationale - that num_ctx=4096 lets both role models fit, isolating slot
#         policy - was false. Measured at 4096: 20,364 + 25,578 = 45,942 MiB against a
#         32,607 MiB card. WEIGHTS dominate at every context, so the two role models can never
#         co-reside on this card at any num_ctx. Small num_ctx is still correct (it minimises
#         KV noise) but it does NOT isolate slot policy, and claiming it did was arithmetic
#         asserted rather than computed.
#
#   WHAT MAKES THE TEST CLEAN INSTEAD
#     With the embedder CPU-resident, size_vram == 0, so evicting it frees ZERO VRAM. If it is
#     evicted anyway, only the slot limit can be responsible. That is the discriminator, not
#     the context size. This script now HARD-FAILS if step 1 does not show size_vram == 0,
#     because every conclusion below depends on that placement.
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
    # num_gpu:0 forces CPU placement per ADR-004 A#2. Omitting it in v1 is what invalidated
    # run 20260808_0850 - the embedder went to the GPU at 2,754 MiB.
    curl -sf "$EP/api/embed" -d "$(python3 -c '
import json,sys; print(json.dumps({"model": sys.argv[1], "input": "slot probe",
  "options": {"num_ctx": 512, "num_gpu": 0}}))' "$1")" >/dev/null
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

echo; echo "== step 1: embedder only (MUST be CPU-resident) =="
load "$EMBED" embed || exit 1
ps_snapshot 1_embed
# Refuse loudly rather than produce an uninterpretable verdict. Every conclusion in this probe
# depends on the embedder holding 0 VRAM, so that a slot eviction cannot be confused with a
# VRAM eviction. This is the check whose absence made v1 worthless.
python3 - "$OUT/ps_1_embed.json" "$EMBED" <<'GATE' || exit 1
import json, pathlib, sys
ms = json.loads(pathlib.Path(sys.argv[1]).read_text()).get("models", [])
m = next((x for x in ms if x["name"] == sys.argv[2]), None)
if m is None:
    print(f"ABORT: {sys.argv[2]} is not resident after the embed call.", file=sys.stderr)
    sys.exit(1)
v = m.get("size_vram", 0)
if v:
    print(f"ABORT: embedder is GPU-resident ({v/1048576:.0f} MiB), expected CPU (0 MiB).\n"
          "  num_gpu:0 did not take effect. Evicting a GPU-resident embedder frees real VRAM,\n"
          "  so a slot eviction could not be distinguished from a VRAM eviction and the run\n"
          "  would be uninterpretable - this is how run 20260808_0850 was wasted.",
          file=sys.stderr)
    sys.exit(1)
print("   OK: embedder CPU-resident, size_vram=0 - evicting it would free zero VRAM.")
GATE

echo; echo "== step 2: + planner (should be 2 resident, at the limit) =="
load "$PLANNER" chat || exit 1
ps_snapshot 2_embed_planner

echo; echo "== step 3: + coder (limit exceeded - something must go) =="
load "$CODER" chat || exit 1
ps_snapshot 3_all_three

echo
echo; echo "== step 4: the CORRECT router sequence =="
# Steps 1-3 deliberately exercised the sequence ADR-005 FORBIDS: load a second role model while
# the first is still resident. Under OLLAMA_KEEP_ALIVE=-1 nothing auto-unloads, so the router is
# required to `ollama stop` the outgoing role model first. On that path resident goes
# {embedder} -> load coder = 2 entries, AT the limit but not over it, so nothing should be evicted
# and the embedder should never churn. That is a prediction; this step executes it.
for m in "$EMBED" "$PLANNER" "$CODER"; do ollama stop "$m" >/dev/null 2>&1 || true; done
sleep 3
load "$EMBED" embed || exit 1
load "$PLANNER" chat || exit 1
ps_snapshot 4a_embed_planner
echo "explicit: ollama stop $PLANNER   (what the router is required to do)"
ollama stop "$PLANNER" >/dev/null 2>&1 || true
sleep 2
ps_snapshot 4b_after_stop
load "$CODER" chat || exit 1
ps_snapshot 4c_after_correct_switch

echo "=============================== VERDICT ==============================="
python3 - "$OUT" "$EMBED" "$PLANNER" "$CODER" <<'VERDICT'
import json, pathlib, sys
out = pathlib.Path(sys.argv[1]); embed, planner, coder = sys.argv[2:5]
final = {m["name"]: m.get("size_vram", 0)
         for m in json.loads((out / "ps_3_all_three.json").read_text()).get("models", [])}
print(f"resident after step 3: {sorted(final) or '(none)'}")
print()
if embed in final and planner not in final and coder in final:
    print("RESULT: the slot limit evicted the PLANNER and KEPT the CPU embedder.")
    print("  Evicting the embedder would have freed 0 MiB, so the scheduler is not blindly")
    print("  VRAM-greedy: =2 behaves as intended - one GPU role model plus the CPU embedder.")
elif embed not in final and coder in final:
    print("RESULT: the CPU embedder was EVICTED despite holding 0 MiB of VRAM.")
    print("  Freeing it bought nothing, so only the slot limit explains it. =2 does NOT reserve")
    print("  a slot for the embedder; it will reload on every role switch. Options: raise to 3")
    print("  (which permits two GPU role models by slot policy - harmless here only because the")
    print("  VRAM ceiling forbids it anyway), or accept the reload and measure its cost.")
elif coder not in final:
    print("RESULT: the coder is not resident - the load failed or was unloaded immediately.")
    print("  Inspect the ps_*.json files; draw no slot-policy conclusion from this.")
else:
    print("RESULT: unexpected combination - inspect the ps_*.json files.")
print()
print("--- step 4: the correct router sequence (stop outgoing, then load incoming) ---")
after = {m["name"]: m.get("size_vram", 0)
         for m in json.loads((out / "ps_4c_after_correct_switch.json").read_text()).get("models", [])}
print(f"resident after the correct switch: {sorted(after) or '(none)'}")
if embed in after and coder in after and planner not in after:
    print("  CONFIRMED: the embedder SURVIVES a stop-then-load role switch.")
    print("  The churn seen in step 3 is caused by the FORBIDDEN sequence, not by =2. With the")
    print("  router honouring `ollama stop`, resident never exceeds the limit and =2 is correct")
    print("  as it stands - no change to OLLAMA_MAX_LOADED_MODELS is warranted.")
elif embed not in after:
    print("  REFUTED: the embedder was evicted even on the correct sequence.")
    print("  =2 cannot hold one role model plus the embedder in practice. Raising to 3 is then")
    print("  justified, since the VRAM ceiling already forbids role co-residency independently.")
else:
    print("  unexpected - inspect ps_4*.json before concluding.")
print()
print("Independent of slot policy, measured in run 20260808_0850 at num_ctx=4096:")
print("  planner 20,364 MiB + coder 25,578 MiB = 45,942 MiB vs a 32,607 MiB card.")
print("  Weights dominate at every context, so the two role models can NEVER co-reside on this")
print("  card. MAX_LOADED_MODELS is therefore NOT what prevents co-residency - the VRAM ceiling")
print("  is. What the setting actually governs is reload churn.")
print(f"\nartifacts: {out}")
VERDICT
