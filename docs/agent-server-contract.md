# Verified agent-server contract (pinned 1.41.0)

Every fact here was read off the live `/openapi.json` of the pinned image or the 1.41.0 sdist on
2026-08-09, not from documentation. ADR-015: expose only verified-native fields; source beats docs.
Evidence: `docs/evidence/agent-server-openapi.json` (operator machine), `docs/evidence/adr014-item1/`.

Base URL: `http://127.0.0.1:8000/api`. 102 routes total. Docs at `/docs`.

## Starting a conversation

`POST /api/conversations` — body `StartConversationRequest`, only `workspace` is required.

Verified-present fields: `agent`, `agent_definitions`, `agent_launch_additions`, `agent_profile_id`,
`agent_settings`, `autotitle`, `client_tools`, `confirmation_policy`, `conversation_id`,
`hook_config`, `initial_message`, `max_iterations`, `observability_metadata`,
`observability_span_name`, `observability_tags`, `parent_conversation_id`, `plugins`, `secrets`,
`secrets_encrypted`, `security_analyzer`, `stuck_detection`, `tags`, `title_llm_profile`,
`tool_module_qualnames`, `user_id`, `workspace`, `worktree`.

- `workspace` → `LocalWorkspace`, required key `working_dir`, plus `kind`.
- `agent.llm` → `LLM`, fields incl. `model`, `base_url`, `api_key`, `native_tool_calling`.
  Default model is `gpt-5.5`; for Colossus use `ollama_chat/<tag>` with `base_url`
  `http://127.0.0.1:11434`.
- `agent.tools` → list of `{name, params}`.
  **The name is the derived registry key, not the class name.** `__init_subclass__` sets it to
  `_camel_to_snake(cls.__name__).removesuffix("_tool")` (`openhands/sdk/tool/tool.py:236-241`).
  So `TerminalTool` → `terminal`, `FileEditorTool` → `file_editor`. The `Tool.name` docstring
  examples in the SDK say `"TerminalTool"` and **do not resolve**.
- `tool_module_qualnames` → `{registry_key: module_path}`. Required alongside `tools`: the registry
  is only populated when the defining module is imported (`conversation_service.py:1382`).
  `{"terminal": "openhands.tools.terminal", "file_editor": "openhands.tools.file_editor"}`.
- `hook_config` → `HookConfig`, keys `pre_tool_use`, `post_tool_use`, `user_prompt_submit`,
  `session_start`, `session_end`, `stop`. Each is a list of `HookMatcher{matcher, hooks}`;
  each hook is a `HookDefinition`, only `command` required, plus `type`, `name`, `prompt`,
  `system_prompt`, `tools`, `timeout` (60), `max_iterations` (3), `async`.
  **Hooks can be passed inline per conversation — no `.openhands/hooks.json` file is needed.**
- `confirmation_policy` → `ConfirmationPolicyBase`. Defaults to never.

## Driving it

| Purpose | Route |
|---|---|
| run | `POST /api/conversations/{id}/run` |
| pause / stop / interrupt | `POST .../pause`, `.../goal/stop`, `.../interrupt` |
| send message | `POST .../events` (`SendMessageRequest`) |
| respond to confirmation | `POST .../events/respond_to_confirmation` (`ConfirmationResponseRequest`) |
| set confirmation policy | `POST .../confirmation_policy` (`SetConfirmationPolicyRequest`) |
| set security analyzer | `POST .../security_analyzer` |
| switch model at runtime | `POST .../switch_llm` |
| fork | `POST .../fork` |
| read workspace file | `GET .../workspace/{file_path}` |
| event count | `GET .../events/count` |
| search events | `GET .../events/search` |

## Known rough edges on this build

- `GET /api/conversations/{id}/events` **rejects a bodyless GET** with
  `{"detail":[{"type":"missing","loc":["body"]}]}`. Use `/events/search` or `/events/count`.
- `GET /api/conversations/{id}` can raise a server-side validation error mid-run; `agent_state`
  may come back `{}` and `current_model_id` `null`. Treat as best-effort, never as the source of
  truth for run state.
- `execution_status: error` is also what you get when the agent exhausts `max_iterations` because
  every action was denied. Error is not evidence of malfunction.
