import { describe, expect, it } from 'vitest';
import { defaultStartRequest } from './types';

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
  });
});
