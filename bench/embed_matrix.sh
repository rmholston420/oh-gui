#!/usr/bin/env bash
# Embedding candidate matrix: model x placement (GPU / CPU via num_gpu=0).
# Decides the embedder BEFORE first index build - changing it later means re-embedding
# the whole corpus and migrating the vector-store dimension.
# Run after: bash bench/ollama_env.sh f16
set -uo pipefail
source "$(dirname "$0")/lib/gpu.sh"   # MANDATORY thermal instrumentation

CTX=512
N=64
# CPU placement is already ratified (ADR-004), so weight size is nearly free against
# 124 GB RAM. The live question is CPU latency on the QUERY path, which every agent
# retrieval step pays. MTEB-multilingual Retrieval subscore in comments (Qwen HF card).
CANDIDATES=(
  "qwen3-embedding:0.6b:32768:1024"   # retrieval 64.64  - current ratified choice
  "qwen3-embedding:4b:40960:2560"     # retrieval 69.60  - +4.96 over 0.6b
  "qwen3-embedding:8b:40960:4096"     # retrieval 70.88  - only +1.28 over 4b
  "nomic-embed-text:8192:768"         # different MTEB track, not directly comparable
)
PLACEMENTS_FOR_BIG="cpu"   # 4b/8b cannot share the GPU with the planner; CPU only
OUT=~/.oh-gui/embed_bench; mkdir -p "$OUT"
STAMP=$(date +%Y%m%d_%H%M)
CSV="$OUT/${STAMP}_embed_matrix.csv"

unload_all() {
  curl -s http://localhost:11434/api/ps \
    | python3 -c 'import sys,json;[print(m["name"]) for m in json.load(sys.stdin).get("models",[])]' 2>/dev/null \
    | while read -r n; do [ -n "$n" ] && ollama stop "$n" >/dev/null 2>&1; done
}

gpu_guard 80
gpu_watch_start
echo "cpu_threads=$(nproc)  ram_gb=$(free -g | awk '/^Mem:/{print $2}')  num_ctx=$CTX"
echo
echo "model,placement,dims,single_ms,batch_${N}_s,chunks_per_s,vram_cost_mib,processor,temp_c,power_w,sm_mhz,util_pct,throttle" > "$CSV"

for entry in "${CANDIDATES[@]}"; do
  model="${entry%:*:*}"; dims="${entry##*:}"
  if ! ollama show "$model" >/dev/null 2>&1; then
    echo "-- $model NOT PULLED, skipping.  Get it with: ollama pull $model"
    continue
  fi
  case "$model" in
    *:4b|*:8b) PLACEMENTS="$PLACEMENTS_FOR_BIG" ;;
    *)         PLACEMENTS="gpu cpu" ;;
  esac
  for placement in $PLACEMENTS; do
    [ "$placement" = cpu ] && NUMGPU=0 || NUMGPU=999
    unload_all; sleep 2
    idle=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
    python3 - "$model" "$CTX" "$NUMGPU" "$N" "$placement" "$CSV" "$idle" "$dims" "$(gpu_sample)" <<'PY'
import json,subprocess,sys,time,urllib.request
model,ctx,numgpu,n,placement,csv,idle,dims = sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4]),sys.argv[5],sys.argv[6],int(sys.argv[7]),sys.argv[8]
gpu=sys.argv[9]
URL="http://localhost:11434/api/embed"
chunk=("The middleware owns the entire policy plane and mediates every policy-bearing "
       "call from the frontend to the OpenHands agent server. "*18)
def embed(inp):
    body=json.dumps({"model":model,"input":inp,"keep_alive":"5m",
                     "options":{"num_ctx":ctx,"num_gpu":numgpu}}).encode()
    r=urllib.request.Request(URL,data=body,headers={"Content-Type":"application/json"})
    t0=time.time()
    with urllib.request.urlopen(r,timeout=1800) as resp: out=json.loads(resp.read())
    return time.time()-t0, out
try:
    embed("warmup")
    lat=[embed(chunk)[0] for _ in range(5)]
    single_ms=round(sorted(lat)[len(lat)//2]*1000,1)
    bt,out=embed([chunk]*n); cps=round(n/bt,1)
    real_dims=len(out["embeddings"][0]) if out.get("embeddings") else dims
    vram=int(subprocess.run(["nvidia-smi","--query-gpu=memory.used","--format=csv,noheader,nounits"],
             capture_output=True,text=True).stdout.strip())
    # Parse /api/ps JSON, not the `ollama ps` table. The table's UNTIL column is
    # multi-word, so positional slicing returned "minutes from" instead of the processor.
    # size_vram==0 is the authoritative signal that the model is on CPU.
    ps=json.loads(urllib.request.urlopen("http://localhost:11434/api/ps",timeout=30).read())
    ent=next((m for m in ps.get("models",[]) if m["name"].startswith(model.split(":")[0])),None)
    if ent is None: proc="not-resident"
    else:
        sv,tot=ent.get("size_vram",0),ent.get("size",1)
        proc="100% CPU" if sv==0 else ("100% GPU" if sv>=tot*0.99 else f"{round(100*(tot-sv)/tot)}% CPU")
    print(f"  {model:26} {placement.upper():3}  dims={real_dims:<5} single={single_ms:>7}ms  "
          f"batch{n}={bt:>6.2f}s  {cps:>6} chunks/s  vram={vram-idle:>5} MiB  [{proc}]  {gpu.split(',')[0]}C")
    open(csv,"a").write(f"{model},{placement},{real_dims},{single_ms},{bt:.2f},{cps},{vram-idle},{proc},{gpu}\n")
except Exception as e:
    print(f"  {model:26} {placement.upper():3}  ERROR: {e}")
PY
  done
  echo
done

unload_all
echo "CSV: $CSV"
echo
echo "== MRL dimension-truncation probe =="
echo "Qwen3-Embedding supports Matryoshka truncation (32..native). If Ollama honours a"
echo "'dimensions' request, a 4b/8b model can be stored at 1024 dims - same vector-store"
echo "size as 0.6b, higher quality. If not, truncate client-side and L2-renormalise."
for m in qwen3-embedding:4b qwen3-embedding:8b; do
  ollama show "$m" >/dev/null 2>&1 || continue
  for d in "" 1024; do
    body=$(python3 -c "
import json,sys
o={'num_ctx':512,'num_gpu':0}
b={'model':'$m','input':'probe','options':o}
if '$d': b['dimensions']=int('$d')
print(json.dumps(b))")
    got=$(curl -s -X POST http://localhost:11434/api/embed -H 'Content-Type: application/json' \
      -d "$body" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin); print(len(d['embeddings'][0]))
except Exception as e: print('err')")
    echo "  $m  dimensions=${d:-native}  -> returned $got"
  done
done
echo
echo "DECISION RULE (query path is what matters - every retrieval step pays it):"
echo "  <150 ms  keep/upgrade freely"
echo "  150-400 ms  acceptable; take the quality if the jump is >=3 retrieval points"
echo "  >400 ms  reject - agent loops retrieve repeatedly per task"
echo "Ingest cost is one-time and off-path; weight it far lower."
gpu_watch_stop
