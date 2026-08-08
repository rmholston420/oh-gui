#!/usr/bin/env bash
# Open the most recent run of a probe in the Playwright trace viewer.
#   ./watch.sh            most recent run of anything
#   ./watch.sh probe3     most recent probe3 run
#   ./watch.sh --list     every run, newest first
set -euo pipefail
BASE="$HOME/.oh-gui/baseline"
cd "$HOME/dev/oh-gui/apps/gui"

if [ "${1:-}" = "--list" ]; then
  find "$BASE" -name trace.zip -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | cut -d' ' -f2- | while read -r t; do
        echo "$(date -d @"$(stat -c %Y "$t")" '+%Y-%m-%d %H:%M')  $(du -h "$t" | cut -f1)  $t"
      done
  exit 0
fi

pat="${1:-}"
trace=$(find "$BASE" ${pat:+-path "*/$pat/*"} -name trace.zip -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | head -1 | cut -d' ' -f2-)
[ -n "$trace" ] || { echo "no trace found${pat:+ for '$pat'}. Try: $0 --list"; exit 1; }
echo "opening $trace"
npx playwright show-trace "$trace"
