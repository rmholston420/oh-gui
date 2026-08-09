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
docker run --rm --entrypoint /bin/sh "$IMAGE" -c '
  python -c "import openhands.sdk.hooks.types as m; print(m.__file__)"
' >"$OUT/types-path.txt" 2>/dev/null || { red "could not locate hooks/types.py in the image"; exit 1; }
TYPES_PATH="$(cat "$OUT/types-path.txt")"
docker run --rm --entrypoint /bin/sh "$IMAGE" -c "cat '$TYPES_PATH'" >"$OUT/hooks-types.py"
green "extracted $TYPES_PATH"

# ---------------------------------------------------------- 3. the bytes, from the image's own code
docker run --rm --entrypoint /bin/sh "$IMAGE" -c '
python - <<PY
import json
from openhands.sdk.hooks.types import HookEvent, HookEventType
e = HookEvent(
    event_type=HookEventType.PRE_TOOL_USE,
    tool_name="execute_bash",
    tool_input={"command": "rm -rf /", "is_input": False},
    session_id="00000000-0000-0000-0000-000000000000",
    working_dir="/workspace/project",
)
print(e.model_dump_json())
PY
' >"$OUT/envelope.json"
green "serialized one PreToolUse envelope with the image'"'"'s own HookEvent"
echo
echo "  --- observed wire bytes -------------------------------------------------"
python3 -m json.tool <"$OUT/envelope.json" | sed 's/^/  /'
echo "  -------------------------------------------------------------------------"
echo

# ------------------------------------------------------- 4. diff against AuthorizeRequest
python3 "$REPO/scripts/diff_envelope.py" "$OUT/envelope.json" "$OUT/hooks-types.py"
RC=$?

echo
if [ "$RC" -eq 0 ]; then
  green "AuthorizeRequest matches the pinned image field-for-field"
else
  yellow "AuthorizeRequest does not match — see above. This is the expected first result."
fi
echo "  evidence written to docs/evidence/hook-envelope/"
exit "$RC"
