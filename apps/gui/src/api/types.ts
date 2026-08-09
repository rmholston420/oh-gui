/**
 * Hand-authored transport types for the pinned 1.41.0 Agent Server.
 *
 * Native basis for fields not enumerated in docs/agent-server-contract.md:
 * - StartConversationRequest / SendMessageRequest:
 *   openhands_sdk-1.41.0/openhands/sdk/conversation/request.py:64-72,93-145
 * - LocalWorkspace and Agent discriminators:
 *   openhands_sdk-1.41.0/openhands/sdk/utils/models.py:75-81
 * - ConversationInfo.id / execution_status and EventPage:
 *   openhands_agent_server-1.41.0/openhands/agent_server/models.py:123-150,404-406
 * - ConversationExecutionStatus values:
 *   openhands_sdk-1.41.0/openhands/sdk/conversation/state.py:48-60
 */

export interface LocalWorkspace {
  kind: 'LocalWorkspace';
  working_dir: string;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface SendMessageRequest {
  role?: 'user' | 'system' | 'assistant' | 'tool';
  content: TextContent[];
  run?: boolean;
}

export interface AgentTool {
  name: 'terminal' | 'file_editor';
  params?: Record<string, unknown>;
}

export interface LlmConfiguration {
  model: string;
  base_url: string;
}

/**
 * Read-only native LLM fields returned inside `ConversationInfo.agent`.
 *
 * Native basis (SDK source, not documentation):
 * - `model`: openhands_sdk-1.41.0/openhands/sdk/llm/llm.py:241-245
 * - `base_url`: openhands_sdk-1.41.0/openhands/sdk/llm/llm.py:271-275
 * - `temperature`: openhands_sdk-1.41.0/openhands/sdk/llm/llm.py:346-356
 * - `max_input_tokens`: openhands_sdk-1.41.0/openhands/sdk/llm/llm.py:370-376
 * - `disable_vision`: openhands_sdk-1.41.0/openhands/sdk/llm/llm.py:457-462
 * - `native_tool_calling`: openhands_sdk-1.41.0/openhands/sdk/llm/llm.py:489-493
 *
 * Optionality is deliberate: an absent native field remains absent in the GUI rather than being
 * replaced with an optimistic default.
 */
export interface SdkNativeLlmConfiguration {
  model: string;
  base_url?: string | null;
  temperature?: number | null;
  max_input_tokens?: number | null;
  disable_vision?: boolean | null;
  native_tool_calling?: boolean | null;
}

/**
 * The Agent server serializes `ConversationInfo.agent` from its native `AgentBase` field
 * (openhands_agent_server-1.41.0/openhands/agent_server/models.py:319-325). `tools` is the
 * configured Agent tool collection (openhands_sdk-1.41.0/openhands/sdk/agent/agent.py:354-365).
 * This intentionally permits unknown tool shapes; only a string `name` is read for a count.
 */
export interface SdkNativeConversationAgent {
  kind?: string;
  llm?: SdkNativeLlmConfiguration | null;
  tools?: readonly { name?: unknown }[] | null;
}

export interface AgentConfiguration {
  kind: 'Agent';
  llm: LlmConfiguration;
  tools: AgentTool[];
}

export interface StartConversationRequest {
  workspace: LocalWorkspace;
  agent: AgentConfiguration;
  initial_message?: SendMessageRequest;
  confirmation_policy?: ConfirmationPolicy;
  hook_config?: HookConfig;
  tool_module_qualnames: {
    terminal: 'openhands.tools.terminal';
    file_editor: 'openhands.tools.file_editor';
  };
}

export type ConversationExecutionStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'waiting_for_confirmation'
  | 'finished'
  | 'error'
  | 'stuck'
  | 'deleting';

export interface ConversationInfo {
  id: string;
  execution_status: ConversationExecutionStatus;
  /** See `SdkNativeConversationAgent` for source provenance. */
  agent?: SdkNativeConversationAgent | null;
  /**
   * This is native only for ACP agent configurations:
   * openhands_agent_server-1.41.0/openhands/agent_server/models.py:293-305.
   * Regular `Agent` conversations do not expose a context-preserving model switch.
   */
  supports_runtime_model_switch?: boolean | null;
}

export interface AgentServerEvent {
  /**
   * Reliability reads ActionEvent.action/tool_name/tool_call_id/tool_call from
   * openhands_sdk-1.41.0/openhands/sdk/event/llm_convertible/action.py:24-58;
   * ObservationEvent.action_id and AgentErrorEvent.error are from
   * openhands_sdk-1.41.0/openhands/sdk/event/llm_convertible/observation.py:17-43,138-150.
   */
  id: string;
  timestamp: string;
  source: string;
  [field: string]: unknown;
}

export interface EventPage {
  items: AgentServerEvent[];
  next_page_id: string | null;
}

export interface ConfirmationResponseRequest {
  accept: boolean;
  reason: string;
}

/**
 * Native `ConfirmationPolicyBase` discriminated union:
 * openhands_sdk-1.41.0/openhands/sdk/security/confirmation_policy.py:27-53.
 * `kind` serializes to the concrete Python class name through DiscriminatedUnionMixin
 * (openhands_sdk-1.41.0/openhands/sdk/utils/models.py:192-344).
 */
export interface AlwaysConfirmPolicy {
  kind: 'AlwaysConfirm';
}

export interface NeverConfirmPolicy {
  kind: 'NeverConfirm';
}

export type ConfirmationRiskThreshold = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ConfirmRiskyPolicy {
  kind: 'ConfirmRisky';
  threshold: ConfirmationRiskThreshold;
  confirm_unknown: boolean;
}

export type ConfirmationPolicy =
  | AlwaysConfirmPolicy
  | NeverConfirmPolicy
  | ConfirmRiskyPolicy;

export const alwaysConfirm = (): AlwaysConfirmPolicy => ({ kind: 'AlwaysConfirm' });

export const neverConfirm = (): NeverConfirmPolicy => ({ kind: 'NeverConfirm' });

export const confirmRisky = (
  threshold: ConfirmationRiskThreshold = 'HIGH',
  confirmUnknown = true,
): ConfirmRiskyPolicy => ({
  kind: 'ConfirmRisky',
  threshold,
  confirm_unknown: confirmUnknown,
});

export interface SetConfirmationPolicyRequest {
  policy: ConfirmationPolicy;
}

/**
 * The exact inline `pre_tool_use` subset sent when a command is explicitly configured.
 * `HookConfig`, `HookMatcher`, and command `HookDefinition` are defined at
 * openhands_sdk-1.41.0/openhands/sdk/hooks/config.py:47-64,113-120,159-205.
 */
export interface HookConfig {
  pre_tool_use: [
    {
      matcher: '*';
      hooks: [{ type: 'command'; command: string }];
    },
  ];
}

export interface DefaultStartRequestOptions {
  confirmationPolicy?: ConfirmationPolicy;
  preToolUseHookCommand?: string | undefined;
}

/**
 * Colossus's selected local coder model (ADR-012). Both tool registry keys and their module imports
 * are required: `terminal` / `file_editor` are derived registry keys, and the server only populates
 * those registries after importing the matching modules (agent-server contract, "Starting a
 * conversation").
 */
export function defaultStartRequest(
  goal: string,
  {
    confirmationPolicy = confirmRisky(),
    preToolUseHookCommand,
  }: DefaultStartRequestOptions = {},
): StartConversationRequest {
  const request: StartConversationRequest = {
    workspace: {
      kind: 'LocalWorkspace',
      working_dir: '/workspace/project',
    },
    agent: {
      kind: 'Agent',
      llm: {
        model: 'ollama_chat/qwen3.6:35b-a3b-mtp-coder',
        base_url: 'http://127.0.0.1:11434',
      },
      tools: [{ name: 'terminal' }, { name: 'file_editor' }],
    },
    tool_module_qualnames: {
      terminal: 'openhands.tools.terminal',
      file_editor: 'openhands.tools.file_editor',
    },
    initial_message: {
      role: 'user',
      content: [{ type: 'text', text: goal }],
      run: false,
    },
    confirmation_policy: confirmationPolicy,
  };

  const command = preToolUseHookCommand?.trim();
  if (command) {
    request.hook_config = {
      pre_tool_use: [{ matcher: '*', hooks: [{ type: 'command', command }] }],
    };
  }

  return request;
}

/**
 * A skill bundled inside a plugin.
 *
 * Native: `PluginSkillSummary`, openhands_agent_server-1.41.0/openhands/agent_server/
 * plugins_service.py:144-148. Only `name` is guaranteed; `description` is nullable upstream.
 */
export interface PluginSkillSummary {
  readonly name: string;
  readonly description: string | null;
}

/**
 * A locally-available plugin.
 *
 * Native: `PluginInfo`, plugins_router.py:72-85. Returned by `POST /api/plugins`, which reports
 * plugins discovered in the user and project directories.
 *
 * This is deliberately not `InstalledPluginResponse`. `GET /plugins/installed` reports only the
 * registry-managed installs performed through `POST /plugins/install`; a plugin discovered from
 * `.agents/plugins/` never appears there. Verified live against the pinned agent-server: with the
 * repo's own `oh-gui` plugin on disk, `/api/plugins` returned it with 18 skills while
 * `/api/plugins/installed` returned `{"plugins": []}`.
 */
export interface PluginInfo {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly path: string;
  readonly skills: readonly PluginSkillSummary[];
  readonly files: readonly string[];
}

/** Native: `PluginsRequest`, plugins_router.py:58-69. */
export interface ListPluginsRequest {
  readonly load_user?: boolean;
  readonly load_project?: boolean;
  readonly project_dir?: string | null;
}

/** Native: `PluginsResponse`, plugins_router.py:87-90. */
export interface PluginsResponse {
  readonly plugins: readonly PluginInfo[];
}


/**
 * Native: `GitChangeStatus`, `openhands/sdk/git/models.py:9`. Exactly these four values -- there is
 * no RENAMED, COPIED, or UNTRACKED in the SDK enum, so the UI must not invent one.
 */
export type GitChangeStatus = 'MOVED' | 'ADDED' | 'DELETED' | 'UPDATED';

/** Native: `GitChange`, `openhands/sdk/git/models.py:16`. Returned by `GET /api/changes`. */
export interface GitChange {
  readonly status: GitChangeStatus;
  /** POSIX path, serialised by `_serialize_path` (models.py:20). */
  readonly path: string;
}

/**
 * Native: `GitDiff`, `openhands/sdk/git/models.py:25`. Returned by `GET /api/diff`.
 *
 * These are **whole file contents**, not a unified diff -- the server hands back both sides and
 * the client computes the difference. Either side is `null`: `original` for an added file,
 * `modified` for a deleted one. A path outside a git repository yields both `null` rather than an
 * error (`git_router.py:112`), so "no diff" and "not a repo" look identical over the wire.
 */
export interface GitDiff {
  readonly modified: string | null;
  readonly original: string | null;
}
