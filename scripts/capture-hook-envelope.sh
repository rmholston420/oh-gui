#!/usr/bin/env bash
# Capture the pre_tool_use envelope from the pinned agent-server image (ADR-014 item 5).
#
# WHAT THE FIRST VERSION GOT WRONG
# --------------------------------
# It tried to `python -c 'import openhands.sdk.hooks.types'` inside the image, then to `find`
# types.py on its filesystem. Both came back empty and it reported "could not locate
# hooks/types.py in the image", which read like a broken script. It was not. The image ships
# ONE 112 MB stripped PyInstaller binary at /usr/local/bin/openhands-agent-server and no Python
# package tree and no interpreter on PATH. There was nothing to import and nothing to find.
# The premise was wrong. Verified by reading the image's own layers and config from the
# registry, not by guessing again.
#
# WHAT THIS DOES
# --------------
#   1. copies the binary out of the pinned image (by DIGEST — the tag is provenance only)
#   2. extracts the embedded PyInstaller PYZ and the openhands.sdk.hooks.* code objects
#   3. proves they match the pinned upstream sdist, structurally
#   4. executes the image's own HookEvent to serialize a real envelope
#   5. diffs that envelope against AuthorizeRequest and fails on any mismatch
#
# WHAT IT DOES NOT ESTABLISH
# --------------------------
# This is a STATIC capture. It proves the shape of the model the image contains. It does NOT
# observe a live agent-server populating those fields during a real tool call, so ADR-014
# verification items 1-4 remain unrun and are not discharged by a green run here.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/capture-env.sh
source "$REPO/scripts/lib/capture-env.sh"
EVIDENCE="$REPO/docs/evidence/hook-envelope"
mkdir -p "$EVIDENCE"

capture_env_prepare

# ---------------------------------------------------------------- 4. extract + verify + emit
"$VENV/bin/python" "$REPO/scripts/extract_image_sdk.py" \
  --binary "$BIN" \
  --source-root "$SRC_ROOT" \
  --out "$EVIDENCE/envelope.json" || die "extraction/verification failed (see above)"

# ---------------------------------------------------------------- 5. diff against our schema
echo
if python3 "$REPO/scripts/diff_envelope.py" "$EVIDENCE/envelope.json"; then
  echo
  ok "AuthorizeRequest matches the pinned image field-for-field"
  warn "static shape only — ADR-014 items 1-4 need a live agent-server and are still unrun"
  exit 0
else
  echo
  die "AuthorizeRequest does not match the image. Fix the schema, not the evidence."
fi
