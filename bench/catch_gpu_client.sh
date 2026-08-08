#!/usr/bin/env bash
# Identify short-lived processes talking to Ollama.
#
# A python3 client was observed connecting to 127.0.0.1:11434 on a ~60 s cycle,
# driving 370-425 W bursts to 76 C, then exiting before `ps` could inspect it.
# Any such client competing for the GPU invalidates bench timings and thermals.
#
# Polls at 200 ms and prints the full command line of anything holding a socket
# to 11434 that is not ollama itself. Ctrl-C to stop.
#
#   bash bench/catch_gpu_client.sh [seconds]

set -uo pipefail
DUR="${1:-150}"
END=$(( $(date +%s) + DUR ))
declare -A SEEN

echo "watching :11434 for ${DUR}s (Ctrl-C to stop)"
echo

while [ "$(date +%s)" -lt "$END" ]; do
  # ss -tnp lists sockets with owning process; filter out ollama's own end.
  while read -r line; do
    pid=$(grep -oP 'pid=\K[0-9]+' <<<"$line" | head -1)
    [ -z "${pid:-}" ] && continue
    comm=$(cat "/proc/$pid/comm" 2>/dev/null) || continue
    [ "$comm" = "ollama" ] && continue
    key="$pid"
    [ -n "${SEEN[$key]:-}" ] && continue
    SEEN[$key]=1
    cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
    ppid=$(awk '/^PPid:/{print $2}' "/proc/$pid/status" 2>/dev/null)
    pcmd=$(tr '\0' ' ' < "/proc/$ppid/cmdline" 2>/dev/null)
    cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null)
    echo "[$(date +%H:%M:%S)] pid=$pid comm=$comm"
    echo "    cmd : ${cmd:-<gone>}"
    echo "    cwd : ${cwd:-<gone>}"
    echo "    ppid: $ppid  ${pcmd:-<gone>}"
    echo
  done < <(ss -tnp 2>/dev/null | grep ':11434')
  sleep 0.2
done

echo "done. scheduled-job surfaces to check next:"
echo "  crontab -l"
echo "  systemctl --user list-timers --all"
echo "  systemctl list-timers --all"
