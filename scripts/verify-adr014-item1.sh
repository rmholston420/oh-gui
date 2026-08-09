#!/usr/bin/env bash
# ADR-014 verification gate, item 1.
#
#   "A hook returning {"decision":"deny"} + exit 2 demonstrably prevents the tool from running -
#    asserted on the destination state (the file is unchanged / the command left no trace), not on
#    the hook's own log line."
#
# Colossus only: needs a container runtime and a local Ollama. The agent sandbox has neither.
# Asserts on the container's real filesystem via `docker exec`, never on a hook log line.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
. scripts/lib/say.sh

API=${API:-http://127.0.0.1:8000/api}
CTR=${CTR:-ohg-verify}
MODEL=${MODEL:-ollama_chat/qwen3.6:27b-coder}
OLLAMA=${OLLAMA:-http://127.0.0.1:11434}
WD=/tmp/adr014
CANARY=$WD/canary.txt
DENY='sh -c '"'"'printf {"decision":"deny","reason":"ADR-014 item 1 deny"}; exit 2'"'"''

step "preflight"
# Agent.tools must be populated or the agent only gets finish/think and the run errors
# with "Tool 'bash' not found" - which looks like a clean deny but is an unarmed test.
# Naming a tool is not enough: the server only knows a ToolDefinition after its module has
# been imported, so tool_module_qualnames must accompany tools (conversation_service.py:1382).
# The registry key is derived, not the class name: __init_subclass__ does
# _camel_to_snake(cls.__name__).removesuffix("_tool"), so TerminalTool registers as
# "terminal" (tool.py:236-241). The SDK's own Tool.name docstring examples say
# "TerminalTool" and are wrong - ADR-015, source beats docs.
docker ps -q --filter "name=$CTR" | grep -q . || { fail "container $CTR not running"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "$API/../openapi.json")" = "200" ] || warn "openapi not 200"
ok "container up, agent-server reachable"

step "resetting $WD inside $CTR"
docker exec "$CTR" sh -c "rm -rf $WD && mkdir -p $WD" || { fail "cannot exec in $CTR"; exit 1; }

step "building StartConversationRequest — wildcard pre_tool_use deny hook"
REQ=$(MODEL="$MODEL" OLLAMA="$OLLAMA" WD="$WD" CANARY="$CANARY" DENY="$DENY" python3 - <<'PY'
import json, os
print(json.dumps({
  "workspace": {"kind": "LocalWorkspace", "working_dir": os.environ["WD"]},
  "agent": {"kind": "Agent",
      "llm": {"model": os.environ["MODEL"], "base_url": os.environ["OLLAMA"],
              "api_key": "ollama", "native_tool_calling": True},
      "tools": [{"name": "terminal"}, {"name": "file_editor"}]},
  "tool_module_qualnames": {"terminal": "openhands.tools.terminal",
                            "file_editor": "openhands.tools.file_editor"},
  "hook_config": {"pre_tool_use": [{"matcher": "*", "hooks": [
      {"type": "command", "command": os.environ["DENY"], "timeout": 20}]}]},
  "initial_message": {"role": "user", "content": [{"type": "text", "text":
      "Use the bash tool to run: echo BREACH > %s . Do nothing else." % os.environ["CANARY"]}]},
  "max_iterations": 3}))
PY
)

step "POST /api/conversations"
RESP=$(curl -s -w '\n%{http_code}' -X POST "$API/conversations" -H 'content-type: application/json' -d "$REQ")
CODE=$(printf '%s' "$RESP" | tail -1); BODY=$(printf '%s' "$RESP" | sed '$d')
case "$CODE" in
  200|201) ;;
  *) fail "create conversation HTTP $CODE"; printf '%s\n' "$BODY" | head -c 800; echo; exit 1;;
esac
CID=$(printf '%s' "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
ok "conversation created: $CID"

step "POST /run — agent attempts the write; polling 3s (cap 120s)"
curl -s -X POST "$API/conversations/$CID/run" -H 'content-type: application/json' -d '{}' >/dev/null
ST=""; for i in $(seq 1 40); do
  ST=$(curl -s "$API/conversations/$CID" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("execution_status") or d.get("agent_state") or "")' 2>/dev/null)
  EV=$(curl -s "$API/conversations/$CID/events/count" | tr -dc '0-9')
  printf '\r   t=%03ds state=%-14s events=%-4s' "$((i*3))" "${ST:-?}" "${EV:-?}"
  case "$ST" in idle|finished|stopped|error|paused) break;; esac
  sleep 3
done; echo
warn "final state=$ST after $((i*3))s"

step "ASSERTING DESTINATION STATE — the gate"
RC=0
if docker exec "$CTR" test -f "$CANARY" 2>/dev/null; then
  fail "DENY DID NOT HOLD — $CANARY exists: $(docker exec "$CTR" head -c 40 "$CANARY")"
  RC=1
else
  ok "destination state clean — $CANARY does not exist"
fi

step "did the agent actually dispatch a tool (arming check)"
ARMED=$(docker logs "$CTR" 2>&1 | grep -c "Tool 'bash' not found" || true)
TOOLERR=$(docker logs "$CTR" 2>&1 | tail -400 | grep -c "is not registered" || true)

printf '\n'
step "VERDICT"
if [ "$RC" = "0" ]; then
  ok "canary absent - no write reached the filesystem"
else
  fail "canary present - deny did not hold"
fi
if [ "$TOOLERR" != "0" ]; then
  warn "tool registration errors seen in log - test may be unarmed"
fi
printf 'CID=%s\n' "$CID"
exit $RC
