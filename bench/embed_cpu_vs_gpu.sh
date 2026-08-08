#!/usr/bin/env bash
# Is qwen3-embedding:0.6b fast enough on CPU to give its 1.5 GB of VRAM back?
# Measures single-chunk latency and batch throughput, GPU vs CPU (num_gpu=0).
# Run after: bash bench/ollama_env.sh f16
set -uo pipefail

EMB=qwen3-embedding:0.6b
CTX=512
N=64          # chunks per batch trial
OUT=~/.oh-gui/embed_bench; mkdir -p "$OUT"
STAMP=$(date +%Y%m%d_%H%M)
CSV="$OUT/${STAMP}_embed_cpu_vs_gpu.csv"

unload_all() {
  curl -s http://localhost:11434/api/ps \
    | python3 -c 'import sys,json;[print(m["name"]) for m in json.load(sys.stdin).get("models",[])]' 2>/dev/null \
    | while read -r n; do [ -n "$n" ] && ollama stop "$n" >/dev/null 2>&1; done
}

echo "cpu_threads=$(nproc)  ram_gb=$(free -g | awk '/^Mem:/{print $2}')"
echo "placement,warm_load_s,single_ms,batch_${N}_s,chunks_per_s,vram_cost_mib,processor" | tee "$CSV"

for placement in gpu cpu; do
  if [ "$placement" = "cpu" ]; then NUMGPU=0; else NUMGPU=999; fi

  unload_all; sleep 3
  idle=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)

  python3 - "$EMB" "$CTX" "$NUMGPU" "$N" "$placement" "$CSV" "$idle" <<'PY'
import json,subprocess,sys,time,urllib.request
model,ctx,numgpu,n,placement,csv,idle = sys.argv[1],int(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4]),sys.argv[5],sys.argv[6],int(sys.argv[7])
URL="http://localhost:11434/api/embed"
# ~400-word chunk, representative of a retrieval unit
chunk=("The middleware owns the entire policy plane and mediates every policy-bearing "
       "call from the frontend to the OpenHands agent server. "*18)

def embed(inp):
    body=json.dumps({"model":model,"input":inp,"keep_alive":"10m",
                     "options":{"num_ctx":ctx,"num_gpu":numgpu}}).encode()
    r=urllib.request.Request(URL,data=body,headers={"Content-Type":"application/json"})
    t0=time.time()
    with urllib.request.urlopen(r,timeout=1800) as resp: resp.read()
    return time.time()-t0

warm=embed("warmup")
lat=[embed(chunk) for _ in range(5)]
single_ms=round(sorted(lat)[len(lat)//2]*1000,1)
bt=embed([chunk]*n)
cps=round(n/bt,1)

vram=int(subprocess.run(["nvidia-smi","--query-gpu=memory.used","--format=csv,noheader,nounits"],
                        capture_output=True,text=True).stdout.strip())
ps=subprocess.run(["ollama","ps"],capture_output=True,text=True).stdout
proc=[l for l in ps.splitlines() if "embedding" in l]
proc=" ".join(proc[0].split()[-3:-1]) if proc else "n/a"

row=f"{placement},{warm:.1f},{single_ms},{bt:.2f},{cps},{vram-idle},{proc}"
print(f"  {placement.upper():3}  warm={warm:.1f}s  single={single_ms}ms  "
      f"batch{n}={bt:.2f}s  {cps} chunks/s  vram_cost={vram-idle} MiB  [{proc}]")
open(csv,"a").write(row+"\n")
PY
done

unload_all
echo
echo "CSV: $CSV"
echo "Decision rule: if CPU single-chunk latency is under ~250 ms and batch throughput"
echo "clears ~20 chunks/s, move the embedder to CPU and reclaim ~1.5 GB of VRAM."
