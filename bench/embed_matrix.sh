#!/usr/bin/env bash
# Embedding candidate matrix: model x placement (GPU / CPU via num_gpu=0).
# Decides the embedder BEFORE first index build - changing it later means re-embedding
# the whole corpus and migrating the vector-store dimension.
# Run after: bash bench/ollama_env.sh f16
set -uo pipefail

CTX=512
N=64
CANDIDATES=(
  # model:ctx_cap:dims  (ctx_cap = model's own max; we still run at $CTX)
  "qwen3-embedding:0.6b:32768:1024"
  "nomic-embed-text:8192:768"
  "embeddinggemma:300m:2048:768"
)
OUT=~/.oh-gui/embed_bench; mkdir -p "$OUT"
STAMP=$(date +%Y%m%d_%H%M)
CSV="$OUT/${STAMP}_embed_matrix.csv"

unload_all() {
  curl -s http://localhost:11434/api/ps \
    | python3 -c 'import sys,json;[print(m["name"]) for m in json.load(sys.stdin).get("models",[])]' 2>/dev/null \
    | while read -r n; do [ -n "$n" ] && ollama stop "$n" >/dev/null 2>&1; done
}

echo "cpu_threads=$(nproc)  ram_gb=$(free -g | awk '/^Mem:/{print $2}')  num_ctx=$CTX"
echo
echo "model,placement,dims,single_ms,batch_${N}_s,chunks_per_s,vram_cost_mib,processor" > "$CSV"

for entry in "${CANDIDATES[@]}"; do
  model="${entry%:*:*}"; dims="${entry##*:}"
  if ! ollama show "$model" >/dev/null 2>&1; then
    echo "-- $model NOT PULLED, skipping.  Get it with: ollama pull $model"
    continue
  fi
  for placement in gpu cpu; do
    [ "$placement" = cpu ] && NUMGPU=0 || NUMGPU=999
    unload_all; sleep 2
    idle=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
    python3 - "$model" "$CTX" "$NUMGPU" "$N" "$placement" "$CSV" "$idle" "$dims" <<'PY'
import json,subprocess,sys,time,urllib.request
model,ctx,numgpu,n,placement,csv,idle,dims = sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4]),sys.argv[5],sys.argv[6],int(sys.argv[7]),sys.argv[8]
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
          f"batch{n}={bt:>6.2f}s  {cps:>6} chunks/s  vram={vram-idle:>5} MiB  [{proc}]")
    open(csv,"a").write(f"{model},{placement},{real_dims},{single_ms},{bt:.2f},{cps},{vram-idle},{proc}\n")
except Exception as e:
    print(f"  {model:26} {placement.upper():3}  ERROR: {e}")
PY
  done
  echo
done

unload_all
echo "CSV: $CSV"
echo
echo "Decision rule: keep qwen3-embedding:0.6b unless its CPU latency is unacceptable."
echo "It scores ~70.7 MTEB-eng-v2 vs ~62-64 for nomic-embed-text. On CPU the weight-size"
echo "advantage of nomic is nearly irrelevant (128 GB RAM); only latency justifies a swap."
