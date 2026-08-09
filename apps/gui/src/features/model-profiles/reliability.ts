import type { AgentServerEvent } from '../../api/types';

export type ReliabilityTier = 'no-data' | 'high' | 'guarded' | 'low';
export type FailureSignatureKind = 'malformed-tool-call' | 'tool-call-abandonment' | 'circular-retry';

export interface ToolCallObservation {
  readonly actionId: string;
  readonly toolCallId: string | null;
  readonly toolName: string | null;
  readonly outcome: 'success' | 'failure' | 'pending' | 'ignored';
  readonly signature: string | null;
}

export interface ReliabilityPosture {
  readonly tier: ReliabilityTier;
  readonly observedAttempts: number;
  readonly observedSuccesses: number;
  readonly observedFailures: number;
  readonly successRate: number | null;
  readonly initialExpectation: 'dense-27b-to-35b' | null;
}

export interface FailureSignature {
  readonly kind: FailureSignatureKind;
  readonly toolCallId: string | null;
  readonly diagnostic: string;
  /** A visible operator recommendation; nothing here performs a silent retry. */
  readonly recommendedAction: 'retry-with-diagnostic' | 'review-abandonment' | 'break-retry-loop';
}

interface ActionEvent extends AgentServerEvent {
  kind: 'ActionEvent';
  action?: unknown;
  tool_call?: unknown;
  tool_name?: unknown;
  tool_call_id?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function eventString(event: AgentServerEvent, key: string): string | null {
  return typeof event[key] === 'string' ? (event[key] as string) : null;
}

function actionEvent(event: AgentServerEvent): event is ActionEvent {
  return event.kind === 'ActionEvent';
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

/** Stable comparison key for a tool invocation, independent of JSON object property order. */
export function materiallyIdenticalToolCallSignature(event: AgentServerEvent): string | null {
  if (!actionEvent(event)) return null;
  const toolName = typeof event.tool_name === 'string' ? event.tool_name : null;
  const payload = event.action ?? event.tool_call ?? null;
  if (!toolName || payload === null) return null;
  return `${toolName}:${JSON.stringify(canonicalize(payload))}`;
}

function hasMalformedMarker(value: unknown): boolean {
  if (typeof value === 'string') {
    try {
      return hasMalformedMarker(JSON.parse(value));
    } catch {
      return false;
    }
  }
  if (!isRecord(value)) return false;
  if (value._openhands_malformed_tool_call === true) return true;
  return Object.values(value).some(hasMalformedMarker);
}

function errorDiagnostic(event: AgentServerEvent): string | null {
  const error = eventString(event, 'error');
  if (!error) return null;
  return /(malformed|validation|invalid.+(?:tool|argument)|unparseable|json)/i.test(error) ? error : null;
}

function agentProse(event: AgentServerEvent): boolean {
  if (event.kind !== 'MessageEvent' || event.source !== 'agent') return false;
  // Native MessageEvent transports message content at `llm_message.content`
  // (openhands_sdk-1.41.0/openhands/sdk/event/llm_convertible/message.py:25-35).
  const llmMessage = isRecord(event.llm_message) ? event.llm_message : null;
  const content = llmMessage?.content ?? event.content;
  if (typeof content === 'string') return content.trim().length > 0;
  if (Array.isArray(content)) {
    return content.some(
      (item) => isRecord(item) && item.type === 'text' && typeof item.text === 'string' && item.text.trim(),
    );
  }
  return false;
}

/**
 * Classifies executable action objects using the immutable Agent Server event sequence. A pending
 * action is deliberately excluded from the rate until a native observation or AgentError arrives.
 */
export function toolCallObservations(events: readonly AgentServerEvent[]): ToolCallObservation[] {
  const successfulObservationsByAction = new Set<string>();
  const userRejectedActions = new Set<string>();
  const failuresByCall = new Set<string>();

  for (const event of events) {
    if (event.kind === 'ObservationEvent' && typeof event.action_id === 'string') {
      successfulObservationsByAction.add(event.action_id);
    }
    if (event.kind === 'UserRejectObservation' && typeof event.action_id === 'string') {
      userRejectedActions.add(event.action_id);
    }
    if (event.kind === 'AgentErrorEvent' && typeof event.tool_call_id === 'string') {
      failuresByCall.add(event.tool_call_id);
    }
  }

  return events.flatMap((event) => {
    // `_emit_tool_error` records malformed output as `action=None` plus a sentinel-bearing
    // `tool_call`; retain that observed failure instead of silently dropping it.
    if (!actionEvent(event) || (event.action === null && event.tool_call == null)) return [];
    const toolCallId = eventString(event, 'tool_call_id');
    const outcome =
      (toolCallId !== null && failuresByCall.has(toolCallId))
        ? 'failure'
        : successfulObservationsByAction.has(event.id)
          ? 'success'
          : userRejectedActions.has(event.id)
            ? 'ignored'
          : 'pending';
    return [{
      actionId: event.id,
      toolCallId,
      toolName: eventString(event, 'tool_name'),
      outcome,
      signature: materiallyIdenticalToolCallSignature(event),
    }];
  });
}

export function reliabilityPosture(
  events: readonly AgentServerEvent[],
  model: string | null,
  architecture: 'dense' | 'moe' | null,
): ReliabilityPosture {
  const observed = toolCallObservations(events).filter(
    (call) => call.outcome === 'success' || call.outcome === 'failure',
  );
  const observedSuccesses = observed.filter((call) => call.outcome === 'success').length;
  const observedFailures = observed.length - observedSuccesses;
  const successRate = observed.length === 0 ? null : observedSuccesses / observed.length;
  const expectation =
    architecture === 'dense' && /(?:^|[^0-9])(27|28|29|30|31|32|33|34|35)b/i.test(model ?? '')
      ? 'dense-27b-to-35b'
      : null;

  // These tiers are calculated only after an observation; a local model profile never earns one by
  // expectation alone. Injected failures therefore lower the calculated tier.
  const tier: ReliabilityTier =
    successRate === null ? 'no-data' : successRate >= 0.95 ? 'high' : successRate >= 0.75 ? 'guarded' : 'low';

  return {
    tier,
    observedAttempts: observed.length,
    observedSuccesses,
    observedFailures,
    successRate,
    initialExpectation: expectation,
  };
}

/**
 * Detects only observable failure patterns. For malformed output the result requires a diagnostic
 * and recommends an explicit diagnostic retry; this function never retries a call itself.
 */
export function detectFailureSignatures(events: readonly AgentServerEvent[]): FailureSignature[] {
  const signatures: FailureSignature[] = [];
  const failuresByCall = new Map<string, string>();
  const resolvedCalls = new Set<string>();

  for (const event of events) {
    if ((event.kind === 'ObservationEvent' || event.kind === 'UserRejectObservation') && typeof event.action_id === 'string') {
      resolvedCalls.add(event.action_id);
    }
    if (event.kind === 'AgentErrorEvent' && typeof event.tool_call_id === 'string') {
      failuresByCall.set(event.tool_call_id, errorDiagnostic(event) ?? eventString(event, 'error') ?? 'Agent error');
    }
  }

  for (const event of events) {
    if (!actionEvent(event)) continue;
    const toolCallId = eventString(event, 'tool_call_id');
    const malformed = hasMalformedMarker(event.action) || hasMalformedMarker(event.tool_call);
    const diagnostic = (toolCallId && failuresByCall.get(toolCallId)) ?? null;
    if (malformed || diagnostic !== null && /malformed|validation|invalid.+(?:tool|argument)|unparseable|json/i.test(diagnostic)) {
      signatures.push({
        kind: 'malformed-tool-call',
        toolCallId,
        diagnostic: diagnostic ?? 'Malformed tool-call marker observed in the native action event.',
        recommendedAction: 'retry-with-diagnostic',
      });
    }
  }

  const calls = toolCallObservations(events);
  const failedBySignature = new Map<string, ToolCallObservation[]>();
  for (const call of calls) {
    if (call.outcome !== 'failure' || call.signature === null) continue;
    failedBySignature.set(call.signature, [...(failedBySignature.get(call.signature) ?? []), call]);
  }
  for (const repeated of failedBySignature.values()) {
    if (repeated.length < 2) continue;
    signatures.push({
      kind: 'circular-retry',
      toolCallId: repeated.at(-1)?.toolCallId ?? null,
      diagnostic: `${repeated.length} materially identical failing calls were observed.`,
      recommendedAction: 'break-retry-loop',
    });
  }

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (!actionEvent(event) || event.action === null) continue;
    const toolCallId = eventString(event, 'tool_call_id');
    if ((toolCallId && failuresByCall.has(toolCallId)) || resolvedCalls.has(event.id)) continue;
    const proseAfterUnresolvedCall = events.slice(index + 1).find(agentProse);
    if (!proseAfterUnresolvedCall) continue;
    signatures.push({
      kind: 'tool-call-abandonment',
      toolCallId,
      diagnostic: 'Agent prose followed an unresolved native tool call; verify task continuation.',
      recommendedAction: 'review-abandonment',
    });
  }

  return signatures;
}
