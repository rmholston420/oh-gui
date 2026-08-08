#!/usr/bin/env bash
# Provision the read-only stock Agent Canvas reference checkout.
#
# Required by docs/specs/03-layout.md 3.0.1 and ADR-001 item 6:
#   "A read-only stock Agent Canvas checkout is retained solely for the Phase 0
#    regression baseline ... It is never modified and is not a build input."
#
# Location decision (ADR-001 Amendment #2): the checkout lives OUTSIDE this repo,
# at ~/dev/oh-gui-ref/agent-canvas/<TAG>/, and is chmod a-w after verification.
#
# Two layers, because 3.0.1 asks for two different things:
#   1. PRISTINE  ~/dev/oh-gui-ref/agent-canvas/<TAG>/   read-only, never installed,
#                never run. The diff reference and the vendoring donor source.
#   2. RUN COPY  ~/.oh-gui/reference/agent-canvas-run/  disposable, writable,
#                npm-installable, used for Phase 0 baseline metrics. Delete freely.
#                Created only with --run-copy.
#
# Idempotent: re-running verifies an existing checkout instead of re-cloning.
set -euo pipefail

DONOR_REPO="https://github.com/OpenHands/OpenHands.git"
DONOR_TAG="v1.12.0"
# Verified 2026-08-08 via GitHub API: refs/tags/v1.12.0 -> this commit.
DONOR_SHA="4d0fe4983b6b8e52c104c7ffa4b7be8c7ab5a364"

REF_ROOT="${OH_GUI_REF_ROOT:-$HOME/dev/oh-gui-ref}"
DEST="$REF_ROOT/agent-canvas/$DONOR_TAG"
RUN_COPY="${OH_GUI_RUN_COPY:-$HOME/.oh-gui/reference/agent-canvas-run}"

# Paths PORTING_LEDGER.md names as donor surfaces. Verified present at v1.12.0.
REQUIRED_PATHS=(
  LICENSE
  package.json
  src/components
  src/routes/planner-tab.tsx
  src/routes/changes-tab.tsx
  src/routes/commits-tab.tsx
  src/routes/task-list-tab.tsx
)

WANT_RUN_COPY=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --run-copy) WANT_RUN_COPY=1 ;;
    --force)    FORCE=1 ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "FAIL: $*" >&2; exit 1; }
ok()  { echo "  ok   $*"; }

verify_tree() {
  local d="$1" sha
  sha="$(git -C "$d" rev-parse HEAD)"
  [ "$sha" = "$DONOR_SHA" ] || die "SHA mismatch in $d: got $sha want $DONOR_SHA"
  ok "commit $sha"

  local p
  for p in "${REQUIRED_PATHS[@]}"; do
    [ -e "$d/$p" ] || die "missing donor path: $p"
  done
  ok "${#REQUIRED_PATHS[@]} donor paths present"

  grep -qi "MIT License" "$d/LICENSE" \
    || die "LICENSE is not MIT. Vendoring from this tree is NOT permitted."
  ok "LICENSE is MIT"

  # Guard against the wrong donor. OpenHands/agent-canvas is a README-only stub
  # with no LICENSE; the real donor is OpenHands/OpenHands, whose ROOT package is
  # named @openhands/agent-canvas.
  local name
  name="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["name"])' "$d/package.json")"
  [ "$name" = "@openhands/agent-canvas" ] \
    || die "root package is '$name', expected '@openhands/agent-canvas' - wrong donor repo"
  ok "root package is @openhands/agent-canvas"
}

report_writable() {
  local d="$1" n
  n="$(find "$d" -path "$d/.git" -prune -o -writable -print 2>/dev/null | head -1)"
  if [ -n "$n" ]; then
    echo "  WARN tree is writable (e.g. $n) - re-locking"
    chmod -R a-w "$d"
  fi
  ok "tree is read-only"
}

echo "== Agent Canvas reference checkout =="
echo "   donor : $DONOR_REPO @ $DONOR_TAG"
echo "   dest  : $DEST"

if [ -d "$DEST/.git" ] && [ "$FORCE" -eq 0 ]; then
  echo "-- existing checkout found, verifying (no re-clone)"
  verify_tree "$DEST"
  report_writable "$DEST"
else
  [ "$FORCE" -eq 1 ] && [ -d "$DEST" ] && { chmod -R u+w "$DEST"; rm -rf "$DEST"; }
  mkdir -p "$(dirname "$DEST")"
  TMP="$(mktemp -d "${TMPDIR:-/tmp}/agent-canvas-XXXXXX")"
  trap '[ -n "${TMP:-}" ] && [ -d "$TMP" ] && { chmod -R u+w "$TMP" 2>/dev/null || true; rm -rf "$TMP"; }' EXIT
  echo "-- cloning (shallow, single tag)"
  git -c advice.detachedHead=false clone --depth 1 --branch "$DONOR_TAG" --quiet \
    "$DONOR_REPO" "$TMP/co"
  verify_tree "$TMP/co"
  echo "-- installing, then locking read-only"
  # Order matters: renaming a directory requires write permission ON that
  # directory (its ".." entry is rewritten), so lock AFTER the move, never before.
  mv "$TMP/co" "$DEST"
  chmod -R a-w "$DEST"
  ok "installed and locked at $DEST"
fi

echo "   size  : $(du -sh "$DEST" 2>/dev/null | cut -f1)"

if [ "$WANT_RUN_COPY" -eq 1 ]; then
  echo "-- refreshing disposable run copy for Phase 0 baseline metrics"
  [ -d "$RUN_COPY" ] && { chmod -R u+w "$RUN_COPY"; rm -rf "$RUN_COPY"; }
  mkdir -p "$(dirname "$RUN_COPY")"
  cp -r "$DEST" "$RUN_COPY"
  chmod -R u+w "$RUN_COPY"
  ok "run copy at $RUN_COPY (writable, disposable, NOT the reference)"
  echo "   next: cd $RUN_COPY && npm ci"
fi

cat <<EOF

VERIFIED. Pristine reference is read-only at:
  $DEST

Rules:
  - Never modify it. Never add it to a build, workspace glob, tsconfig, or lockfile.
  - Vendor FROM it with an SPDX header naming OpenHands/OpenHands, the file path,
    and commit $DONOR_SHA (PORTING_LEDGER.md attribution requirement).
  - Do NOT vendor from github.com/OpenHands/agent-canvas: that repo is a
    README-only stub with no LICENSE file.
  - Re-verify at each phase gate by re-running this script; log it in BUILD_LOG.md.
EOF
