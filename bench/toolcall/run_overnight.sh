#!/usr/bin/env bash
# Overnight ADR-016 tool-call benchmark: screen (40 tasks) then confirm (80 held-out).
set -uo pipefail

G=$'\e[32m'; R=$'\e[31m'; Y=$'\e[33m'; B=$'\e[1m'; N=$'\e[0m'
cd "$(dirname "$0")/../.." || exit 1
LOG=/tmp/bench_overnight.log
: > "$LOG"

step() { printf '%s\n%s== %s ==%s\n' "" "$B" "$1" "$N" | tee -a "$LOG"; }
ok()   { printf '%sPASS%s %s\n' "$G" "$N" "$1" | tee -a "$LOG"; }
bad()  { printf '%sFAIL%s %s\n' "$R" "$N" "$1" | tee -a "$LOG"; }

step "pre-flight gates"
for c in "python3 -m pytest bench/toolcall/tests/ -q" \
         "python3 scripts/check-hard-constraints.py" \
         "python3 bench/validate_harness.py"; do
  if $c >>"$LOG" 2>&1; then ok "$c"; else bad "$c"; echo "${R}aborting: gate failed, nothing ran${N}"; exit 1; fi
done

step "ollama reachable?"
if curl -sf http://127.0.0.1:11434/v1/models >/dev/null; then ok "ollama up"; else bad "ollama unreachable"; exit 1; fi

START=$(date +%s)
step "SCREEN — 10 cells x 40 tasks x 1 rep (projected ~66 min)"
if python3 bench/toolcall/bench_toolcall.py --mode screen 2>&1 | tee -a "$LOG"; then
  ok "screen complete"
else
  bad "screen failed"; echo "${Y}confirm not started${N}"; exit 1
fi

step "CONFIRM — 4 cells x 80 held-out tasks x 5 reps (projected ~105 min)"
if python3 bench/toolcall/bench_toolcall.py --mode confirm 2>&1 | tee -a "$LOG"; then
  ok "confirm complete"
else
  bad "confirm failed"; exit 1
fi

MIN=$(( ($(date +%s) - START) / 60 ))
step "DONE in ${MIN} min"
printf '%sresults:%s %s\n' "$B" "$N" "$(ls -d ~/.oh-gui/bench_toolcall/*_toolcall | tail -2 | tr '\n' ' ')" | tee -a "$LOG"
