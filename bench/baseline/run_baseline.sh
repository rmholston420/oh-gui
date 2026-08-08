#!/usr/bin/env bash
# Phase 0 baseline metrics run — one task, fully instrumented.
#
# Required by docs/specs/02-repo-setup.md items 5-7 (Phase 0 exit criterion).
#
# What this does NOT do: drive the agent. The operator drives the STOCK Agent Canvas run copy by
# hand, because every metric item 5 names except GPU telemetry is a human judgement. This script
# is the instrumentation around that session — thermal guard, 1 Hz GPU sampling, a record of which
# model Ollama actually had resident, and a timestamped event log.
#
# The GPU watcher is mandatory (operator standing instruction): any script that runs a local model
# monitors and records temperature inline, and aborts at the ceiling. Here the model is run by the
# app rather than by us, which changes nothing about the card.
#
# Usage:
#   bash bench/baseline/run_baseline.sh t01
#   bash bench/baseline/run_baseline.sh t01 --dry-run   # no GPU, no Ollama; harness self-test
set -euo pipefail
# shellcheck source=lib/colors.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/colors.sh"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK="${1:-}"; shift || true
DRY=0; AUTO=0; PROFILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --auto)    AUTO=1 ;;
    --profile) PROFILE="$2"; shift ;;
  esac
  shift
done
[ "$AUTO" -eq 1 ] && [ -z "$PROFILE" ] && { echo "--auto requires --profile <name>" >&2; exit 2; }

[ -n "$TASK" ] || { echo "usage: run_baseline.sh <task-id> [--dry-run]" >&2; exit 2; }
CARD=$(ls "$HERE/tasks/${TASK}"-*.md 2>/dev/null | head -1) \
  || { echo "no task card for '$TASK' in $HERE/tasks" >&2; exit 2; }
[ -n "$CARD" ] || { echo "no task card for '$TASK' in $HERE/tasks" >&2; exit 2; }

FIXTURE="${OH_GUI_FIXTURE:-${OH_GUI_BASELINE_FIXTURE:-$HOME/oh-gui-baseline/fixture}}"
STAMP="${OH_GUI_BASELINE_STAMP:-$(date +%Y%m%d_%H%M)}"
OUT="$HOME/.oh-gui/baseline/${STAMP}_run"
mkdir -p "$OUT"

if [ "$DRY" -eq 0 ]; then
  [ -d "$FIXTURE/.git" ] || { echo "FAIL: no fixture at $FIXTURE — run seed_fixture.sh" >&2; exit 1; }
  # shellcheck source=../lib/gpu.sh
  source "$HERE/../lib/gpu.sh"
  # shellcheck source=../lib/ollama.sh
  source "$HERE/../lib/ollama.sh"

  gpu_guard
  gpu_cool_wait
  gpu_watch_start "$OUT/${TASK}.thermal.csv"

  # Which model was ACTUALLY resident, sampled rather than assumed. This is what satisfies
  # item 7's "record variant and quantization" — a claim about the model taken from the
  # runtime, not from whatever the settings screen was believed to say.
  ( while true; do
      printf '%s\t%s\n' "$(date +%H:%M:%S)" "$(ollama ps 2>/dev/null | tail -n +2 | tr '\n' ';')" \
        >> "$OUT/${TASK}.ollama_ps.tsv"
      sleep 5
    done ) &
  OLLAMA_SAMPLER=$!
  trap 'kill $OLLAMA_SAMPLER 2>/dev/null || true' EXIT
else
  echo "[dry run] GPU guard, thermal watcher and Ollama sampler skipped"
  FIXTURE_ARG_OK=1
fi

# Record the stack the baseline actually ran against. ADR-008 turns on the fact that the stock app
# starts its OWN backend rather than the pinned agent-server image, so the version that answers is
# the one that must appear in the report - measured here, not transcribed by the operator.
INGRESS="${OH_GUI_BASELINE_INGRESS:-http://localhost:8010}"
if curl -sf --max-time 5 "$INGRESS/server_info" -o "$OUT/${TASK}.server_info.json" 2>/dev/null; then
  echo "server_info recorded from $INGRESS"
else
  echo "WARNING: no response from $INGRESS/server_info - the app version behind this task will be"
  echo "         UNRECORDED. Set OH_GUI_BASELINE_INGRESS if the app is not on 8010."
fi

echo
echo "=============================================================================="
sed 's/^/  /' "$CARD"
echo "=============================================================================="
echo "  fixture:  $FIXTURE"
echo "  output:   $OUT"
echo
if [ "$AUTO" -eq 1 ]; then
echo "  DRIVEN AUTOMATICALLY by drive_task.mjs, profile: $PROFILE"
echo "  Human-only metrics will be null, NOT zero."
else
echo "  Give the agent the task text above VERBATIM. Mark events as they happen."
fi
echo "=============================================================================="
echo

if [ "$AUTO" -eq 1 ]; then
  # The driver replaces the operator's hands and NOTHING else: the GPU guard, thermal CSV,
  # Ollama sampler and server_info above still apply, so an automated run is instrumented
  # identically to a hand-driven one and the two are comparable.
  ( cd "$HERE/../../apps/gui" && OH_GUI_BASELINE_FIXTURE="$FIXTURE" \
      node "$HERE/ui/drive_task.mjs" --task "$TASK" --outdir "$OUT" --profile "$PROFILE" ) \
    || echo "WARNING: $TASK did not complete — see $OUT/${TASK}.summary.json"
else
  ARGS=(--task "$TASK" --outdir "$OUT")
  [ -d "$FIXTURE/.git" ] && ARGS+=(--fixture "$FIXTURE")
  python3 "$HERE/mark.py" "${ARGS[@]}"
fi

if [ "$DRY" -eq 0 ]; then
  kill "$OLLAMA_SAMPLER" 2>/dev/null || true
  gpu_watch_stop
  echo
  echo "resident models observed during this task:"
  cut -f2 "$OUT/${TASK}.ollama_ps.tsv" 2>/dev/null | tr ';' '\n' | awk 'NF' | sort -u | sed 's/^/  /'
fi
echo
echo "task record: $OUT/${TASK}.summary.json"
