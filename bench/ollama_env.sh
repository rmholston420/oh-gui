#!/usr/bin/env bash
# Configure the Ollama server env via a systemd drop-in and PROVE it applied.
# `systemctl set-environment` does not reliably reach the service; a drop-in does.
#
#   bash bench/ollama_env.sh f16            # normal operating state - what benches run under
#   bash bench/ollama_env.sh q8             # flash attention + q8_0 KV (known no-op, see ADR-004)
#   bash bench/ollama_env.sh f16 debug      # same, but OLLAMA_DEBUG=1 to probe flash attention
#
# v4 (2026-08-08): targets the USER unit, not the system unit, and defaults flash attention
# to 0. Supersedes v3 - there is one path, do not keep a v3 copy.
#
#   WHY v3 WAS DANGEROUS. It wrote /etc/systemd/system/ollama.service.d/ and ran
#   `sudo systemctl restart ollama`. On this box a user unit at
#   ~/.config/systemd/user/ollama.service already held :11434, so that restart could never
#   bind: the system unit crash-looped 1260 times while the stray answered every request with
#   NO drop-in applied. Three benchmark runs were silently invalidated and the system unit has
#   since been removed entirely. See DEBUG_LOG 2026-08-08 06:55.
#
#   WHY FLASH ATTENTION IS NOW 0, NOT 1. v3 requested 1. It was measured to be irrelevant
#   here - FA=1 vs FA=0 on qwen3.6:27b @131072 with a 26,120-token prompt gave 25,509 vs
#   25,518 MiB and 2929.5 vs 2926.8 prefill tok/s (bench/fa_probe.sh, 2026-08-08). Since it
#   changes nothing measurable, the deciding argument is comparability: every round-1 cell ran
#   under FA=false, so 0 keeps round 2 comparable to results already scored. bench/lib/ollama.sh
#   enforces 0 and will refuse to run a bench under anything else.
set -euo pipefail
MODE="${1:-f16}"
DEBUG="${2:-}"
UNIT="$HOME/.config/systemd/user/ollama.service"
DIR="$HOME/.config/systemd/user/ollama.service.d"
FILE="$DIR/oh-gui.conf"

case "$MODE" in
  # q8_0 KV requires flash attention in llama.cpp, so this mode must set FA=1. That
  # deliberately violates the bench guard - see the warning printed at the end.
  q8)  KV=q8_0; FA=1 ;;
  f16) KV=f16;  FA=0 ;;
  *) echo "usage: $0 [q8|f16] [debug]"; exit 2 ;;
esac
[[ "$DEBUG" == "debug" ]] && DBG=1 || DBG=0

if [[ ! -f "$UNIT" ]]; then
  echo "FATAL: no user unit at $UNIT" >&2
  echo "  Ollama must run as a user unit reading \$HOME/.ollama/models. The system unit was" >&2
  echo "  removed on 2026-08-08 because it ran as User=ollama against" >&2
  echo "  /usr/share/ollama/.ollama/models, which holds only 6 of the models the matrix needs." >&2
  exit 1
fi

# Refuse to proceed if a system unit has reappeared - that is the collision, and configuring
# one unit while another holds the port is precisely how this went unnoticed for three weeks.
if systemctl cat ollama >/dev/null 2>&1; then
  echo "FATAL: a SYSTEM ollama.service exists again." >&2
  echo "  Two units will fight over :11434 and the loser crash-loops silently." >&2
  echo "  sudo systemctl disable --now ollama" >&2
  echo "  sudo mv /etc/systemd/system/ollama.service /etc/systemd/system/ollama.service.disabled" >&2
  echo "  sudo rm -rf /etc/systemd/system/ollama.service.d && sudo systemctl daemon-reload" >&2
  exit 1
fi

# WHY MAX_LOADED_MODELS=2 (not the Ollama default of 3-per-GPU, not 1):
#   The default of 3 is what let the scheduler hold the embedder resident alongside a role
#   model and then evict it non-deterministically (BUILD_LOG 2026-08-08).
#   1 would be wrong: the CPU-resident embedder occupies a model slot, so 1 would evict and
#   reload it on every planner<->coder switch.
#   2 = exactly one GPU role model + the CPU embedder. Enforces ADR-004's "planner and coder
#   are never co-resident" at the server, instead of trusting the router to call ollama stop.
# WHY NUM_PARALLEL=1:
#   Parallel slots divide the context window between them. Pinning to 1 guarantees a request
#   receives the whole num_ctx it asked for. The observed default on 0.30.7 is already 1;
#   pinning it removes any dependence on that default staying 1.
# WHY OLLAMA_MODELS IS SET EXPLICITLY:
#   An Ollama default never appears in /proc/<pid>/environ, so it cannot be verified from the
#   outside. On 2026-08-08 a server silently read the wrong store while `ollama list` looked
#   healthy. Setting it explicitly is what makes bench/lib/ollama.sh able to check it.
mkdir -p "$DIR"
cat > "$FILE" <<EOF
[Service]
Environment="OLLAMA_MODELS=$HOME/.ollama/models"
Environment="OLLAMA_FLASH_ATTENTION=$FA"
Environment="OLLAMA_KV_CACHE_TYPE=$KV"
Environment="OLLAMA_GPU_OVERHEAD=1073741824"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_DEBUG=$DBG"
EOF

systemctl --user daemon-reload
systemctl --user restart ollama
sleep 6

echo "== effective service environment =="
systemctl --user show ollama --property=Environment | tr ' ' '\n' | grep -i ollama || true

echo
echo "== guard verification (the only check that matters) =="
# Verify against the PROCESS, not the unit file. The unit file said one thing and the serving
# process did another for three weeks; only /proc/<pid>/environ is authoritative.
source "$(dirname "$0")/lib/ollama.sh"
if ollama_guard; then
  mapfile -t M < <(python3 "$(dirname "$0")/path_e/bench_path_e.py" models)
  ollama_require_models "${M[@]}" || true
fi

echo
echo "== startup lines mentioning flash attention / kv cache =="
journalctl --user -u ollama --since "1 min ago" --no-pager \
  | grep -iE "flash|kv.?cache|num_parallel|parallel|OLLAMA_(FLASH|KV|GPU_OVERHEAD|MAX_LOADED|NUM_PARALLEL)" \
  | tail -30 || echo "(none found)"

if [[ "$DBG" == "1" ]]; then
  echo
  echo "== DEBUG probe: load a model and capture the actual runner flags =="
  curl -s http://localhost:11434/api/chat -d \
    '{"model":"qwen3.6:35b-a3b-mtp-q4_K_M","messages":[{"role":"user","content":"hi"}],
      "stream":false,"options":{"num_ctx":32768,"num_predict":8}}' >/dev/null || true
  sleep 2
  journalctl --user -u ollama --since "1 min ago" --no-pager \
    | grep -iE "flash.?attn|flash attention|kv cache type|n_ctx|n_batch|n_parallel" | tail -25 \
    || echo "(no runner flags captured - raise with OLLAMA_DEBUG=2)"
fi

echo
echo "Requested: KV=$KV FA=$FA GPU_OVERHEAD=1GiB MAX_LOADED_MODELS=2 NUM_PARALLEL=1 DEBUG=$DBG"
if [[ "$FA" != "0" ]]; then
  echo
  echo "WARNING: mode '$MODE' sets OLLAMA_FLASH_ATTENTION=$FA."
  echo "  bench/lib/ollama.sh requires 0, so run_path_e.sh will REFUSE to run until you"
  echo "  revert with: bash bench/ollama_env.sh f16"
  echo "  That refusal is deliberate - q8 is an experiment, not a benchmarking state."
fi
echo
echo "Flash attention: the grep above finds nothing because the Ollama Go engine does not"
echo "log runner flags at any debug level. That is not evidence the setting failed to apply."
echo "MEASURED 2026-08-08 (bench/fa_probe.sh): FA=1 vs FA=0, qwen3.6:27b @131072, 26,120-token"
echo "prompt -> 25,509 vs 25,518 MiB (9 MiB, noise) and 2929.5 vs 2926.8 prefill tok/s (0.09%)."
echo "FA has no measurable effect here. This also explains q8_0 KV no-opping: llama.cpp"
echo "requires flash attention for KV quantisation, and FA is not engaging."
