#!/usr/bin/env bash
# Regression tests for ollama_guard in bench/lib/ollama.sh.
#
# The scenario this guard exists to catch (a stray non-systemd server shadowing the
# configured one) went undetected for an entire morning of benchmarking because every
# cheap signal looked healthy. So the guard is tested against that exact scenario, plus
# the ways it could wrongly pass or wrongly fail.
#
#     bash bench/tests/test_ollama_guard.sh
#
# Exits non-zero on any failure.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAILURES=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# shellcheck source=/dev/null
source "$REPO/bench/lib/ollama.sh"

# Full, correct environment as the drop-ins define it.
GOOD_ENV="OLLAMA_MODELS=$HOME/.ollama/models
OLLAMA_HOST=127.0.0.1:11434
OLLAMA_FLASH_ATTENTION=0
OLLAMA_KV_CACHE_TYPE=f16
OLLAMA_GPU_OVERHEAD=1073741824
OLLAMA_MAX_LOADED_MODELS=2
OLLAMA_NUM_PARALLEL=1
OLLAMA_KEEP_ALIVE=-1
OLLAMA_CONTEXT_LENGTH=65536
PATH=/usr/bin:/bin"

# What a stray `ollama serve` actually has: no OLLAMA_* config at all.
STRAY_ENV='PATH=/usr/bin:/bin
HOME=/home/rmholston
LANG=en_US.UTF-8'

LISTEN_PID=3218; MAIN_PID=3218; ENVIRON="$GOOD_ENV"
_ollama_listen_pid() { echo "$LISTEN_PID"; }
_ollama_main_pid() { echo "$MAIN_PID"; }
_ollama_environ() { printf '%s\n' "$ENVIRON"; }
_ollama_cmdline() { echo "/usr/local/bin/ollama serve"; }

expect_pass() {                          # expect_pass <desc>
  if ollama_guard > "$TMP/out" 2>&1; then
    echo "  ok    $1"
  else
    echo "  FAIL  $1 (expected pass, got failure)"; sed 's/^/          | /' "$TMP/out"
    FAILURES=$((FAILURES + 1))
  fi
}

expect_fail() {                          # expect_fail <desc> <pattern>
  if ollama_guard > "$TMP/out" 2>&1; then
    echo "  FAIL  $1 (expected failure, got pass)"; sed 's/^/          | /' "$TMP/out"
    FAILURES=$((FAILURES + 1))
  elif grep -qi "$2" "$TMP/out"; then
    echo "  ok    $1"
  else
    echo "  FAIL  $1 (failed as expected, but message lacked '$2')"
    sed 's/^/          | /' "$TMP/out"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "ollama_guard"

# Healthy baseline. If this does not pass, every other assertion is meaningless.
LISTEN_PID=3218; MAIN_PID=3218; ENVIRON="$GOOD_ENV"
expect_pass "systemd-owned server with the full drop-in environment passes"

# THE REAL 2026-08-08 FAILURE: stray holds the port, service crash-looping so MainPID=0.
LISTEN_PID=3218; MAIN_PID=0; ENVIRON="$STRAY_ENV"
expect_fail "stray server while service is down is caught" "not started by systemd"

# Stray holds the port while the service claims a different live PID.
LISTEN_PID=3218; MAIN_PID=99999; ENVIRON="$STRAY_ENV"
expect_fail "PID mismatch against MainPID is caught" "shadowing"

# The subtler variant: systemd DID start it, but a drop-in setting is absent. Equally
# unusable, and much easier to miss than a stray process.
LISTEN_PID=555; MAIN_PID=555
ENVIRON="$(printf '%s\n' "$GOOD_ENV" | grep -v NUM_PARALLEL)"
expect_fail "missing OLLAMA_NUM_PARALLEL is caught" "MISSING"

# Present but wrong - e.g. parallelism left at Ollama's auto default of 4, which multiplies
# KV allocation and silently breaks comparability with ADR-004.
ENVIRON="$(printf '%s\n' "$GOOD_ENV" | sed 's/OLLAMA_NUM_PARALLEL=1/OLLAMA_NUM_PARALLEL=4/')"
expect_fail "wrong OLLAMA_NUM_PARALLEL value is caught" "WRONG"

ENVIRON="$(printf '%s\n' "$GOOD_ENV" | sed 's/OLLAMA_FLASH_ATTENTION=0/OLLAMA_FLASH_ATTENTION=1/')"
expect_fail "wrong OLLAMA_FLASH_ATTENTION value is caught" "WRONG"

# KEEP_ALIVE default of 5m lets models evict between cells - a live suspect for the
# transient HTTP 500 on c12_r1 in run 20260808_0633.
ENVIRON="$(printf '%s\n' "$GOOD_ENV" | grep -v KEEP_ALIVE)"
expect_fail "missing OLLAMA_KEEP_ALIVE is caught" "MISSING"

# Nothing listening at all.
ENVIRON="$GOOD_ENV"; LISTEN_PID=""; MAIN_PID=0
expect_fail "no listener is caught" "nothing is listening"

# Unreadable /proc must fail closed, not pass by default.
LISTEN_PID=3218; MAIN_PID=3218; ENVIRON=""
expect_fail "unreadable environ fails closed" "cannot read"

# OLLAMA_CONTEXT_LENGTH is intentionally not required: the harness sets num_ctx per
# request, so its absence must NOT block a run. Guards that over-reach get disabled.
LISTEN_PID=3218; MAIN_PID=3218
ENVIRON="$(printf '%s\n' "$GOOD_ENV" | grep -v CONTEXT_LENGTH)"
expect_pass "absent OLLAMA_CONTEXT_LENGTH does not block (set per request)"

# Provenance must record what actually served, not what was intended.
ENVIRON="$GOOD_ENV"
ollama_guard "$TMP/prov.txt" > /dev/null 2>&1
if grep -q "^pid=3218" "$TMP/prov.txt" && grep -q "^OLLAMA_NUM_PARALLEL=1" "$TMP/prov.txt" \
   && ! grep -q "^PATH=" "$TMP/prov.txt"; then
  echo "  ok    provenance records pid, cmdline and OLLAMA_* only"
else
  echo "  FAIL  provenance file wrong"; sed 's/^/          | /' "$TMP/prov.txt"
  FAILURES=$((FAILURES + 1))
fi

# The 2026-08-08 wrong-store failure: correct-looking server, real models, but pointed at
# /usr/share/ollama where 9 of 13 cells do not exist.
LISTEN_PID=3218; MAIN_PID=3218
ENVIRON="$(printf '%s\n' "$GOOD_ENV" | sed "s|^OLLAMA_MODELS=.*|OLLAMA_MODELS=/usr/share/ollama/.ollama/models|")"
expect_fail "server pointed at the wrong model store is caught" "WRONG"

# An unset OLLAMA_MODELS is also a failure: a default never appears in /proc/environ, so it
# cannot be verified, and that unverifiability is exactly what hid this for weeks.
ENVIRON="$(printf '%s\n' "$GOOD_ENV" | grep -v OLLAMA_MODELS)"
expect_fail "unset OLLAMA_MODELS is caught" "MISSING"

echo
echo "ollama_require_models"
MATRIX=(qwen3.6:27b qwen3.6:35b qwen3.6:35b-a3b-mtp-q4_K_M qwen3-coder:30b \
        hf.co/unsloth/Devstral-Small-2507-GGUF:UD-Q4_K_XL)

# Exactly what the system store returned on 2026-08-08 - six real models, nine cells short.
_ollama_tags() { printf '%s\n' qwen3.6:35b-a3b-q4_K_M qwen3-coder:30b qwen3-embedding:4b; }
if ollama_require_models "${MATRIX[@]}" > "$TMP/out" 2>&1; then
  echo "  FAIL  partial store accepted"; FAILURES=$((FAILURES + 1))
elif grep -q "missing 4 model" "$TMP/out" && grep -q "qwen3.6:27b" "$TMP/out"; then
  echo "  ok    partial store rejected, naming each absent model"
else
  echo "  FAIL  partial store rejected with wrong message"; sed 's/^/          | /' "$TMP/out"
  FAILURES=$((FAILURES + 1))
fi

# Substring collisions must not count as present: 35b-a3b-q4_K_M is NOT 35b.
_ollama_tags() { printf '%s\n' qwen3.6:35b-a3b-q4_K_M; }
if ollama_require_models qwen3.6:35b > "$TMP/out" 2>&1; then
  echo "  FAIL  substring match accepted as present"; FAILURES=$((FAILURES + 1))
else
  echo "  ok    substring match is not treated as present"
fi

_ollama_tags() { printf '%s\n' "${MATRIX[@]}"; }
if ollama_require_models "${MATRIX[@]}" > "$TMP/out" 2>&1; then
  echo "  ok    complete store passes"
else
  echo "  FAIL  complete store rejected"; sed 's/^/          | /' "$TMP/out"
  FAILURES=$((FAILURES + 1))
fi

_ollama_tags() { :; }
if ollama_require_models qwen3.6:27b > "$TMP/out" 2>&1; then
  echo "  FAIL  unreachable server accepted"; FAILURES=$((FAILURES + 1))
else
  echo "  ok    unreachable server rejected"
fi

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES FAILURE(S)"
  exit 1
fi
echo "all ollama guard tests passed"
