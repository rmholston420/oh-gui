import { describe, expect, it } from 'vitest';
import type { ConversationInfo } from '../../api/types';
import {
  defaultGuiLocalModelProfileConfig,
  nativeModelProfileFromConversation,
  resolveModelProfile,
} from './model-profile';

describe('model profile provenance boundary', () => {
  it('reads deterministic-replay inputs through ConversationInfo.agent instead of inventing an SDK field', () => {
    const conversation: ConversationInfo = {
      id: 'conversation-1',
      execution_status: 'running',
      agent: {
        kind: 'Agent',
        llm: {
          model: 'ollama_chat/qwen3.6:35b-a3b-mtp-coder',
          base_url: 'http://127.0.0.1:11434',
          max_input_tokens: 131_072,
          native_tool_calling: true,
          temperature: 0,
          disable_vision: false,
        },
        tools: [{ name: 'terminal' }, { name: 'file_editor' }],
      },
    };

    const native = nativeModelProfileFromConversation(conversation);
    expect(native).toMatchObject({
      model: 'ollama_chat/qwen3.6:35b-a3b-mtp-coder',
      endpoint: 'http://127.0.0.1:11434',
      configuredContextLimit: 131_072,
      nativeToolCalling: true,
      samplingTemperature: 0,
      visionDisabled: false,
      enabledToolNames: ['terminal', 'file_editor'],
    });

    const profile = resolveModelProfile(native!, defaultGuiLocalModelProfileConfig(native!.model));
    expect(profile.deterministicReplay).toBe(true);
    expect(profile.deterministic_replay).toBe(true);
    expect(profile.deterministicReplaySource).toBe('sdk-native-temperature');
  });

  it('keeps missing native values unavailable and defaults deterministic replay to false', () => {
    const conversation: ConversationInfo = {
      id: 'conversation-2',
      execution_status: 'idle',
      agent: { llm: { model: 'local/unknown' } },
    };
    const native = nativeModelProfileFromConversation(conversation)!;
    const profile = resolveModelProfile(native, defaultGuiLocalModelProfileConfig(native.model));

    expect(native.endpoint).toBeNull();
    expect(native.configuredContextLimit).toBeNull();
    expect(native.nativeToolCalling).toBeNull();
    expect(profile.effectiveContextLimit).toBeNull();
    expect(profile.deterministicReplay).toBe(false);
    expect(profile.deterministic_replay).toBe(false);
    expect(profile.deterministicReplaySource).toBe('gui-local-default');
  });

  it('keeps GUI-local fields separate while allowing a manual context field', () => {
    const native = nativeModelProfileFromConversation({
      id: 'conversation-3',
      execution_status: 'idle',
      agent: { llm: { model: 'local/model' } },
    })!;
    const local = {
      ...defaultGuiLocalModelProfileConfig(native.model),
      contextLimitOverride: 65_536,
      quantization: 'Q4_K_M',
      gpuAssignment: 'RTX 5090',
      dataEgress: 'local-only' as const,
      architecture: 'dense' as const,
    };

    const profile = resolveModelProfile(native, local);
    expect(profile.effectiveContextLimit).toBe(65_536);
    expect(profile.effectiveContextLimitSource).toBe('gui-local');
    expect(profile.localConfig.quantization).toBe('Q4_K_M');
    expect(profile.sdkNative.configuredContextLimit).toBeNull();
  });

  it('defaults Qwen3 27B-35B to dense unless its native model identifier confirms MoE', () => {
    expect(defaultGuiLocalModelProfileConfig('ollama_chat/qwen3:35b').architecture).toBe('dense');
    expect(
      defaultGuiLocalModelProfileConfig('ollama_chat/qwen3.6:35b-a3b-mtp-coder').architecture,
    ).toBe('moe');
  });
});
