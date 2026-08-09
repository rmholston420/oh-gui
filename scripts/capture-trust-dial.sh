#!/usr/bin/env bash
# Derive the trust-dial truth table from the pinned agent-server image.
#
# `apps/gui/src/features/first-run/trust-dial.ts` is a hand-written mirror of upstream
# confirmation-policy semantics. Its existing test pins it to docs/specs/04-authorization.md —
# to a table a human typed. That is the same arrangement that let `AuthorizeRequest` be wrong in
# four of eight fields: a mirror checked only against our own prose.
#
# This runs the image's own `AlwaysConfirm` / `NeverConfirm` / `ConfirmRisky` /
# `EnsembleSecurityAnalyzer` across the whole parameter space and records what they actually
# decide. `apps/gui/src/__tests__/trust-dial.upstream.test.ts` then asserts the mirror against
# that recording rather than against the spec.
#
# This does NOT retire the mirror. The standing Phase 1 constraint is that no OH-GUI surface
# re-implements upstream semantics it could read; a verified mirror is still a mirror. It
# removes the silent-divergence risk, not the duplication.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/capture-env.sh
source "$REPO/scripts/lib/capture-env.sh"
EVIDENCE="$REPO/docs/evidence/trust-dial"
mkdir -p "$EVIDENCE"

capture_env_prepare

"$VENV/bin/python" "$REPO/scripts/verify_trust_dial.py" \
  --binary "$BIN" \
  --source-root "$SRC_ROOT" \
  --out "$EVIDENCE/policy-truth-table.json" || die "extraction/verification failed (see above)"

echo
if [ -d "$REPO/apps/gui/node_modules" ]; then
  ( cd "$REPO/apps/gui" && npx vitest run src/__tests__/trust-dial.upstream.test.ts ) \
    || die "trust-dial.ts disagrees with the pinned image. Fix the mirror, not the evidence."
  echo
  ok "trust-dial.ts agrees with the pinned image across every parameter combination"
else
  warn "apps/gui/node_modules absent — recorded the table but did not check the mirror against it"
  echo "       cd apps/gui && npm ci && npx vitest run src/__tests__/trust-dial.upstream.test.ts"
fi

warn "a verified mirror is still a mirror — driving the dial from the middleware is still owed"
