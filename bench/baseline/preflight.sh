#!/usr/bin/env bash
# Fail in ten seconds, not in forty-two minutes.
#
# Everything here is a condition that silently invalidated the first matrix or would have thrown
# partway through the second. Run it immediately before run_matrix.sh.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="${OH_GUI_BASELINE_FIXTURE:-$HOME/oh-gui-baseline/fixture}"
VENV="${OH_GUI_BASELINE_VENV:-$(dirname "$FIXTURE")/venv}"
INGRESS="${OH_GUI_BASELINE_INGRESS:-http://127.0.0.1:8010}"
PROFILES="${OH_GUI_BASELINE_PROFILES:-qwen3.6-27b,qwen3.6-35b-a3b-mtp-q4_K_M}"
fail=0
ok(){ printf '  ok    %s\n' "$1"; }
bad(){ printf '  FAIL  %s\n' "$1"; fail=1; }
warn(){ printf '  warn  %s\n' "$1"; }

echo "== fixture =="
if [ -d "$FIXTURE/.git" ]; then
  seed="$(git -C "$FIXTURE" rev-list --max-parents=0 HEAD)"
  # The driver hard-resets to the ROOT commit, so a stale seed silently reintroduces the bug that
  # hijacked four cells: `def list()` shadowed the builtin in the class namespace.
  if git -C "$FIXTURE" show "$seed:notes_api/store.py" 2>/dev/null | grep -q "def list_all"; then
    ok "seed ${seed:0:7} has the repaired store (list_all)"
  else
    bad "seed ${seed:0:7} still has 'def list' — RE-SEED: rm -rf $FIXTURE $VENV && bash $HERE/seed_fixture.sh"
  fi
  git -C "$FIXTURE" show "$seed:notes_api/store.py" 2>/dev/null | grep -q "from __future__ import annotations" \
    && ok "seed pins annotation semantics (same on 3.12 and 3.14)" \
    || bad "seed lacks 'from __future__ import annotations' — gate and agent will disagree"
  [ -z "$(git -C "$FIXTURE" status --porcelain)" ] && ok "fixture clean" || warn "fixture dirty (driver resets it anyway)"
else
  bad "no fixture at $FIXTURE — run seed_fixture.sh"
fi

echo "== venv =="
if [ -x "$VENV/bin/python" ]; then
  ok "$("$VENV/bin/python" --version 2>&1) at $VENV"
  "$VENV/bin/python" -c "import fastapi, pytest, httpx" 2>/dev/null \
    && ok "fastapi + pytest + httpx importable" || bad "venv missing deps — re-run seed_fixture.sh"
else
  bad "no venv python at $VENV/bin/python"
fi

echo "== acceptance gates =="
missing=""
for t in $(ls "$HERE/tasks" | sed 's/-.*//' | sort -u); do
  [ -f "$HERE/verify/$t.py" ] || missing="$missing $t"
done
[ -z "$missing" ] && ok "every task card has a gate" || bad "task cards with no gate:$missing"

echo "== profiles =="
IFS=',' read -ra PL <<< "$PROFILES"
for p in "${PL[@]}"; do
  f="$HOME/.openhands/profiles/$p.json"
  [ -f "$f" ] && ok "profile $p" || bad "missing profile $f"
done
stale="$HOME/.openhands/profiles/default.json.baseline-backup"
[ -f "$stale" ] && warn "stale default.json backup from an interrupted run — the driver will restore it" || true
if [ -f "$HOME/.openhands/profiles/default.json" ]; then
  dm="$(python3 -c "import json;print(json.load(open('$HOME/.openhands/profiles/default.json')).get('model'))" 2>/dev/null)"
  ok "default profile is $dm (driver repoints it per cell and restores on exit)"
fi

echo "== workspace the app will actually use =="
# VITE_WORKING_DIR on the running stack pointed at a directory that does not exist, while the
# harness graded another. It was harmless — the app uses the registered workspace and ignores that
# env var — but nothing checked, and a wrong workspace looks exactly like a model that did nothing.
WSJ="$HOME/.openhands/workspaces.json"
if [ -f "$WSJ" ]; then
  python3 - "$WSJ" "$FIXTURE" <<'PYW'
import json, sys, os
paths = [w.get("path") for w in json.load(open(sys.argv[1])).get("workspaces", [])]
want = os.path.realpath(sys.argv[2])
if not paths:
    print("  FAIL  no workspace registered — the agent has nowhere to work"); sys.exit(1)
if want in [os.path.realpath(p) for p in paths if p]:
    print(f"  ok    fixture is a registered workspace ({len(paths)} registered)")
    sys.exit(0)
print(f"  FAIL  graded fixture is NOT a registered workspace. registered: {paths}")
sys.exit(1)
PYW
  [ $? -ne 0 ] && fail=1
else
  bad "no $WSJ — open the app once and select the fixture as the workspace"
fi

echo "== models pulled =="
for p in "${PL[@]}"; do
  f="$HOME/.openhands/profiles/$p.json"
  [ -f "$f" ] || { warn "skipped $p (profile missing, reported above)"; continue; }
  m="$(python3 -c "import json;print(json.load(open('$f'))['model'].split('/')[-1])" 2>/dev/null)"
  [ -n "$m" ] || { bad "cannot read model out of $f"; continue; }
  ollama show "$m" >/dev/null 2>&1 && ok "$m present" || bad "$m NOT pulled — ollama pull $m"
done

echo "== app =="
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$INGRESS" 2>/dev/null)"
[ "$code" = "200" ] && ok "ingress $INGRESS responding" || bad "ingress $INGRESS returned '$code' — start the app"
ver="$(curl -s --max-time 5 "$INGRESS/server_info" 2>/dev/null)"
[ -n "$ver" ] && ok "server_info: $(echo "$ver" | head -c 120)" || warn "no /server_info (ADR-008 wants it recorded)"

echo "== tooling =="
nv="$(node --version 2>/dev/null)"; case "$nv" in v2[4-9]*|v[3-9][0-9]*) ok "node $nv";; *) bad "node $nv — need v24+";; esac
python3 -m pytest --version >/dev/null 2>&1 && ok "pytest available to the harness tests" || warn "pytest missing outside the venv"

echo "== harness self-tests =="
if python3 -m pytest "$HERE/tests" -q >/tmp/preflight-tests.log 2>&1; then
  ok "$(tail -1 /tmp/preflight-tests.log)"
else
  bad "harness tests FAILING — see /tmp/preflight-tests.log"; tail -5 /tmp/preflight-tests.log | sed 's/^/        /'
fi

echo
[ "$fail" -eq 0 ] && echo "PREFLIGHT PASS — safe to run run_matrix.sh" \
  || echo "PREFLIGHT FAILED — fix the above before spending 42 minutes"
exit "$fail"
