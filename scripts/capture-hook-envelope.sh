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

G=$'\033[0;32m'; Y=$'\033[0;33m'; R=$'\033[0;31m'; X=$'\033[0m'
ok()   { echo "${G} OK  ${X} $*"; }
warn() { echo "${Y} WARN${X} $*"; }
die()  { echo "${R} FAIL${X} $*" >&2; exit 1; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${OH_GUI_CAPTURE_DIR:-${TMPDIR:-/tmp}/oh-gui-envelope}"
EVIDENCE="$REPO/docs/evidence/hook-envelope"

# Pinned in docs/UPSTREAM_PINS.md. Never reference the tag in a run command.
IMAGE_DIGEST="sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520"
IMAGE="ghcr.io/openhands/agent-server@${IMAGE_DIGEST}"

# Reference source. sha256 is the PyPI-published sdist digest for 1.41.0, checked below —
# an unverified download is not a reference.
SDIST_URL="https://files.pythonhosted.org/packages/2f/ee/a938c78fdd310022c9081445195047207f06fabb2650abb9c1c04e44f66d/openhands_sdk-1.41.0.tar.gz"
SDIST_SHA256="b12bb6f5a69bfee476a4ae8700b0bf33c478f67ea708c8d4a5f75a95d6f4045f"

mkdir -p "$WORK" "$EVIDENCE"

# ---------------------------------------------------------------- 1. the binary
BIN="$WORK/openhands-agent-server"
if [ -f "$BIN" ]; then
  ok "binary already extracted at $BIN"
else
  command -v docker >/dev/null || die "docker not found"
  docker image inspect "$IMAGE" >/dev/null 2>&1 || {
    echo "  pulling $IMAGE"
    docker pull "$IMAGE" >/dev/null || die "cannot pull the pinned image"
  }
  ok "image present, pinned by digest (tag never used)"
  CID="$(docker create "$IMAGE")"
  # No `docker run`: nothing in the image needs to execute for a static capture, and running
  # an agent-server to read its own type definitions is a much larger blast radius.
  trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT
  docker cp "$CID:/usr/local/bin/openhands-agent-server" "$BIN" \
    || die "the image has no /usr/local/bin/openhands-agent-server — upstream layout changed"
  docker rm -f "$CID" >/dev/null
  trap - EXIT
  ok "extracted $(du -h "$BIN" | cut -f1) binary from the pinned image"
fi

# ---------------------------------------------------------------- 2. reference source
SRC_ROOT="$WORK/openhands_sdk-1.41.0"
if [ -d "$SRC_ROOT" ]; then
  ok "reference sdist already unpacked"
else
  TARBALL="$WORK/sdk.tar.gz"
  curl -fsSL "$SDIST_URL" -o "$TARBALL" || die "cannot download the reference sdist"
  GOT="$(sha256sum "$TARBALL" | cut -d' ' -f1)"
  [ "$GOT" = "$SDIST_SHA256" ] || die "sdist sha256 mismatch: got $GOT want $SDIST_SHA256"
  ok "reference sdist sha256 verified"
  tar -xzf "$TARBALL" -C "$WORK"
fi

# ---------------------------------------------------------------- 3. a 3.13 interpreter
# marshal is version-specific and the image bundles 3.13.14. A 3.12 or 3.14 interpreter
# cannot read these code objects at all — it does not degrade, it raises.
VENV="$WORK/venv313"
if [ ! -x "$VENV/bin/python" ]; then
  PY313=""
  for cand in python3.13 "$HOME/.local/share/uv/python/cpython-3.13"*/bin/python3.13; do
    if command -v "$cand" >/dev/null 2>&1 || [ -x "$cand" ]; then PY313="$cand"; break; fi
  done
  if [ -z "$PY313" ]; then
    command -v uv >/dev/null || die "need CPython 3.13. Install uv, or install python3.13, then re-run.
       curl -LsSf https://astral.sh/uv/install.sh | sh"
    uv python install 3.13 >/dev/null
    PY313="$(uv python find 3.13)"
  fi
  "$PY313" -m venv "$VENV" || die "cannot create the 3.13 venv"
  # Isolated on purpose: this must not install into .oh-venv or any project env.
  "$VENV/bin/pip" install -q pydantic || die "cannot install pydantic into the capture venv"
fi
ok "capture interpreter: $("$VENV/bin/python" -V)"

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
