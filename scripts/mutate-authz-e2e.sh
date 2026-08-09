#!/usr/bin/env bash
# Mutation harness for the headed 900px gate (ADR-022).
#
# Kills the dev server between mutants. This is not caution — the first version of this harness
# reused a running server and reported clean passes against *stale code*: `perl -0pi` and `sed -i`
# replace the file's inode, and Vite's watcher keeps following the old one, so the browser was
# served the unmutated module. Three "surviving" mutants turned out to be mutants that were never
# actually applied. A mutation harness that silently tests the original is worse than none.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
GUI=apps/gui
C=$GUI/src/features/authorization/AuthorizationCard.tsx
V=$GUI/src/features/authorization/viewport.ts
cp "$C" /tmp/e2e-c.bak; cp "$V" /tmp/e2e-v.bak
restore() { cp /tmp/e2e-c.bak "$C"; cp /tmp/e2e-v.bak "$V"; }
# Kill by listening port, not by `pkill -f vite.*5173`: that pattern also matches this script's
# own descendants and killed the harness itself (exit 143) on the first attempt.
kill_dev() {
  local pids
  pids=$(ss -lptnH "sport = :5173" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)
  [ -n "$pids" ] && kill $pids 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    ss -lntH "sport = :5173" 2>/dev/null | grep -q . || return 0
    sleep 0.5
  done
}
trap 'restore; kill_dev' EXIT

run() {
  kill_dev
  (cd $GUI && npx playwright test authorization-narrow --reporter=line >/tmp/e2e-mut.out 2>&1)
  echo $?
}

verify_applied() { # pattern-that-must-now-exist
  grep -q "$1" "$C" "$V" || { printf '\033[31mBROKEN MUTANT\033[0m the edit did not apply: %s\n' "$1"; return 1; }
}

check() { # name  expected-marker
  if ! verify_applied "$2"; then restore; return; fi
  if [ "$(run)" -ne 0 ]; then
    printf '\033[32mCAUGHT\033[0m   %-48s (%s)\n' "$1" "$(grep -oE '[0-9]+ failed' /tmp/e2e-mut.out | head -1)"
  else
    printf '\033[31mSURVIVED\033[0m %-48s\n' "$1"
  fi
  restore
}

if [ "$(run)" -eq 0 ]; then printf '\033[32mCONTROL\033[0m  %-48s (green)\n' "unmutated"
else printf '\033[31mCONTROL\033[0m  %-48s (RED)\n' "unmutated"; tail -20 /tmp/e2e-mut.out; exit 1; fi

perl -0pi -e 's/(data-testid="approve"\n          )disabled=\{!canAct\}/$1disabled={false}/' "$C"
check "E1 Approve live below 900px" 'data-testid="approve"'

perl -0pi -e 's/overflow-x-auto rounded border border-slate-700/rounded border border-slate-700/' "$C"
check "E2 command block stops scrolling internally" 'pending-command'

perl -0pi -e 's/(narrow-viewport-notice"\n          role="status"\n          className="mt-3 rounded border border-amber-600 bg-amber-950 p-3 text-sm )text-amber-100/${1}text-amber-800/' "$C"
check "E3 read-only notice fails contrast" 'text-amber-800'

perl -0pi -e 's/        tabIndex=\{0\}\n//' "$C"
check "E4 scrollable command block loses keyboard access" 'role="region"'

perl -0pi -e 's/viewportWidth >= APPROVAL_MIN_WIDTH/viewportWidth > APPROVAL_MIN_WIDTH/' "$V"
check "E5 off-by-one: 900px locked out" 'viewportWidth > APPROVAL'
