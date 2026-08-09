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

export interface AgentConfiguration {
  kind: 'Agent';
  llm: LlmConfiguration;
  tools: AgentTool[];
}

export interface StartConversationRequest {
  workspace: LocalWorkspace;
  agent: AgentConfiguration;
  initial_message?: SendMessageRequest;
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
}

export interface AgentServerEvent {
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
  reason?: string;
}

/**
 * ConfirmationPolicyBase is a native discriminated union. This client deliberately does not
 * reproduce its variants: the verified contract establishes only that the request wraps `policy`.
 */
export type ConfirmationPolicy = object;

export interface SetConfirmationPolicyRequest {
  policy: ConfirmationPolicy;
}

/**
 * Colossus's selected local coder model (ADR-012). Both tool registry keys and their module imports
 * are required: `terminal` / `file_editor` are derived registry keys, and the server only populates
 * those registries after importing the matching modules (agent-server contract, "Starting a
 * conversation").
 */
export function defaultStartRequest(goal: string): StartConversationRequest {
  return {
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
  };
}
