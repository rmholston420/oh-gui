import type {
  GitChange,
  GitDiff,
  ConfirmationResponseRequest,
  ListPluginsRequest,
  PluginsResponse,
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
  listPlugins(request?: ListPluginsRequest): Promise<PluginsResponse>;
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

  /**
   * `GET /api/git/changes?path=<repo>`. The path has **two** prefixes: `/api` on the including
   * router (`api.py:428`) and `/git` on `git_router` itself (`git_router.py:22`). Reading only the
   * `@git_router.get("/changes")` decorator yields `/api/changes`, which is a 404.. `path` is the **repository directory**.
   * A path that is not a git repository returns `[]`, not an error (`git_router.py:47`).
   */
  async listGitChanges(repoPath: string, ref?: string) {
    const query = new URLSearchParams({ path: repoPath });
    if (ref) query.set('ref', ref);
    return requestJson<GitChange[]>(`/git/changes?${query.toString()}`);
  },

  /**
   * `GET /api/git/diff?path=<file>` (`git_router.py:22,131`). Here `path` is a **single file**, not the
   * repository -- the two endpoints spell the same parameter name differently, which is the kind
   * of asymmetry that only a reading of the router reveals.
   *
   * `ref` and `commit` are mutually exclusive; sending both is a 400 (`git_router.py:141`).
   */
  async getGitDiff(filePath: string, options: { ref?: string; commit?: string } = {}) {
    if (options.ref && options.commit) {
      throw new Error("getGitDiff: 'ref' and 'commit' are mutually exclusive (git_router.py:141)");
    }
    const query = new URLSearchParams({ path: filePath });
    if (options.ref) query.set('ref', options.ref);
    if (options.commit) query.set('commit', options.commit);
    return requestJson<GitDiff>(`/git/diff?${query.toString()}`);
  },

  async listPlugins(request = {}) {
    // POST, not GET: the endpoint takes a body selecting which local sources to scan
    // (plugins_router.py:222). `project_dir` is resolved by the agent-server inside its own
    // container, so it is a container path, not a host path.
    return requestJson<PluginsResponse>('/plugins', jsonPost(request));
  },
};
