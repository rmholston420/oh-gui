#!/usr/bin/env bash
# Toggle MCP servers in ~/.openhands/settings.json for baseline runs.
#
# settings.json is the operator's REAL config, shared with all other OpenHands work on Colossus.
# Every mode here backs it up first and `restore` puts it back byte-for-byte, so a baseline run
# can never silently become a permanent change to a working setup.
#
#   ./mcp_baseline.sh status    # what is enabled, and is anything listening
#   ./mcp_baseline.sh off       # disable all MCP servers  (baseline: stock agent)
#   ./mcp_baseline.sh fixture   # keep serena, repoint --project at the baseline fixture
#   ./mcp_baseline.sh restore   # undo, from the newest backup
set -euo pipefail
S="$HOME/.openhands/settings.json"
BK="$HOME/.oh-gui/baseline/settings-backups"
FIXTURE="${OH_GUI_BASELINE_FIXTURE:-$HOME/oh-gui-baseline/fixture}"
mkdir -p "$BK"
[ -f "$S" ] || { echo "missing $S"; exit 1; }

backup() {
  local d="$BK/settings.$(date -u +%Y%m%dT%H%M%SZ).json"
  cp -p "$S" "$d"; echo "backup: $d"
}

case "${1:-status}" in
  status)
    python3 - "$S" <<'PY'
import json,socket,sys,urllib.parse
cfg=json.load(open(sys.argv[1])).get("agent_settings",{}).get("mcp_config",{}) or {}
if not cfg: print("no mcp servers configured")
for name,c in cfg.items():
    en=c.get("enabled"); tr=c.get("transport")
    print(f"{name}: enabled={en} transport={tr}")
    if c.get("url"):
        u=urllib.parse.urlparse(c["url"]); port=u.port or (443 if u.scheme=="https" else 80)
        s=socket.socket(); s.settimeout(1.5)
        try: s.connect((u.hostname,port)); print(f"   {c['url']} REACHABLE")
        except Exception as e: print(f"   {c['url']} NOT LISTENING ({e.__class__.__name__})")
        finally: s.close()
    a=c.get("args") or []
    if "--project" in a: print(f"   --project {a[a.index('--project')+1]}")
PY
    ;;
  off)
    backup
    python3 - "$S" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p))
cfg=d.setdefault("agent_settings",{}).get("mcp_config") or {}
for n,c in cfg.items():
    c["enabled"]=False; print(f"disabled {n}")
json.dump(d,open(p,"w"),indent=2)
PY
    echo "RESTART the app — mcp_config is read at agent-server startup."
    ;;
  fixture)
    [ -d "$FIXTURE" ] || { echo "no fixture at $FIXTURE — run seed_fixture.sh first"; exit 1; }
    backup
    python3 - "$S" "$FIXTURE" <<'PY'
import json,sys
p,fx=sys.argv[1],sys.argv[2]; d=json.load(open(p))
cfg=d.setdefault("agent_settings",{}).get("mcp_config") or {}
for n,c in cfg.items():
    a=c.get("args") or []
    if "--project" in a:
        a[a.index("--project")+1]=fx; c["args"]=a
        c["description"]=f"{c.get('description','')} [BASELINE: repointed to {fx}]".strip()
        print(f"{n}: --project -> {fx}")
    elif c.get("transport")=="sse":
        c["enabled"]=False; print(f"{n}: disabled (sse, not needed for baseline)")
json.dump(d,open(p,"w"),indent=2)
PY
    echo "RESTART the app — mcp_config is read at agent-server startup."
    ;;
  restore)
    last=$(ls -1t "$BK"/settings.*.json 2>/dev/null | head -1)
    [ -n "$last" ] || { echo "no backup found in $BK"; exit 1; }
    cp -p "$last" "$S"; echo "restored from $last"
    echo "RESTART the app."
    ;;
  *) echo "usage: $0 {status|off|fixture|restore}"; exit 2 ;;
esac
