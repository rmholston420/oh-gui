import { afterEach, describe, expect, it, vi } from 'vitest';
import { agentServer } from './agentServer';
import { alwaysConfirm, confirmRisky, neverConfirm } from './types';

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

  it('serializes each native confirmation policy with its kind discriminator', async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await agentServer.setConfirmationPolicy('conversation-1', alwaysConfirm());
    await agentServer.setConfirmationPolicy('conversation-1', neverConfirm());
    await agentServer.setConfirmationPolicy('conversation-1', confirmRisky('MEDIUM', false));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/conversations/conversation-1/confirmation_policy',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ policy: { kind: 'AlwaysConfirm' } }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/conversations/conversation-1/confirmation_policy',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ policy: { kind: 'NeverConfirm' } }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/conversations/conversation-1/confirmation_policy',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          policy: { kind: 'ConfirmRisky', threshold: 'MEDIUM', confirm_unknown: false },
        }),
      }),
    );
  });
});
