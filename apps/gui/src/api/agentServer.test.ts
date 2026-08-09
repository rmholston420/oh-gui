import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentServer } from './agentServer';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('agentServer', () => {
  it('surfaces a non-200 response instead of swallowing it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('server unavailable', { status: 503 })));

    await expect(agentServer.run('conversation-1')).rejects.toThrow(
      'POST /conversations/conversation-1/run failed (503): server unavailable',
    );
  });
});
