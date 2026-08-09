#!/usr/bin/env bash
# Compact post-mortem for an agent-server conversation.
#
# Exists because "the canary file is absent" is NOT evidence a deny held - it is equally
# consistent with the agent never attempting the tool call. This separates the two by looking
# for an actual ActionEvent for the bash tool and for the hook's own verdict.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
. scripts/lib/say.sh
API=${API:-http://127.0.0.1:8000/api}
CID=${1:?usage: inspect-conversation.sh <conversation-id>}

step "fetching conversation $CID"
INFO=$(curl -s -w '\n%{http_code}' "$API/conversations/$CID")
CODE=$(printf '%s' "$INFO" | tail -1); INFO=$(printf '%s' "$INFO" | sed '$d')
[ "$CODE" = "200" ] || { fail "GET conversation HTTP $CODE"; printf '%s\n' "$INFO" | head -c 300; exit 1; }
printf '%s' "$INFO" | python3 -c '
import sys,json
d=json.load(sys.stdin)
for k in ("execution_status","agent_state","current_model_id"):
    print("   %-18s %s" % (k, d.get(k)))
for k in ("blocked_actions","blocked_messages"):
    v=d.get(k) or []
    print("   %-18s %d %s" % (k, len(v), json.dumps(v)[:200]))
'

step "event kind tally"
curl -s "$API/conversations/$CID/events/search?limit=200" | python3 -c '
import sys,json,collections
raw=sys.stdin.read()
try: d=json.loads(raw)
except Exception: print("   \033[33mnon-JSON events response:\033[0m", raw[:200]); raise SystemExit(0)
items=d.get("items") if isinstance(d,dict) else d
items=items or []
c=collections.Counter((e.get("kind") or e.get("type") or "?") for e in items)
print("   total", len(items))
for k,v in c.most_common(12): print("   %-34s %d" % (k,v))
tool=[e for e in items if "tool_name" in json.dumps(e)[:4000] and (e.get("kind","").endswith("ActionEvent") or "Action" in str(e.get("kind")))]
print(("\033[32m✔ PASS\033[0m " if tool else "\033[31m✘ FAIL\033[0m ")+"tool ActionEvents observed: %d" % len(tool))
for e in tool[:2]:
    print("     tool=", e.get("tool_name"), "|", json.dumps(e.get("action") or {})[:160])
errs=[e for e in items if "error" in str(e.get("kind","")).lower() or e.get("error")]
if errs:
    print("\033[31m✘ errors:\033[0m", len(errs))
    for e in errs[:2]: print("     ", json.dumps(e)[:400])
'
