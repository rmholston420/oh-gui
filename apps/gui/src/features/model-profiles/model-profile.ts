import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AgentConfiguration,
  ConversationInfo,
  SdkNativeLlmConfiguration,
} from '../../api/types';

/**
 * SDK-native facts read through the existing Agent Server anti-corruption layer.
 * Each member is copied only from `ConversationInfo.agent` (or the native Agent start request),
 * never guessed from a model name. Source symbols are cited at the corresponding input type.
 */
export interface SdkNativeModelProfileFields {
  readonly model: string;
  readonly endpoint: string | null;
  readonly configuredContextLimit: number | null;
  readonly nativeToolCalling: boolean | null;
  readonly samplingTemperature: number | null;
  readonly visionDisabled: boolean | null;
  readonly enabledToolNames: readonly string[];
  readonly supportsRuntimeModelSwitch: boolean | null;
}

/**
 * GUI-local operator configuration. These values are never sent to Agent Server and are visibly
 * labelled as local configuration in the UI. They are deliberately separate from SDK-native facts.
 */
export interface GuiLocalModelProfileConfig {
  readonly contextLimitOverride: number | null;
  readonly visionSupport: boolean | null;
  readonly quantization: string | null;
  readonly gpuAssignment: string | null;
  readonly dataEgress: 'local-only' | 'cloud' | 'unknown';
  readonly modelFamilyGeneration: string | null;
  readonly parameterCount: string | null;
  readonly architecture: 'dense' | 'moe' | null;
  readonly deterministicReplayOverride: boolean | null;
  readonly cloudFallbackModel: string | null;
}

export interface ModelProfile {
  readonly sdkNative: SdkNativeModelProfileFields;
  readonly localConfig: GuiLocalModelProfileConfig;
  /** `temperature === 0` is the native deterministic setting; otherwise this is a local default. */
  readonly deterministicReplay: boolean;
  /** Phase 1 compatibility spelling required by telemetry §8.4 / ADR-017. */
  readonly deterministic_replay: boolean;
  readonly deterministicReplaySource: 'sdk-native-temperature' | 'gui-local-default';
  readonly effectiveContextLimit: number | null;
  readonly effectiveContextLimitSource: 'sdk-native' | 'gui-local' | 'unavailable';
}

const STORAGE_PREFIX = 'oh-gui:model-profile:';

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function enabledToolNames(tools: readonly { name?: unknown }[] | null | undefined): string[] {
  return (tools ?? []).flatMap((tool) => (typeof tool.name === 'string' ? [tool.name] : []));
}

/**
 * Reads the native response object at the ACL boundary. `ConversationInfo.agent` is server-native
 * (`openhands_agent_server.../models.py:319-325`), while the nested LLM symbols are documented in
 * `SdkNativeLlmConfiguration` above. This is the Phase 1 deterministic-replay contract read.
 */
export function nativeModelProfileFromConversation(
  conversation: ConversationInfo,
): SdkNativeModelProfileFields | null {
  const llm = conversation.agent?.llm;
  if (!llm || !nullableString(llm.model)) return null;

  return nativeModelProfileFromLlm(llm, conversation.agent?.tools, conversation.supports_runtime_model_switch);
}

function nativeModelProfileFromLlm(
  llm: SdkNativeLlmConfiguration,
  tools: readonly { name?: unknown }[] | null | undefined,
  supportsRuntimeModelSwitch: boolean | null | undefined,
): SdkNativeModelProfileFields {
  return {
    model: llm.model,
    endpoint: nullableString(llm.base_url),
    configuredContextLimit: nullableNumber(llm.max_input_tokens),
    nativeToolCalling: typeof llm.native_tool_calling === 'boolean' ? llm.native_tool_calling : null,
    samplingTemperature:
      typeof llm.temperature === 'number' && Number.isFinite(llm.temperature) ? llm.temperature : null,
    visionDisabled: typeof llm.disable_vision === 'boolean' ? llm.disable_vision : null,
    enabledToolNames: enabledToolNames(tools),
    supportsRuntimeModelSwitch:
      typeof supportsRuntimeModelSwitch === 'boolean' ? supportsRuntimeModelSwitch : null,
  };
}

/** Reads the same native values from the outgoing Agent configuration before the first poll. */
export function nativeModelProfileFromStartAgent(
  agent: AgentConfiguration,
): SdkNativeModelProfileFields {
  return nativeModelProfileFromLlm(agent.llm, agent.tools, null);
}

export function defaultGuiLocalModelProfileConfig(
  model: string | null,
): GuiLocalModelProfileConfig {
  const familyGeneration = model?.match(/(qwen[\w.-]*)/i)?.[1] ?? null;
  const parameterCount = model?.match(/(?:^|[:/-])(\d+(?:\.\d+)?b)(?:[-:/]|$)/i)?.[1]?.toUpperCase() ?? null;
  const qwen3DenseRange = /^qwen3/i.test(familyGeneration ?? '') && ['27B', '35B'].includes(parameterCount ?? '');
  const confirmedMoe = /(?:^|[-:/])a\d+(?:\.\d+)?b(?:[-:/]|$)/i.test(model ?? '');

  return {
    contextLimitOverride: null,
    visionSupport: null,
    quantization: null,
    gpuAssignment: null,
    dataEgress: 'unknown',
    modelFamilyGeneration: familyGeneration,
    parameterCount,
    // §8.4 defaults Qwen3 27B-35B profiles to dense unless the native model identifier carries
    // an active-parameter MoE marker (for example, `35b-a3b`).
    architecture: qwen3DenseRange ? (confirmedMoe ? 'moe' : 'dense') : null,
    deterministicReplayOverride: null,
    cloudFallbackModel: null,
  };
}

export function resolveModelProfile(
  sdkNative: SdkNativeModelProfileFields,
  localConfig: GuiLocalModelProfileConfig,
): ModelProfile {
  const isNativeDeterministic = sdkNative.samplingTemperature === 0;
  const effectiveContextLimit =
    sdkNative.configuredContextLimit ?? localConfig.contextLimitOverride ?? null;

  return {
    sdkNative,
    localConfig,
    // The SDK defines temperature 0.0 as deterministic output; null is never promoted to true.
    deterministicReplay:
      isNativeDeterministic ||
      (sdkNative.samplingTemperature === null && localConfig.deterministicReplayOverride === true),
    deterministic_replay:
      isNativeDeterministic ||
      (sdkNative.samplingTemperature === null && localConfig.deterministicReplayOverride === true),
    deterministicReplaySource: isNativeDeterministic
      ? 'sdk-native-temperature'
      : 'gui-local-default',
    effectiveContextLimit,
    effectiveContextLimitSource:
      sdkNative.configuredContextLimit !== null
        ? 'sdk-native'
        : localConfig.contextLimitOverride !== null
          ? 'gui-local'
          : 'unavailable',
  };
}

function readStoredConfig(model: string): GuiLocalModelProfileConfig {
  const defaults = defaultGuiLocalModelProfileConfig(model);
  if (typeof window === 'undefined') return defaults;

  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(`${STORAGE_PREFIX}${model}`) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return defaults;
    return { ...defaults, ...(parsed as Partial<GuiLocalModelProfileConfig>) };
  } catch {
    return defaults;
  }
}

/**
 * Browser-local profile store. It persists only `GuiLocalModelProfileConfig`; SDK-native values are
 * always re-read from the Agent Server response and cannot be overwritten by this store.
 */
export function useModelProfileStore(sdkNative: SdkNativeModelProfileFields) {
  const [localConfigs, setLocalConfigs] = useState<Record<string, GuiLocalModelProfileConfig>>(() => ({
    [sdkNative.model]: readStoredConfig(sdkNative.model),
  }));
  const localConfig = localConfigs[sdkNative.model] ?? defaultGuiLocalModelProfileConfig(sdkNative.model);

  useEffect(() => {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${sdkNative.model}`, JSON.stringify(localConfig));
    } catch {
      // Operator configuration is optional; a private or full storage area must not block a run.
    }
  }, [localConfig, sdkNative.model]);

  const updateLocalConfig = useCallback((patch: Partial<GuiLocalModelProfileConfig>) => {
    setLocalConfigs((current) => ({
      ...current,
      [sdkNative.model]: {
        ...(current[sdkNative.model] ?? defaultGuiLocalModelProfileConfig(sdkNative.model)),
        ...patch,
      },
    }));
  }, [sdkNative.model]);

  const profile = useMemo(
    () => resolveModelProfile(sdkNative, localConfig),
    [localConfig, sdkNative],
  );

  return { profile, updateLocalConfig };
}
