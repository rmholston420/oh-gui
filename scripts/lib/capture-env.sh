# shellcheck shell=bash
# Shared prelude for the capture harnesses: get the pinned binary, the verified reference source,
# and a CPython 3.13 able to read its marshal format.
#
# Sourced by scripts/capture-hook-envelope.sh and scripts/capture-trust-dial.sh. Extracted after
# the second consumer appeared rather than in anticipation of one, so it carries no speculative
# generality: it sets BIN, SRC_ROOT and VENV and does nothing else.

G=$'\033[0;32m'; Y=$'\033[0;33m'; R=$'\033[0;31m'; X=$'\033[0m'
ok()   { echo "${G} OK  ${X} $*"; }
warn() { echo "${Y} WARN${X} $*"; }
die()  { echo "${R} FAIL${X} $*" >&2; exit 1; }

WORK="${OH_GUI_CAPTURE_DIR:-${TMPDIR:-/tmp}/oh-gui-envelope}"

# Pinned in docs/UPSTREAM_PINS.md. Never reference the tag in a run command.
IMAGE_DIGEST="sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520"
IMAGE="ghcr.io/openhands/agent-server@${IMAGE_DIGEST}"

SDIST_URL="https://files.pythonhosted.org/packages/2f/ee/a938c78fdd310022c9081445195047207f06fabb2650abb9c1c04e44f66d/openhands_sdk-1.41.0.tar.gz"
SDIST_SHA256="${SDIST_SHA256:-b12bb6f5a69bfee476a4ae8700b0bf33c478f67ea708c8d4a5f75a95d6f4045f}"

BIN="$WORK/openhands-agent-server"
SRC_ROOT="$WORK/openhands_sdk-1.41.0"
VENV="$WORK/venv313"

capture_env_prepare() {
  mkdir -p "$WORK"

  # -------------------------------------------------------------- the binary
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
    # No `docker run`: nothing needs to execute for a static capture, and running an
    # agent-server to read its own type definitions is a much larger blast radius.
    trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT
    docker cp "$CID:/usr/local/bin/openhands-agent-server" "$BIN" \
      || die "the image has no /usr/local/bin/openhands-agent-server — upstream layout changed"
    docker rm -f "$CID" >/dev/null
    trap - EXIT
    ok "extracted $(du -h "$BIN" | cut -f1) binary from the pinned image"
  fi

  # -------------------------------------------------------------- reference source
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

  # -------------------------------------------------------------- a 3.13 interpreter
  # marshal is version-specific and the image bundles 3.13.14. A 3.12 or 3.14 interpreter cannot
  # read these code objects at all — it does not degrade, it raises. Any 3.13.x works; verified
  # across 3.13.12 (sandbox) and 3.13.15 (Colossus), producing identical output.
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
}
