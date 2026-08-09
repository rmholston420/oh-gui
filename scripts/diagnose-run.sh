#!/usr/bin/env bash
# Why did a conversation end in error? Batches the three questions worth asking, because
# each operator round trip costs real budget.
#   1. what shape does the events endpoint actually return (the inspector read 0 while the
#      poller read 20, so one of them is querying it wrong)
#   2. the last error lines from the agent-server log, filtered - never a raw log dump
#   3. is the configured model actually reachable and does it do native tool calling
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
. scripts/lib/say.sh
API=${API:-http://127.0.0.1:8000/api}
CTR=${CTR:-ohg-verify}
OLLAMA=${OLLAMA:-http://127.0.0.1:11434}
MODEL_TAG=${MODEL_TAG:-qwen3.6:27b-coder}
CID=${1:?usage: diagnose-run.sh <conversation-id>}

step "events endpoint shape"
for q in "" "?limit=200"; do
  R=$(curl -s "$API/conversations/$CID/events$q")
  printf '   GET /events%-11s -> %s\n' "${q:-(none)}" "$(printf '%s' "$R" | head -c 160 | tr '\n' ' ')"
done
printf '   count endpoint -> %s\n' "$(curl -s "$API/conversations/$CID/events/count" | head -c 80)"

step "last error lines from $CTR (filtered)"
docker logs "$CTR" 2>&1 | grep -iE 'error|exception|traceback|refused|not found|litellm|ollama' \
  | grep -v 'LOG_JSON' | tail -8 | cut -c1-220 \
  | sed 's/^/   /' || warn "no matching log lines"

step "is $MODEL_TAG reachable and tool-capable"
C=$(curl -s -o /dev/null -w '%{http_code}' "$OLLAMA/api/tags")
chk "ollama /api/tags" "$C" "200"
R=$(curl -s "$OLLAMA/v1/chat/completions" -H 'content-type: application/json' -d "{
  \"model\":\"$MODEL_TAG\",\"max_tokens\":40,
  \"messages\":[{\"role\":\"user\",\"content\":\"call the ping tool\"}],
  \"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"ping\",\"description\":\"ping\",
    \"parameters\":{\"type\":\"object\",\"properties\":{}}}}]}")
if printf '%s' "$R" | grep -q tool_calls; then ok "model emits native tool_calls"
elif printf '%s' "$R" | grep -qi error; then fail "model call errored: $(printf '%s' "$R" | head -c 200)"
else warn "no tool_calls in reply: $(printf '%s' "$R" | head -c 200)"; fi
