import type { AgentServerEvent } from '../../api/types';
import {
  type GuiLocalModelProfileConfig,
  type SdkNativeModelProfileFields,
  useModelProfileStore,
} from './model-profile';
import { detectFailureSignatures, reliabilityPosture } from './reliability';

export interface ModelProfilePanelProps {
  readonly sdkNative: SdkNativeModelProfileFields;
  readonly events: readonly AgentServerEvent[];
  readonly isReadOnlyViewport: boolean;
}

function nativeValue(value: string | number | boolean | null, unavailable = 'Not reported'): string {
  if (value === null) return unavailable;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function localValue(value: string | number | boolean | null, unset = 'Not set'): string {
  if (value === null) return unset;
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  return String(value);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-slate-800 py-2 last:border-b-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 min-w-0 break-words font-mono text-sm tabular-nums text-slate-100">{children}</dd>
    </div>
  );
}

function LocalInput({
  label,
  value,
  onChange,
  disabled,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string | number | null;
  onChange(value: string): void;
  disabled: boolean;
  type?: 'text' | 'number';
  placeholder?: string;
}) {
  return (
    <label className="block text-sm text-slate-300">
      <span>{label}</span>
      <input
        className="mt-1 block w-full rounded border border-slate-600 bg-night-950 px-2 py-1.5 font-mono text-sm tabular-nums outline-none focus:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    </label>
  );
}

function NativeFields({
  sdkNative,
  deterministicReplay,
  deterministicReplaySource,
  effectiveContextLimit,
  effectiveContextLimitSource,
}: {
  sdkNative: SdkNativeModelProfileFields;
  deterministicReplay: boolean;
  deterministicReplaySource: string;
  effectiveContextLimit: number | null;
  effectiveContextLimitSource: string;
}) {
  return (
    <section aria-labelledby="sdk-native-fields-heading" className="rounded border border-slate-700 bg-night-950 p-4">
      <header>
        <h3 id="sdk-native-fields-heading" className="font-semibold text-slate-100">
          SDK-native readings
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Read through the Agent Server boundary. An absent field stays unavailable.
        </p>
      </header>
      <dl className="mt-3 grid gap-x-5 sm:grid-cols-2">
        <Field label="Model name">{sdkNative.model}</Field>
        <Field label="Endpoint">{nativeValue(sdkNative.endpoint)}</Field>
        <Field label="Configured context limit">
          {effectiveContextLimit === null
            ? 'Not reported'
            : `${effectiveContextLimit.toLocaleString()} tokens`}{' '}
          <span className="font-sans text-xs text-slate-500">({effectiveContextLimitSource})</span>
        </Field>
        <Field label="Native tool calling">{nativeValue(sdkNative.nativeToolCalling)}</Field>
        <Field label="Vision disabled by SDK configuration">{nativeValue(sdkNative.visionDisabled)}</Field>
        <Field label="Sampling temperature">{nativeValue(sdkNative.samplingTemperature)}</Field>
        <Field label="Deterministic replay">
          {deterministicReplay ? 'Enabled' : 'Disabled'}{' '}
          <span className="font-sans text-xs text-slate-500">({deterministicReplaySource})</span>
        </Field>
        <Field label="Enabled tools">
          {sdkNative.enabledToolNames.length === 0
            ? 'Not reported'
            : `${sdkNative.enabledToolNames.length.toLocaleString()} configured`}
        </Field>
      </dl>
      {sdkNative.enabledToolNames.length >= 30 && (
        <p
          className="mt-3 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200"
          data-testid="tool-count-warning"
        >
          Soft warning: {sdkNative.enabledToolNames.length.toLocaleString()} concurrently enabled tools can
          degrade tool selection reliability. Reduce the active set where practical.
        </p>
      )}
    </section>
  );
}

function LocalConfigFields({
  localConfig,
  update,
  disabled,
}: {
  localConfig: GuiLocalModelProfileConfig;
  update(patch: Partial<GuiLocalModelProfileConfig>): void;
  disabled: boolean;
}) {
  return (
    <section aria-labelledby="local-model-config-heading" className="rounded border border-slate-700 bg-night-950 p-4">
      <header>
        <h3 id="local-model-config-heading" className="font-semibold text-slate-100">
          Local operator configuration
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Stored only in this GUI. These fields are not SDK fields and are never sent to Agent Server.
        </p>
      </header>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <LocalInput
          label="Manual context limit (tokens)"
          type="number"
          value={localConfig.contextLimitOverride}
          placeholder="Unknown"
          disabled={disabled}
          onChange={(value) => update({ contextLimitOverride: value ? Number(value) : null })}
        />
        <LocalInput
          label="Quantization"
          value={localConfig.quantization}
          placeholder="e.g. Q4_K_M"
          disabled={disabled}
          onChange={(value) => update({ quantization: value.trim() || null })}
        />
        <LocalInput
          label="GPU assignment"
          value={localConfig.gpuAssignment}
          placeholder="e.g. RTX 5090"
          disabled={disabled}
          onChange={(value) => update({ gpuAssignment: value.trim() || null })}
        />
        <LocalInput
          label="Model family / generation"
          value={localConfig.modelFamilyGeneration}
          placeholder="Manual"
          disabled={disabled}
          onChange={(value) => update({ modelFamilyGeneration: value.trim() || null })}
        />
        <LocalInput
          label="Parameter count"
          value={localConfig.parameterCount}
          placeholder="Manual"
          disabled={disabled}
          onChange={(value) => update({ parameterCount: value.trim() || null })}
        />
        <LocalInput
          label="Cloud fallback model"
          value={localConfig.cloudFallbackModel}
          placeholder="Not configured"
          disabled={disabled}
          onChange={(value) => update({ cloudFallbackModel: value.trim() || null })}
        />
        <label className="block text-sm text-slate-300">
          <span>Vision support (manual)</span>
          <select
            className="mt-1 block w-full rounded border border-slate-600 bg-night-950 px-2 py-1.5 font-mono text-sm outline-none focus:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
            value={localConfig.visionSupport === null ? 'unknown' : String(localConfig.visionSupport)}
            disabled={disabled}
            onChange={(event) =>
              update({
                visionSupport:
                  event.target.value === 'unknown' ? null : event.target.value === 'true',
              })
            }
          >
            <option value="unknown">Unknown</option>
            <option value="true">Supported</option>
            <option value="false">Not supported</option>
          </select>
        </label>
        <label className="block text-sm text-slate-300">
          <span>Architecture (manual)</span>
          <select
            className="mt-1 block w-full rounded border border-slate-600 bg-night-950 px-2 py-1.5 font-mono text-sm outline-none focus:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
            value={localConfig.architecture ?? 'unknown'}
            disabled={disabled}
            onChange={(event) =>
              update({
                architecture:
                  event.target.value === 'unknown'
                    ? null
                    : (event.target.value as GuiLocalModelProfileConfig['architecture']),
              })
            }
          >
            <option value="unknown">Unknown</option>
            <option value="dense">Dense</option>
            <option value="moe">Mixture of experts</option>
          </select>
        </label>
        <label className="block text-sm text-slate-300">
          <span>Data egress status</span>
          <select
            className="mt-1 block w-full rounded border border-slate-600 bg-night-950 px-2 py-1.5 font-mono text-sm outline-none focus:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
            value={localConfig.dataEgress}
            disabled={disabled}
            onChange={(event) =>
              update({ dataEgress: event.target.value as GuiLocalModelProfileConfig['dataEgress'] })
            }
          >
            <option value="unknown">Unknown</option>
            <option value="local-only">Local only</option>
            <option value="cloud">Cloud egress</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={localConfig.deterministicReplayOverride === true}
            disabled={disabled}
            onChange={(event) => update({ deterministicReplayOverride: event.target.checked ? true : null })}
          />
          Manual deterministic-replay fallback
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Current manual vision support: {localValue(localConfig.visionSupport)}. SDK vision-disable setting,
        if present, remains separately listed above.
      </p>
    </section>
  );
}

function ReliabilityFields({
  sdkNative,
  events,
  architecture,
}: {
  sdkNative: SdkNativeModelProfileFields;
  events: readonly AgentServerEvent[];
  architecture: GuiLocalModelProfileConfig['architecture'];
}) {
  const posture = reliabilityPosture(events, sdkNative.model, architecture);
  const signatures = detectFailureSignatures(events);

  return (
    <section aria-labelledby="reliability-posture-heading" className="rounded border border-slate-700 bg-night-950 p-4" data-testid="reliability-posture">
      <header>
        <h3 id="reliability-posture-heading" className="font-semibold text-slate-100">
          Local tool-calling reliability posture
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Computed from observed session events, not model marketing or a fixed tier.
        </p>
      </header>
      <dl className="mt-3 grid gap-x-5 sm:grid-cols-2">
        <Field label="Observed reliability tier">
          <span data-testid="reliability-tier">
            {posture.tier === 'no-data' ? 'No data' : posture.tier}
          </span>
        </Field>
        <Field label="Tool-call success rate">
          {posture.successRate === null
            ? 'No observations yet'
            : `${(posture.successRate * 100).toFixed(1)}% (${posture.observedSuccesses}/${posture.observedAttempts})`}
        </Field>
        <Field label="Observed failures">{posture.observedFailures.toLocaleString()}</Field>
        <Field label="Profile expectation">
          {posture.initialExpectation === 'dense-27b-to-35b'
            ? 'Dense 27B–35B: initial expectation only'
            : 'None'}
        </Field>
      </dl>
      {posture.tier === 'no-data' && (
        <p className="mt-3 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200">
          No data: a reliability tier is withheld until the session emits completed tool-call observations.
        </p>
      )}
      {signatures.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Observed failure signatures">
          {signatures.map((signature, index) => (
            <li key={`${signature.kind}-${signature.toolCallId ?? index}`} className="rounded border border-slate-600 px-3 py-2 text-sm">
              <p className="font-medium text-slate-100">{signature.kind.replaceAll('-', ' ')}</p>
              <p className="mt-1 text-slate-300">{signature.diagnostic}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                Operator action: {signature.recommendedAction.replaceAll('-', ' ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CloudFallback() {
  const reason =
    'Disabled: this regular Agent has no verified SDK mechanism to re-run a task on another model while preserving context. ACP model switching is not a generic Agent fallback contract.';

  return (
    <section aria-labelledby="cloud-fallback-heading" className="rounded border border-slate-700 bg-night-950 p-4">
      <h3 id="cloud-fallback-heading" className="font-semibold text-slate-100">
        Per-task cloud fallback
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        Intended as a model substitution that preserves task context, never as a global mode switch.
      </p>
      <button
        type="button"
        className="mt-3 rounded border border-slate-600 px-3 py-2 text-sm font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
        disabled
        title={reason}
      >
        Substitute for this task
      </button>
      <p className="mt-2 text-sm text-slate-400" data-testid="cloud-fallback-reason">
        {reason}
      </p>
    </section>
  );
}

/** Phase 1 model profiles and observed reliability view. */
export default function ModelProfilePanel({ sdkNative, events, isReadOnlyViewport }: ModelProfilePanelProps) {
  const { profile, updateLocalConfig } = useModelProfileStore(sdkNative);

  return (
    <section className="mt-6 space-y-4" aria-labelledby="model-profile-heading" data-testid="model-profile-panel">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">Model profile</p>
        <h2 id="model-profile-heading" className="mt-1 text-xl font-semibold tracking-tight">
          Local model facts and reliability
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Native readings and GUI-local operator configuration remain separate so provenance is clear.
        </p>
      </header>
      <NativeFields
        sdkNative={profile.sdkNative}
        deterministicReplay={profile.deterministicReplay}
        deterministicReplaySource={profile.deterministicReplaySource}
        effectiveContextLimit={profile.effectiveContextLimit}
        effectiveContextLimitSource={profile.effectiveContextLimitSource}
      />
      <ReliabilityFields sdkNative={profile.sdkNative} events={events} architecture={profile.localConfig.architecture} />
      <LocalConfigFields
        localConfig={profile.localConfig}
        update={updateLocalConfig}
        disabled={isReadOnlyViewport}
      />
      <CloudFallback />
    </section>
  );
}
