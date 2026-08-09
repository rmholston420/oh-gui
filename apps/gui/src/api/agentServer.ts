import type {
  ConfirmationResponseRequest,
  ConfirmationPolicy,
  ConversationInfo,
  EventPage,
  SendMessageRequest,
  StartConversationRequest,
} from './types';

const baseUrl = (import.meta.env.VITE_AGENT_SERVER ?? '/api').replace(/\/$/, '');

export class AgentServerRequestError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    detail: string,
  ) {
    super(`${method} ${path} failed (${status})${detail ? `: ${detail}` : ''}`);
    this.name = 'AgentServerRequestError';
  }
}

async function readFailureDetail(response: Response): Promise<string> {
  const detail = await response.text();
  return detail.trim();
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new AgentServerRequestError(
      init.method ?? 'GET',
      path,
      response.status,
      await readFailureDetail(response),
    );
  }

  return (await response.json()) as T;
}

function jsonPost(body?: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function conversationPath(conversationId: string, suffix = ''): string {
  return `/conversations/${encodeURIComponent(conversationId)}${suffix}`;
}

export interface AgentServerClient {
  createConversation(request: StartConversationRequest): Promise<ConversationInfo>;
  run(conversationId: string): Promise<void>;
  pause(conversationId: string): Promise<void>;
  stop(conversationId: string): Promise<void>;
  sendMessage(conversationId: string, request: SendMessageRequest): Promise<void>;
  respondToConfirmation(
    conversationId: string,
    request: ConfirmationResponseRequest,
  ): Promise<void>;
  setConfirmationPolicy(conversationId: string, policy: ConfirmationPolicy): Promise<void>;
  getConversation(conversationId: string): Promise<ConversationInfo>;
  getEventCount(conversationId: string): Promise<number>;
  searchEvents(conversationId: string): Promise<EventPage>;
  readWorkspaceFile(conversationId: string, filePath: string): Promise<string>;
}

export const agentServer: AgentServerClient = {
  async createConversation(request) {
    return requestJson<ConversationInfo>('/conversations', jsonPost(request));
  },

  async run(conversationId) {
    await requestJson<object>(conversationPath(conversationId, '/run'), jsonPost());
  },

  async pause(conversationId) {
    await requestJson<object>(conversationPath(conversationId, '/pause'), jsonPost());
  },

  async stop(conversationId) {
    // `/goal/stop` only stops an active goal loop. Runs started through `/run` are immediately
    // cancelled by `/interrupt` and transition to paused:
    // openhands_agent_server-1.41.0/openhands/agent_server/conversation_router.py:250-267
    await requestJson<object>(conversationPath(conversationId, '/interrupt'), jsonPost());
  },

  async sendMessage(conversationId, request) {
    await requestJson<object>(conversationPath(conversationId, '/events'), jsonPost(request));
  },

  async respondToConfirmation(conversationId, request) {
    await requestJson<object>(
      conversationPath(conversationId, '/events/respond_to_confirmation'),
      jsonPost(request),
    );
  },

  async setConfirmationPolicy(conversationId, policy) {
    await requestJson<object>(
      conversationPath(conversationId, '/confirmation_policy'),
      jsonPost({ policy }),
    );
  },

  async getConversation(conversationId) {
    // The contract marks this endpoint best-effort only; consumers must not treat it as the
    // exclusive source of run state.
    return requestJson<ConversationInfo>(conversationPath(conversationId));
  },

  async getEventCount(conversationId) {
    return requestJson<number>(conversationPath(conversationId, '/events/count'));
  },

  async searchEvents(conversationId) {
    // Do not use GET /events: this pinned build rejects bodyless GETs. `/events/search` is the
    // verified replacement and returns the EventPage shape.
    return requestJson<EventPage>(conversationPath(conversationId, '/events/search'));
  },

  async readWorkspaceFile(conversationId, filePath) {
    const encodedPath = filePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const path = conversationPath(conversationId, `/workspace/${encodedPath}`);
    const response = await fetch(`${baseUrl}${path}`);
    if (!response.ok) {
      throw new AgentServerRequestError('GET', path, response.status, await readFailureDetail(response));
    }
    return response.text();
  },
};
