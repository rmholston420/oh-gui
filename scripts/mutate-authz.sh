#!/usr/bin/env bash
# Mutation harness for the 900px gate (ADR-022). A test that has never been seen to fail is not
# a test. Each mutant is a plausible mistake, not a syntax break.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
GUI=apps/gui
V=$GUI/src/features/authorization/viewport.ts
C=$GUI/src/features/authorization/AuthorizationCard.tsx
cp "$V" /tmp/v.bak; cp "$C" /tmp/c.bak
restore() { cp /tmp/v.bak "$V"; cp /tmp/c.bak "$C"; }
trap restore EXIT

# Exit code, not a grep for glyphs. The first version of this harness counted lines matching a
# pattern vitest never prints, so every mutant "survived" — the harness was the broken thing.
run() { (cd $GUI && npx vitest run src/__tests__/authorization-card.test.tsx src/__tests__/authorization-card.ssr.test.tsx >/tmp/mut.out 2>&1); echo $?; }

check() { # name
  if [ "$(run)" -ne 0 ]; then
    n=$(grep -oE "[0-9]+ failed" /tmp/mut.out | head -1)
    printf '\033[32mCAUGHT\033[0m   %-46s (%s)\n' "$1" "${n:-nonzero exit}"
  else
    printf '\033[31mSURVIVED\033[0m %-46s\n' "$1"
  fi
  restore
}

if [ "$(run)" -eq 0 ]; then printf '\033[32mCONTROL\033[0m  %-46s (green, as required)\n' "unmutated"
else printf '\033[31mCONTROL\033[0m  %-46s (RED - fix before trusting anything below)\n' "unmutated"; exit 1; fi

sed -i 's/viewportWidth >= APPROVAL_MIN_WIDTH/viewportWidth > APPROVAL_MIN_WIDTH/' "$V"
check "M1 off-by-one: 900px locked out"

sed -i 's/export const APPROVAL_MIN_WIDTH = 900;/export const APPROVAL_MIN_WIDTH = 768;/' "$V"
check "M2 wrong breakpoint (768 not 900)"

sed -i 's/window.addEventListener/void 0 \&\& window.addEventListener/' "$V"
check "M3 no resize listener: gate goes stale"

perl -0pi -e 's/\(\) => 0,/() => APPROVAL_MIN_WIDTH,/' "$V"
check "M4 fail-open when the width is unknowable"

sed -i 's/disabled={!canAct}\n            onClick={() => onApprove/disabled={false}\n            onClick={() => onApprove/' "$C"
perl -0pi -e 's/(data-testid="approve"\n          )disabled=\{!canAct\}/$1disabled={false}/' "$C"
check "M5 Approve stays live below the breakpoint"

perl -0pi -e 's/(data-testid="approve-and-relax"\n          )disabled=\{!canAct\}/$1disabled={false}/' "$C"
check "M6 relax-for-this-class is an exception path"

perl -0pi -e 's/const rejectReady = canAct && reason\.trim\(\)\.length > 0;/const rejectReady = canAct \&\& reason.length > 0;/' "$C"
check "M7 whitespace accepted as a reject reason"

perl -0pi -e 's/\{!canAct && \(/\{false \&\& (/' "$C"
check "M8 read-only notice never renders"

perl -0pi -e 's/The agent rates this \{action\.securityRisk\}/Risk: {action.securityRisk}/' "$C"
check "M9 risk shown as verdict, not attributed (ADR-015)"

perl -0pi -e 's/action\.securityRisk === null \?/false ?/' "$C"
check "M10 no-assessment renders as an assessment"

perl -0pi -e 's/useSyncExternalStore\(\n    subscribe,\n    \(\) => window\.innerWidth,/useSyncExternalStore(\n    subscribe,\n    () => APPROVAL_MIN_WIDTH,/' "$V"
check "M11 render-time snapshot ignores the real width"
