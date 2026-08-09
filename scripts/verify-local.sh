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
#   scripts/verify-local.sh --middleware-only   # Python policy-plane gate only, then exit
#   scripts/verify-local.sh --skip-middleware   # frontend gate only (Phase 0 behaviour)
#   scripts/verify-local.sh --constraints-only  # ADR-018 hard-constraints checklist only

set -uo pipefail

PORT="${OHGUI_PORT:-5173}"
SERVE=1
HEADED=""
WALK=0
MWONLY=0
MWSKIP=0
HCONLY=0
for a in "$@"; do
  case "$a" in
    --constraints-only) HCONLY=1; SERVE=0 ;;
    --no-serve)   SERVE=0 ;;
    --headed)     HEADED="--headed" ;;
    --walkthrough) WALK=1; HEADED="--headed"; SERVE=0 ;;
    --middleware-only) MWONLY=1; SERVE=0 ;;
    --skip-middleware) MWSKIP=1 ;;
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
MW="$REPO/services/middleware"
MWVENV="$MW/.venv"

# ------------------------------------------------------- hard constraints (ADR-018)
# docs/specs/13-hard-constraints.md says "verify before every PR". Until ADR-018 it said so
# to a human who could not have verified every item in a sitting, which meant it was not
# verified at all. This reconciles the checklist against its tier registry and runs every
# predicate that can run against the tree as it stands.
#
# The gate count is deliberately not written here. It was, for one commit, and it went stale
# the moment ADR-021 added a gate — a header reading "all 71 gates" above a run reporting 72.
# A hardcoded count in a verification banner is the same class of defect this whole gate
# exists to catch: a claim no longer tied to the thing it describes. The runner prints it.
run_constraints_gate() {
  step "Hard constraints  (ADR-018 — docs/specs/13-hard-constraints.md)"
  note "green = enforced by a predicate now · yellow = deferred to a named phase, or"
  note "operator-witnessed · red = drift, a closed phase with an unproven gate, or a failure."
  HCPY="$(command -v python3.13 || command -v python3.12 || command -v python3 || true)"
  if [ -z "$HCPY" ]; then err "no python3 on PATH"; return 1; fi
  if "$HCPY" "$REPO/scripts/check-hard-constraints.py" 2>&1 | sed 's/^/          /'; then
    ok "checklist reconciles and every enforceable gate passes"
  else
    err "hard-constraints checklist FAILED — read the red lines above"
  fi
  # The runner is itself a gate, so it is mutation-tested: each rule is proven to fail when
  # its violation is planted. A gate never seen to fail is not a gate.
  #
  # pytest comes from the middleware venv (colossus-python-env: never assume the interpreter
  # first on PATH has it, and never pip-install into a system Python). The venv is created by
  # the middleware gate; if it is not there yet, say so in yellow rather than failing — the
  # checklist result above is still valid on its own.
  HCPYTEST=""
  if [ -x "$MWVENV/bin/pytest" ]; then
    HCPYTEST="$MWVENV/bin/pytest"
  elif "$HCPY" -c 'import pytest' >/dev/null 2>&1; then
    HCPYTEST="$HCPY -m pytest"
  fi
  if [ -z "$HCPYTEST" ]; then
    warn "pytest unavailable — the runner's own mutation tests did not run"
    note "they live in the middleware venv; create it with:  scripts/verify-local.sh --middleware-only"
  elif $HCPYTEST "$REPO/scripts/tests" -q -p no:cacheprovider >/tmp/ohgui_hc_test.log 2>&1; then
    ok "$(grep -Eo '[0-9]+ passed' /tmp/ohgui_hc_test.log | tail -1) runner mutation tests"
    note "each plants the violation its rule exists to catch, then asserts red"
  else
    err "the constraints runner's own tests failed — read /tmp/ohgui_hc_test.log"
    tail -25 /tmp/ohgui_hc_test.log | sed 's/^/          /'
  fi
}

if [ "$HCONLY" -eq 1 ]; then
  printf '%s=== OH-GUI hard constraints ===%s\n' "$B" "$Z"
  run_constraints_gate
  printf '\n%s=== Summary (constraints only) ===%s\n' "$B" "$Z"
  if [ "$FAILED" -eq 0 ]; then
    printf '%s  PASSED%s with %d warning(s).\n' "$G" "$Z" "$WARNED"; exit 0
  fi
  printf '%s  %d FAILURE(S)%s\n' "$R" "$FAILED" "$Z"; exit 1
fi

# --walkthrough: skip the whole gate, just drive the wizard in a visible browser on this desktop.
if [ "$WALK" -eq 1 ]; then
  printf '%s=== Playwright will now click through the wizard in a visible window ===%s\n' "$B" "$Z"
  note "5 steps forward, then back to 3, 2 and 1, asserting the screen at each stop."
  note "Chromium opens on your desktop. Do not touch it; it drives itself."
  cd "$GUI" || die "apps/gui missing"
  exec npx playwright test walkthrough --headed --workers=1
fi

printf '%s=== OH-GUI local verification ===%s\n' "$B" "$Z"
note "repo: $REPO"

# ---------------------------------------------------------------- environment
step "Environment"
if [ "$MWONLY" -eq 1 ]; then
  note "--middleware-only: skipping the Node/port checks, which gate the frontend only"
else
NODE_V="$(node -v 2>/dev/null)" || die "node not found on PATH"
NODE_MAJ="$(printf '%s' "$NODE_V" | sed 's/^v\([0-9]*\).*/\1/')"
NODE_MIN="$(printf '%s' "$NODE_V" | sed 's/^v[0-9]*\.\([0-9]*\).*/\1/')"
# package.json engines is "^20.19.0 || >=22.12.0". The previous check demanded >=22 outright,
# which failed a compliant node 20.19+ and would have sent you chasing a phantom.
if { [ "$NODE_MAJ" -eq 20 ] && [ "$NODE_MIN" -ge 19 ]; } \
   || [ "$NODE_MAJ" -eq 21 ] && false \
   || { [ "$NODE_MAJ" -ge 23 ]; } \
   || { [ "$NODE_MAJ" -eq 22 ] && [ "$NODE_MIN" -ge 12 ]; }; then
  ok "node $NODE_V satisfies engines ^20.19.0 || >=22.12.0"
else
  err "node $NODE_V does not satisfy engines ^20.19.0 || >=22.12.0"
fi

if command -v npm >/dev/null 2>&1; then ok "npm $(npm -v)"; else die "npm not found"; fi
fi

# Port must be free, or Playwright's reuseExistingServer will happily test whatever
# else is listening and the failures will look like UI bugs.
if [ "$MWONLY" -eq 0 ] && command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then
  err "port $PORT is already in use — free it or re-run with OHGUI_PORT=<n>"
  note "who has it:  ss -ltnp \"sport = :$PORT\""
  note "Playwright reuses an existing server, so it would test the wrong app."
elif [ "$MWONLY" -eq 0 ]; then
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

# ---------------------------------------------------------------- middleware
# services/middleware is the policy plane (ADR-001 item 3). It gets its OWN venv, created
# here, so nothing is ever guessed from a shell prompt and no other project's venv is
# touched (colossus-python-env discipline).
run_middleware_gate() {
  step "Middleware gate  (Python policy plane — fail-closed authorization seam)"

  if [ ! -d "$MW/src" ]; then
    warn "services/middleware is not scaffolded yet — skipping"
    return 0
  fi

  # openhands-* wheels are requires_python >=3.12 (docs/UPSTREAM_PINS.md §2). That floor is
  # on the middleware venv, not on whatever python3 happens to be first on PATH.
  PY_BIN="$(command -v python3.13 || command -v python3.12 || command -v python3 || true)"
  [ -z "$PY_BIN" ] && { err "no python3 on PATH"; return 1; }
  PY_V="$("$PY_BIN" -c 'import sys;print("%d.%d"%sys.version_info[:2])')"
  if "$PY_BIN" -c 'import sys;raise SystemExit(0 if sys.version_info>=(3,12) else 1)'; then
    ok "python $PY_V at $PY_BIN (openhands-* wheels require >=3.12)"
  else
    err "python $PY_V is below the >=3.12 floor the pinned openhands-* wheels declare"
    return 1
  fi

  if [ -n "${VIRTUAL_ENV:-}" ] && [ "${VIRTUAL_ENV}" != "$MWVENV" ]; then
    warn "another venv is active: ${VIRTUAL_ENV}"
    note "not switching it; this gate uses $MWVENV explicitly, by absolute path"
  fi

  if [ ! -x "$MWVENV/bin/python" ]; then
    note "creating $MWVENV"
    "$PY_BIN" -m venv "$MWVENV" || { err "venv creation failed"; return 1; }
  fi
  MWPY="$MWVENV/bin/python"

  if "$MWPY" -m pip install -q --disable-pip-version-check -e "$MW[dev]" \
       >/tmp/ohgui_mw_install.log 2>&1; then
    ok "middleware installed editable with dev extras"
    note "log: /tmp/ohgui_mw_install.log"
  else
    err "middleware pip install failed"
    tail -25 /tmp/ohgui_mw_install.log | sed 's/^/          /'
    return 1
  fi

  # The SDK extra is deliberately NOT installed by this gate. The fail-closed seam must be
  # provable without the 1.41.0 wheels present; the ACL reports their absence as a state.
  UP_STATE="$("$MWPY" -c 'from ohgui_middleware.upstream import sdk;print(sdk.probe().state)' 2>/dev/null || echo error)"
  case "$UP_STATE" in
    ok)      ok "upstream openhands-* packages present and match the 1.41.0 pins" ;;
    missing) warn "openhands-* not installed in the middleware venv — expected at this slice"
             note "the SDK extra lands with ADR-014 ratification:  $MWVENV/bin/pip install -e '$MW[sdk]'" ;;
    drift)   err "installed openhands-* versions DIVERGE from docs/UPSTREAM_PINS.md §2"
             "$MWPY" -c 'import json;from ohgui_middleware.upstream import sdk;print(json.dumps(sdk.probe().to_dict(),indent=2))' | sed 's/^/          /' ;;
    *)       err "anti-corruption layer probe failed to run" ;;
  esac

  if "$MWVENV/bin/ruff" check "$MW/src" "$MW/tests" >/tmp/ohgui_mw_lint.log 2>&1; then
    ok "ruff clean"
  else
    err "ruff found problems"; sed 's/^/          /' /tmp/ohgui_mw_lint.log
  fi

  note "The suite pairs every fault case with an UNGUARDED control: the same faulty resolver"
  note "called directly must NOT deny. Without that half, a test asserting 'denied' would pass"
  note "even if the guard were deleted and replaced with an unconditional deny."
  if (cd "$MW" && "$MWVENV/bin/pytest" -p no:cacheprovider) >/tmp/ohgui_mw_test.log 2>&1; then
    ok "$(grep -Eo '[0-9]+ passed' /tmp/ohgui_mw_test.log | tail -1) middleware assertions"
  else
    err "middleware tests failed — read /tmp/ohgui_mw_test.log"
    tail -30 /tmp/ohgui_mw_test.log | sed 's/^/          /'
  fi

  # Live proof, not a unit test: bind the real server on loopback and ask it to authorize a
  # credential read. It must say deny, and say why.
  MWPORT="${OHGUI_MW_PORT:-8787}"
  if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$MWPORT" 2>/dev/null | grep -q LISTEN; then
    warn "port $MWPORT busy — skipping the live deny check (set OHGUI_MW_PORT to change)"
  else
    OHGUI_MIDDLEWARE_PORT="$MWPORT" "$MWPY" -m ohgui_middleware >/tmp/ohgui_mw_serve.log 2>&1 &
    MWPID=$!
    for _ in $(seq 1 50); do
      curl -sf "http://127.0.0.1:$MWPORT/healthz" >/dev/null 2>&1 && break
      sleep 0.1
    done
    VERDICT="$(curl -sf -X POST "http://127.0.0.1:$MWPORT/v1/authorize" \
      -H 'content-type: application/json' \
      -d '{"event_type":"pre_tool_use","tool_name":"bash","tool_input":{"command":"cat ~/.ssh/id_ed25519"}}' \
      2>/dev/null || echo '{}')"
    if printf '%s' "$VERDICT" | grep -q '"verdict":"deny"'; then
      ok "live seam denied a credential read on 127.0.0.1:$MWPORT"
      note "reason: $(printf '%s' "$VERDICT" | sed -n 's/.*"reason":"\([^"]*\)".*/\1/p')"
    else
      err "live seam did NOT deny — this is the fail-open failure mode ADR-014 clause 3 forbids"
      note "response: $VERDICT"
    fi
    # A non-loopback bind must be refused outright, not warned about.
    if OHGUI_MIDDLEWARE_HOST=0.0.0.0 "$MWPY" -m ohgui_middleware >/tmp/ohgui_mw_bind.log 2>&1; then
      err "middleware accepted a 0.0.0.0 bind — it must be loopback-only"
    else
      ok "refused to bind 0.0.0.0 (loopback-only, single-operator)"
    fi
    kill "$MWPID" 2>/dev/null; wait "$MWPID" 2>/dev/null
  fi

  warn "policy plane is NOT installed: ADR-014 is Proposed and gates enforcement"
  note "every authorization currently denies, by construction. That is the intended state."
}

run_constraints_gate

if [ "$MWSKIP" -eq 0 ]; then
  run_middleware_gate
else
  step "Middleware gate"; warn "skipped by --skip-middleware"
fi

if [ "$MWONLY" -eq 1 ]; then
  printf '\n%s=== Summary (constraints + middleware) ===%s\n' "$B" "$Z"
  if [ "$FAILED" -eq 0 ]; then
    printf '%s  PASSED%s with %d warning(s).\n' "$G" "$Z" "$WARNED"; exit 0
  else
    printf '%s  %d FAILURE(S)%s\n' "$R" "$FAILED" "$Z"; exit 1
  fi
fi

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
