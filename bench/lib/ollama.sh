# shellcheck shell=bash
# Ollama server-identity and configuration guard.
#
# WHY THIS FILE EXISTS
# --------------------
# On 2026-08-08 every benchmark run of the day was served by a stray
# `/usr/local/bin/ollama serve` (PID 3218, started ~01:59, parent 2857) that systemd did
# not launch. It held 127.0.0.1:11434, so `ollama.service` could never bind and had
# crash-looped 1260 times. The service's drop-ins - oh-gui.conf and override.conf - were
# therefore never in effect, and the bench was talking to a server with DEFAULT
# OLLAMA_NUM_PARALLEL, OLLAMA_FLASH_ATTENTION and OLLAMA_KEEP_ALIVE.
#
# Nothing failed loudly. `curl /api/version` answered 200, every cell produced plausible
# tok/s, and the numbers looked fine. They were not wrong so much as uninterpretable: KV
# footprint and throughput both depend on those variables, and ADR-004's VRAM envelope was
# measured through the service, so the capacity data and the bench described two different
# configurations.
#
# The tell was visible the whole time and nobody looked: override.conf sets
# OLLAMA_HOST=0.0.0.0:11434, but `ss -ltnp` showed the listener on 127.0.0.1 - Ollama's
# default. A single comparison would have caught it before any run.
#
# This guard makes that comparison mandatory and fails CLOSED. There is deliberately no
# override flag: a run served by an unverified process is not a cheaper run, it is a run
# whose numbers cannot be used, which is worse than no run at all.

# Settings whose absence changes VRAM footprint or throughput, and therefore comparability.
# OLLAMA_CONTEXT_LENGTH is deliberately NOT here - the harness sets num_ctx per request.
# OLLAMA_MODELS is required EXPLICITLY, not left to Ollama's default. On 2026-08-08 a
# server reading /usr/share/ollama/.ollama/models answered on :11434 while the full 116 GB
# matrix lived in ~/.ollama/models - nine of thirteen cells were simply absent, and
# `ollama list` looked plausible because the six models it did have were real. A default
# never appears in /proc/environ, so demanding it be set is what makes it verifiable.
declare -A OLLAMA_REQUIRED_ENV=(
  [OLLAMA_MODELS]="${OLLAMA_EXPECT_MODELS:-$HOME/.ollama/models}"
  [OLLAMA_FLASH_ATTENTION]="0"
  [OLLAMA_KV_CACHE_TYPE]="f16"
  [OLLAMA_NUM_PARALLEL]="1"
  [OLLAMA_MAX_LOADED_MODELS]="2"
  [OLLAMA_KEEP_ALIVE]="-1"
  [OLLAMA_GPU_OVERHEAD]="1073741824"
)

OLLAMA_PORT="${OLLAMA_PORT:-11434}"

# --- overridable probes (stubbed by bench/tests/test_ollama_guard.sh) --------------

# PID of whatever process is listening on OLLAMA_PORT. Filters on the port FIRST; an
# earlier version of this check grepped `pid=` across all of `ss` output and reported an
# unrelated listener, which is how a wrong PID got investigated for two minutes.
_ollama_listen_pid() {
  ss -ltnpH "sport = :${OLLAMA_PORT}" 2>/dev/null \
    | grep -oP '(?<=pid=)\d+' | head -1
}

# Ollama may legitimately be a USER unit (~/.config/systemd/user/ollama.service) or a
# SYSTEM unit. On Colossus both existed simultaneously, which is how the collision arose.
# Check the user scope first, since that is the one owning the model store; fall back to
# the system scope. OLLAMA_SCOPE records which answered, for error messages.
OLLAMA_SCOPE=""
_ollama_main_pid() {
  local pid
  pid="$(systemctl --user show ollama --property=MainPID --value 2>/dev/null)"
  if [ -n "$pid" ] && [ "$pid" != "0" ]; then
    OLLAMA_SCOPE="--user"
    echo "$pid"
    return 0
  fi
  OLLAMA_SCOPE="system"
  systemctl show ollama --property=MainPID --value 2>/dev/null
}

_ollama_tags() {
  curl -sf --max-time 10 "http://127.0.0.1:${OLLAMA_PORT}/api/tags" 2>/dev/null \
    | python3 -c 'import json,sys
try: [print(m["name"]) for m in json.load(sys.stdin).get("models", [])]
except Exception: pass'
}

# Verify every model the run needs is actually resolvable on the serving instance. The env
# check above proves the store PATH is right; this proves its CONTENTS are. Both are needed:
# a correct path with a half-populated store fails cell 3 of 13 after 40 minutes of heat.
ollama_require_models() {                # ollama_require_models <model_id>...
  local have missing=() m
  have="$(_ollama_tags)"
  if [ -z "$have" ]; then
    echo "FATAL: :${OLLAMA_PORT}/api/tags returned no models." >&2
    return 1
  fi
  for m in "$@"; do
    printf '%s\n' "$have" | grep -qxF "$m" || missing+=("$m")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "FATAL: the serving ollama is missing ${#missing[@]} model(s) the matrix needs:" >&2
    printf '  %s\n' "${missing[@]}" >&2
    echo "  Store in use: $(_ollama_environ "$(_ollama_listen_pid)" | grep '^OLLAMA_MODELS=' || echo 'OLLAMA_MODELS unset (Ollama default)')" >&2
    echo "  Check both stores before pulling anything - the weights may already exist:" >&2
    echo "    find ~/.ollama/models/manifests -type f | sed 's|.*/manifests/||' | sort" >&2
    return 1
  fi
  echo "ollama:  all $# matrix models present"
  return 0
}

_ollama_environ() {                      # _ollama_environ <pid>
  tr '\0' '\n' < "/proc/$1/environ" 2>/dev/null
}

_ollama_cmdline() {                      # _ollama_cmdline <pid>
  tr '\0' ' ' < "/proc/$1/cmdline" 2>/dev/null
}

# --- guard -------------------------------------------------------------------------

# ollama_guard [provenance_file]
#
# Aborts unless the process serving OLLAMA_PORT is ollama.service's MainPID and carries
# every setting in OLLAMA_REQUIRED_ENV with the expected value. Writes the serving
# process's full OLLAMA_* environment to provenance_file when given, so each run records
# the configuration it actually ran under rather than the one it was supposed to.
ollama_guard() {
  local prov="${1:-}"
  local listen_pid main_pid
  listen_pid="$(_ollama_listen_pid)"
  main_pid="$(_ollama_main_pid)"

  if [ -z "$listen_pid" ]; then
    echo "FATAL: nothing is listening on :${OLLAMA_PORT}." >&2
    echo "  sudo systemctl start ollama" >&2
    return 1
  fi

  if [ -z "$main_pid" ] || [ "$main_pid" = "0" ]; then
    echo "FATAL: ollama.service is not running, but PID ${listen_pid} holds :${OLLAMA_PORT}." >&2
    echo "  That process was not started by systemd, so the drop-ins in" >&2
    echo "  /etc/systemd/system/ollama.service.d/ are NOT in effect." >&2
    echo "  Serving process: $(_ollama_cmdline "$listen_pid")" >&2
    echo >&2
    echo "  Recover:" >&2
    echo "    sudo systemctl stop ollama        # stop any restart loop first" >&2
    echo "    kill ${listen_pid}; sleep 3" >&2
    echo "    sudo systemctl start ollama" >&2
    echo "    ss -ltnp | grep ${OLLAMA_PORT}    # PID must equal MainPID" >&2
    return 1
  fi

  if [ "$listen_pid" != "$main_pid" ]; then
    echo "FATAL: :${OLLAMA_PORT} is held by PID ${listen_pid}, but ollama.service's MainPID is ${main_pid}." >&2
    echo "  A stray server is shadowing the configured one; the service cannot bind and" >&2
    echo "  will crash-loop. Every drop-in setting is absent from the process actually" >&2
    echo "  answering requests." >&2
    echo "  Serving process: $(_ollama_cmdline "$listen_pid")" >&2
    echo >&2
    echo "  Recover:" >&2
    echo "    sudo systemctl stop ollama" >&2
    echo "    kill ${listen_pid}; sleep 3" >&2
    echo "    sudo systemctl start ollama" >&2
    return 1
  fi

  # Identity confirmed. Now confirm configuration - a systemd-started server with a stale
  # drop-in is just as unusable as a stray one.
  local env_dump missing=() wrong=()
  env_dump="$(_ollama_environ "$listen_pid")"
  if [ -z "$env_dump" ]; then
    echo "FATAL: cannot read /proc/${listen_pid}/environ to verify configuration." >&2
    return 1
  fi

  local key want got
  for key in "${!OLLAMA_REQUIRED_ENV[@]}"; do
    want="${OLLAMA_REQUIRED_ENV[$key]}"
    got="$(printf '%s\n' "$env_dump" | grep "^${key}=" | head -1 | cut -d= -f2-)"
    if [ -z "$got" ]; then
      missing+=("${key} (want ${want})")
    elif [ "$got" != "$want" ]; then
      wrong+=("${key}=${got} (want ${want})")
    fi
  done

  if [ ${#missing[@]} -gt 0 ] || [ ${#wrong[@]} -gt 0 ]; then
    echo "FATAL: the serving ollama (PID ${listen_pid}) is misconfigured for benchmarking." >&2
    [ ${#missing[@]} -gt 0 ] && printf '  MISSING: %s\n' "${missing[@]}" >&2
    [ ${#wrong[@]} -gt 0 ]   && printf '  WRONG:   %s\n' "${wrong[@]}" >&2
    echo >&2
    echo "  These change KV footprint and throughput, so cells measured under them are" >&2
    echo "  not comparable to ADR-004's VRAM envelope or to earlier runs." >&2
    echo "    bash bench/ollama_env.sh          # rewrites the drop-in and restarts" >&2
    echo "    systemctl show ollama --property=Environment" >&2
    return 1
  fi

  echo "ollama:  PID ${listen_pid} == service MainPID, all $(( ${#OLLAMA_REQUIRED_ENV[@]} )) required settings verified"

  if [ -n "$prov" ]; then
    {
      echo "# serving ollama provenance, captured at run start"
      echo "pid=${listen_pid}"
      echo "cmdline=$(_ollama_cmdline "$listen_pid")"
      printf '%s\n' "$env_dump" | grep '^OLLAMA_' | sort
    } > "$prov"
  fi
  return 0
}
