#!/usr/bin/env bash
# Capture the real `pre_tool_use` stdin envelope from the pinned agent-server image.
#
# ADR-014 verification gate item 5 / ADR-021. `ipc/schema.py:AuthorizeRequest` was written from
# the *documented* envelope. ADR-015 exists because documentation is not verification, so this
# script replaces the documentation with bytes produced by the pinned image's own serializer.
#
# What this proves, precisely:
#   - the field set, field names, types and null-vs-absent behaviour of the wire JSON, produced
#     by the exact `HookEvent` class inside `agent-server@sha256:f0244fd7…`;
#   - the environment variables the executor exports alongside it.
#
# What it does NOT prove, and is not claimed to:
#   - that `tool_input` carries the arguments we intend to judge for each tool class. That is
#     ADR-014 item 3 and needs a live agent run with a real model. This script reads the image's
#     code; it does not drive a conversation.
#
# Nothing is pruned, removed, or written outside this repo. No container is left running.
set -euo pipefail

DIGEST="sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520"
IMAGE="ghcr.io/openhands/agent-server@${DIGEST}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO/docs/evidence/hook-envelope"
mkdir -p "$OUT"

c() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
green() { c '0;32' "  OK    $1"; }
yellow() { c '0;33' "  WARN  $1"; }
red() { c '0;31' "  FAIL  $1"; }

echo "=== pre_tool_use envelope capture (ADR-014 item 5) ==="
echo

# ---------------------------------------------------------------- 1. the image, by digest
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "  pulling $IMAGE"
  docker pull "$IMAGE" >/dev/null
fi
green "image present, pinned by digest (tag never used)"

# ------------------------------------------------- 2. the HookEvent class as the image ships it
# Read from the image rather than from PyPI. The pin is a container digest; the sdist is a
# different artifact that merely claims the same version, and this is the one that will run.
#
# The first version of this step piped stderr to /dev/null and printed "could not locate
# hooks/types.py". That is a diagnosis dressed up as an observation - the script did not know
# why it failed, and by discarding the only evidence it guaranteed nobody else could either.
# Every probe below keeps its stderr and reports what it actually tried.

probe() {  # probe <shell> <interpreter>
  docker run --rm --entrypoint "$1" "$IMAGE" -c \
    "$2 -c 'import openhands.sdk.hooks.types as m; print(m.__file__)'" 2>"$OUT/locate.err"
}

TYPES_PATH=""
for SH in /bin/sh /bin/bash; do
  for PY in python python3 /usr/local/bin/python /openhands/.venv/bin/python \
            /app/.venv/bin/python /opt/venv/bin/python; do
    if OUTP="$(probe "$SH" "$PY" || true)"; [ -n "$OUTP" ]; then
      TYPES_PATH="$OUTP"; USED_SH="$SH"; USED_PY="$PY"; break 2
    fi
  done
done

if [ -z "$TYPES_PATH" ]; then
  # No interpreter answered. Fall back to locating the file on the filesystem, which does not
  # need Python at all, and say plainly which of the two failures this is.
  red "no Python interpreter in the image could import openhands.sdk.hooks.types"
  echo "  last stderr from the probe:"
  sed 's/^/    /' "$OUT/locate.err" 2>/dev/null | tail -15
  echo
  echo "  searching the image filesystem instead:"
  docker run --rm --entrypoint /bin/sh "$IMAGE" -c \
    "find / -path /proc -prune -o -name types.py -path '*hooks*' -print 2>/dev/null" \
    | sed 's/^/    /' || true
  echo
  yellow "re-run with the path this printed, or send me the output above"
  exit 1
fi

echo "$TYPES_PATH" >"$OUT/types-path.txt"
docker run --rm --entrypoint "$USED_SH" "$IMAGE" -c "cat '$TYPES_PATH'" >"$OUT/hooks-types.py"
green "extracted $TYPES_PATH"
echo "        via $USED_SH + $USED_PY"

# --------------------------------------------------- 3. the bytes, from the image's own code
docker run --rm --entrypoint "$USED_SH" "$IMAGE" -c "$USED_PY - <<'PYEOF'
import json
from openhands.sdk.hooks.types import HookEvent, HookEventType
e = HookEvent(
    event_type=HookEventType.PRE_TOOL_USE,
    tool_name='execute_bash',
    tool_input={'command': 'rm -rf /', 'is_input': False},
    session_id='00000000-0000-0000-0000-000000000000',
    working_dir='/workspace/project',
)
print(e.model_dump_json())
PYEOF
" >"$OUT/envelope.json" 2>"$OUT/serialize.err" || {
  red "the image's own HookEvent could not serialize a PreToolUse event"
  sed 's/^/    /' "$OUT/serialize.err" | tail -20
  exit 1
}
green "serialized one PreToolUse envelope with the image's own HookEvent"
echo
echo "  --- observed wire bytes -------------------------------------------------"
python3 -m json.tool <"$OUT/envelope.json" | sed 's/^/  /'
echo "  -------------------------------------------------------------------------"
echo

# ------------------------------------------------------- 4. diff against AuthorizeRequest
# `set -e` would abort here on a mismatch, before printing the summary that explains it.
# A verification script that dies silently at the exact moment it finds something is worse
# than no script. The mismatch is the expected first result, so it must survive to be read.
RC=0
python3 "$REPO/scripts/diff_envelope.py" "$OUT/envelope.json" "$OUT/hooks-types.py" || RC=$?

echo
if [ "$RC" -eq 0 ]; then
  green "AuthorizeRequest matches the pinned image field-for-field"
else
  yellow "AuthorizeRequest does not match — see above. This is the expected first result."
fi
echo "  evidence written to docs/evidence/hook-envelope/"
exit "$RC"
