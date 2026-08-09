#!/usr/bin/env bash
# OH-GUI local verification — Phase 0 first-run wizard.
#
# Runs the whole gate on Colossus and tells you, in colour, what each step did:
#   GREEN  = passed, nothing to look at
#   YELLOW = worked but worth your eyes, or a non-fatal environment quirk
#   RED    = failed; stop and read it
#
# No GPU, no LLM, no network beyond the npm registry. Nothing here touches Docker,
# volumes, or Ollama. Safe to run while the agent server is up.
#
# Usage:
#   scripts/verify-local.sh              # verify, then serve the wizard so you can click it
#   scripts/verify-local.sh --no-serve   # verify only, exit when done
#   scripts/verify-local.sh --headed     # watch the browser tests actually drive the UI

set -uo pipefail

PORT="${OHGUI_PORT:-5173}"
SERVE=1
HEADED=""
for a in "$@"; do
  case "$a" in
    --no-serve) SERVE=0 ;;
    --headed)   HEADED="--headed" ;;
    *) echo "unknown flag: $a"; exit 2 ;;
  esac
done

if [ -t 1 ]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[1m'; D=$'\033[2m'; Z=$'\033[0m'
else
  R=""; G=""; Y=""; B=""; D=""; Z=""
fi

FAILED=0; WARNED=0; STEP=0
ok()   { printf '%s  PASS%s  %s\n' "$G" "$Z" "$1"; }
warn() { printf '%s  WARN%s  %s\n' "$Y" "$Z" "$1"; WARNED=$((WARNED+1)); }
err()  { printf '%s  FAIL%s  %s\n' "$R" "$Z" "$1"; FAILED=$((FAILED+1)); }
note() { printf '%s        %s%s\n' "$D" "$1" "$Z"; }
step() { STEP=$((STEP+1)); printf '\n%s[%d] %s%s\n' "$B" "$STEP" "$1" "$Z"; }
die()  { printf '\n%s  ABORTING: %s%s\n' "$R" "$1" "$Z"; exit 1; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || die "cannot cd to repo root"
GUI="$REPO/apps/gui"

printf '%s=== OH-GUI local verification ===%s\n' "$B" "$Z"
note "repo: $REPO"

# ---------------------------------------------------------------- environment
step "Environment"
NODE_V="$(node -v 2>/dev/null)" || die "node not found on PATH"
NODE_MAJ="$(printf '%s' "$NODE_V" | sed 's/^v\([0-9]*\).*/\1/')"
if [ "$NODE_MAJ" -ge 22 ]; then ok "node $NODE_V (package.json wants >=22.12)"
else err "node $NODE_V is too old; package.json requires ^20.19 || >=22.12"; fi

if command -v npm >/dev/null 2>&1; then ok "npm $(npm -v)"; else die "npm not found"; fi

# Port must be free, or Playwright's reuseExistingServer will happily test whatever
# else is listening and the failures will look like UI bugs.
if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then
  err "port $PORT is already in use — free it or re-run with OHGUI_PORT=<n>"
  note "who has it:  ss -ltnp \"sport = :$PORT\""
  note "Playwright reuses an existing server, so it would test the wrong app."
else
  ok "port $PORT is free"
fi
[ "$FAILED" -gt 0 ] && die "environment is not usable"

# ------------------------------------------------------------------- revision
step "Revision"
if [ -n "$(git status --porcelain)" ]; then
  warn "working tree has uncommitted changes — you are testing your tree, not the pushed commit"
  git status --short | sed 's/^/          /'
else
  ok "working tree clean"
fi
# Assert on the content that matters rather than a commit hash, which would go stale on the
# very next commit and train you to ignore this line.
if grep -q "action.writesOutsideWorktree ? 'HIGH' : action.risk" \
     apps/gui/src/features/first-run/trust-dial.ts 2>/dev/null; then
  ok "trust-dial carries the fixed out-of-worktree elevation"
else
  err "trust-dial.ts does NOT contain the fixed predicate — wrong revision or reverted"
  note "expected the elevation to be unconditional, matching EnsembleSecurityAnalyzer"
fi
if grep -q "confirm_unknown is off" apps/gui/src/__tests__/trust-dial.test.ts 2>/dev/null; then
  ok "the regression test that caught it is present"
else
  warn "the UNKNOWN-elevation regression test is missing from this revision"
fi
note "HEAD $(git log --oneline -1)"

# ------------------------------------------------------------------- install
step "Install dependencies (npm ci — exact lockfile, no drift)"
cd "$GUI" || die "apps/gui missing"
if npm ci --no-fund --no-audit >/tmp/ohgui_install.log 2>&1; then
  ok "dependencies installed from package-lock.json"
  note "log: /tmp/ohgui_install.log"
else
  err "npm ci failed"; tail -25 /tmp/ohgui_install.log | sed 's/^/          /'
  die "cannot continue without dependencies"
fi

# ----------------------------------------------------------------- unit gate
step "Static + unit gate  (eslint, then 27 Vitest assertions, then a production build)"
note "Vitest covers the trust-dial predicate: every stop x risk x threshold x confirm_unknown."
note "Two of these assertions exist because they caught a real bug — an out-of-worktree write"
note "with UNKNOWN risk used to display 'Proceeds' where OpenHands actually pauses."
if npm run gate 2>&1 | tee /tmp/ohgui_gate.log | sed 's/^/          /'; then
  ok "lint clean, unit tests passed, production build succeeded"
else
  err "gate failed — read /tmp/ohgui_gate.log"
fi
TESTS_LINE="$(grep -E '^\s*Tests\s' /tmp/ohgui_gate.log | tail -1 | tr -s ' ')"
[ -n "$TESTS_LINE" ] && note "vitest:$TESTS_LINE"

# ------------------------------------------------------------- browser gate
step "Browser gate  (Playwright, real Chromium — the only thing that can see layout and colour)"
note "jsdom has no layout engine and no colours. These 8 tests check, on every wizard step:"
note "  - WCAG AA contrast via axe-core (serious/critical only)"
note "  - text clipped or overflowing its container"
note "  - horizontal scroll at a 900px viewport"
note "  - the rendered DOM agreeing with the predicate the unit tests check"
note "Each step is screenshotted into the report so you can look at it, not just trust it."

if npx playwright install chromium >/tmp/ohgui_pw_install.log 2>&1; then
  ok "chromium ready"
else
  warn "chromium download reported a problem — see /tmp/ohgui_pw_install.log"
fi

PW_STATUS=0
npx playwright test $HEADED 2>&1 | tee /tmp/ohgui_pw.log | sed 's/^/          /'
PW_STATUS="${PIPESTATUS[0]}"
if [ "$PW_STATUS" -eq 0 ]; then
  ok "$(grep -Eo '[0-9]+ passed' /tmp/ohgui_pw.log | tail -1) browser assertions"
else
  err "Playwright failed (exit $PW_STATUS)"
  if grep -qi 'host system is missing dependencies\|error while loading shared libraries' /tmp/ohgui_pw.log; then
    warn "this looks like missing system libraries, not a UI bug"
    note "fix:  sudo npx playwright install-deps chromium"
  fi
fi

# ------------------------------------------------------------- screenshots
step "Screenshots"
SHOTS="$HOME/.forge-oh/ohgui_wizard_shots"
rm -rf "$SHOTS"; mkdir -p "$SHOTS"
N=0
for f in "$GUI"/playwright-report/data/*.png; do
  [ -e "$f" ] || continue
  cp "$f" "$SHOTS/" && N=$((N+1))
done
if [ "$N" -gt 0 ]; then
  ok "$N full-page screenshots saved"
  note "look at them:  xdg-open $SHOTS"
else
  warn "no screenshots found — the browser gate probably did not get far enough"
fi

# ---------------------------------------------------------------- summary
printf '\n%s=== Summary ===%s\n' "$B" "$Z"
if [ "$FAILED" -eq 0 ] && [ "$WARNED" -eq 0 ]; then
  printf '%s  ALL GREEN%s  Phase 0 wizard verified on this machine.\n' "$G" "$Z"
elif [ "$FAILED" -eq 0 ]; then
  printf '%s  PASSED with %d warning(s)%s  Nothing blocking; read the yellow lines.\n' "$Y" "$WARNED" "$Z"
else
  printf '%s  %d FAILURE(S)%s, %d warning(s). Phase 0 is NOT verified here.\n' "$R" "$FAILED" "$Z" "$WARNED"
fi
printf '  %-22s %s\n' "unit + build log:" "/tmp/ohgui_gate.log"
printf '  %-22s %s\n' "browser log:"      "/tmp/ohgui_pw.log"
printf '  %-22s %s\n' "html report:"      "npx playwright show-report --host 127.0.0.1"
printf '  %-22s %s\n' "screenshots:"      "$SHOTS"

[ "$FAILED" -gt 0 ] && exit 1
[ "$SERVE" -eq 0 ] && exit 0

# -------------------------------------------------------------------- serve
step "Serving the wizard so you can click through it yourself"
printf '\n%s      open:  http://127.0.0.1:%s%s\n' "$B" "$PORT" "$Z"
note "5 steps. Step 3 is the Phase 0 exit criterion: the default trust-dial stop,"
note "stated and justified in the UI, with NeverConfirm() marked opt-in-only."
note "Steps 1 and 3 carry visible 'Not active yet' notices — that is deliberate."
note "Ctrl-C when you are done."
printf '\n'
exec npm run dev -- --host 127.0.0.1 --port "$PORT" --strictPort
