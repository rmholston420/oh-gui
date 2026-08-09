import { describe, expect, it } from 'vitest';
import { alwaysConfirm, defaultStartRequest, neverConfirm } from './types';

describe('defaultStartRequest', () => {
  it('uses the verified Colossus tool registry keys and module imports', () => {
    const request = defaultStartRequest('List the workspace files.');

    expect(request.agent.tools).toEqual([{ name: 'terminal' }, { name: 'file_editor' }]);
    expect(request.tool_module_qualnames).toEqual({
      terminal: 'openhands.tools.terminal',
      file_editor: 'openhands.tools.file_editor',
    });
    expect(request.agent.llm).toEqual({
      model: 'ollama_chat/qwen3.6:35b-a3b-mtp-coder',
      base_url: 'http://127.0.0.1:11434',
    });
    expect(request.confirmation_policy).toEqual({
      kind: 'ConfirmRisky',
      threshold: 'HIGH',
      confirm_unknown: true,
    });
    expect(request.hook_config).toBeUndefined();
  });

  it('includes a pre-tool-use hook only when a command is configured', () => {
    const withoutHook = defaultStartRequest('Inspect the workspace.', {
      confirmationPolicy: alwaysConfirm(),
      preToolUseHookCommand: '   ',
    });
    const withHook = defaultStartRequest('Inspect the workspace.', {
      confirmationPolicy: neverConfirm(),
      preToolUseHookCommand: ' /opt/ohgui/within-envelope ',
    });

    expect(withoutHook.hook_config).toBeUndefined();
    expect(withHook).toMatchObject({
      confirmation_policy: { kind: 'NeverConfirm' },
      hook_config: {
        pre_tool_use: [
          { matcher: '*', hooks: [{ type: 'command', command: '/opt/ohgui/within-envelope' }] },
        ],
      },
    });
  });
});
