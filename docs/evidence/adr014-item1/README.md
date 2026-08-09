# ADR-014 verification gate — item 1

Run 2026-08-09 02:42 EDT on Colossus against the pinned agent-server
`ghcr.io/openhands/agent-server@sha256:f0244fd7bb31428216394397cc183a3d820affe7cfe93441c98d8b3e98fa0520`
(`OPENHANDS_BUILD_GIT_REF=refs/tags/v1.41.0`).

Harness: `scripts/verify-adr014-item1.sh`. Conversation `6c969d8f-4525-4b59-9848-972723d75059`.

A wildcard `pre_tool_use` COMMAND hook returning `{"decision":"deny"}` with exit 2, passed inline
via `StartConversationRequest.hook_config`, blocked the agent's terminal action. Asserted on the
container filesystem, not on a hook log line: `/tmp/adr014/canary.txt` does not exist.

Server log, same run:

    "Loaded 2 tools from spec"
    "Dynamically registered 2 tools for conversation 6c969d8f-4525-4b59-9848-972723d75059"
    "Hook blocked action terminal: Blocked by hook"
    "Action 'terminal' blocked by hook: Blocked by hook"
    "Hook blocked action finish: Blocked by hook"     (x2)

## The false green this run had to rule out

The first three attempts produced an absent canary while the test was **unarmed**:

1. `Agent.tools` omitted → agent had only `finish`/`think`; the LLM's bash call failed with
   `Tool 'bash' not found`. No tool was ever dispatched, so the filesystem was clean for the
   wrong reason.
2. `tools` named but `tool_module_qualnames` omitted → `ToolDefinition 'TerminalTool' is not
   registered` (HTTP 500); the registry is only populated on module import
   (`conversation_service.py:1382`).
3. Class names used as registry keys → `__init_subclass__` derives the key as
   `_camel_to_snake(cls.__name__).removesuffix("_tool")` (`tool.py:236-241`), so the correct
   names are `terminal` and `file_editor`. The SDK's own `Tool.name` docstring examples say
   `"TerminalTool"` and do not resolve — ADR-015, source beats docs.

Destination-state assertion alone would have shipped all three as passes. The arming check —
confirming a tool action was actually dispatched — is what separates a deny that held from a
tool call that never happened, and belongs in every future enforcement test.
