import { useCallback, useEffect, useMemo, useState } from 'react';
import { agentServer, type AgentServerClient } from '../../api/agentServer';
import {
  defaultStartRequest,
  type AgentServerEvent,
  type ConversationExecutionStatus,
} from '../../api/types';
import {
  nativeModelProfileFromConversation,
  nativeModelProfileFromStartAgent,
  type SdkNativeModelProfileFields,
} from '../model-profiles/model-profile';
import {
  confirmationPolicyForTrustStop,
  DEFAULT_STOP,
  type TrustStopId,
} from '../first-run/trust-dial';
import {
  type PendingAction,
  type SecurityRisk,
} from '../authorization/AuthorizationCard';

const POLL_INTERVAL_MS = 3_000;
export const DEFAULT_CONFIRMATION_RESPONSE_REASON = 'User rejected the action.';

interface ActionEventWire extends AgentServerEvent {
  kind: 'ActionEvent';
  action: (Record<string, unknown> & { kind?: unknown }) | null;
  tool_name: string;
  tool_call_id: string;
  security_risk?: unknown;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'The Agent Server request failed.';
}

export interface UseConversationOptions {
  api?: AgentServerClient;
  pollIntervalMs?: number;
  /** Optional local Agent Server command. Omit it to start with no pre-tool-use hook. */
  preToolUseHookCommand?: string | undefined;
}

export interface ConversationRun {
  conversationId: string | null;
  events: AgentServerEvent[];
  eventCount: number | null;
  status: ConversationExecutionStatus | null;
  /** Native model facts from the start request, then refreshed from ConversationInfo.agent. */
  nativeModelProfile: SdkNativeModelProfileFields;
  pendingActions: PendingAction[];
  elapsedSeconds: number;
  error: string | null;
  isStarting: boolean;
  start(goal: string, trustStop?: TrustStopId): Promise<void>;
  setTrustStop(trustStop: TrustStopId): Promise<void>;
  approve(reason?: string): Promise<void>;
  reject(reason: string): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isActionEvent(event: AgentServerEvent): event is ActionEventWire {
  return (
    event.kind === 'ActionEvent' &&
    isRecord(event.action) &&
    typeof event.tool_name === 'string' &&
    typeof event.tool_call_id === 'string'
  );
}

function isActionObservation(event: AgentServerEvent): event is AgentServerEvent & { action_id: string } {
  return (
    (event.kind === 'ObservationEvent' || event.kind === 'UserRejectObservation') &&
    typeof event.action_id === 'string'
  );
}

function isAgentError(event: AgentServerEvent): event is AgentServerEvent & { tool_call_id: string } {
  return event.kind === 'AgentErrorEvent' && typeof event.tool_call_id === 'string';
}

function securityRiskFrom(event: ActionEventWire): SecurityRisk | null {
  switch (event.security_risk) {
    case 'LOW':
    case 'MEDIUM':
    case 'HIGH':
    case 'UNKNOWN':
      return event.security_risk;
    default:
      return null;
  }
}

/**
 * Mirrors ConversationState.get_unmatched_actions() over the immutable event objects returned by
 * `/events/search` (openhands_sdk-1.41.0/openhands/sdk/conversation/state.py:662-701). The
 * transcript is narration only; pending authorization is read from native Action/Observation objects.
 */
export function pendingActionsFromEvents(events: AgentServerEvent[]): PendingAction[] {
  const observedActionIds = new Set<string>();
  const observedToolCallIds = new Set<string>();
  const unmatched: ActionEventWire[] = [];

  for (const event of [...events].reverse()) {
    if (isActionObservation(event)) {
      observedActionIds.add(event.action_id);
    } else if (isAgentError(event)) {
      observedToolCallIds.add(event.tool_call_id);
    } else if (
      isActionEvent(event) &&
      event.action !== null &&
      !observedActionIds.has(event.id) &&
      !observedToolCallIds.has(event.tool_call_id)
    ) {
      unmatched.unshift(event);
    }
  }

  return unmatched.map((event) => ({
    command: JSON.stringify(event.action, null, 2),
    toolName: event.tool_name,
    securityRisk: securityRiskFrom(event),
    event,
  }));
}

/**
 * Owns one locally hosted Agent Server conversation. The event log and server execution status are
 * durable objects; the UI never reconstructs state from a message transcript.
 */
export function useConversation({
  api = agentServer,
  pollIntervalMs = POLL_INTERVAL_MS,
  preToolUseHookCommand = import.meta.env.VITE_PRE_TOOL_USE_HOOK_COMMAND,
}: UseConversationOptions = {}): ConversationRun {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentServerEvent[]>([]);
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [status, setStatus] = useState<ConversationExecutionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [nativeModelProfile, setNativeModelProfile] = useState<SdkNativeModelProfileFields>(() =>
    nativeModelProfileFromStartAgent(defaultStartRequest('').agent),
  );

  const refresh = useCallback(async () => {
    if (conversationId === null) return;

    // `getConversation` is intentionally best-effort (per the verified contract). The event
    // count and searched event objects still refresh when that endpoint has its known mid-run
    // validation failure.
    const [count, page, conversation] = await Promise.all([
      api.getEventCount(conversationId),
      api.searchEvents(conversationId),
      api.getConversation(conversationId).catch(() => null),
    ]);
    setEventCount(count);
    setEvents(page.items);
    if (conversation !== null) {
      setStatus(conversation.execution_status);
      const nativeProfile = nativeModelProfileFromConversation(conversation);
      if (nativeProfile !== null) setNativeModelProfile(nativeProfile);
    }
  }, [api, conversationId]);

  useEffect(() => {
    if (
      startedAt === null ||
      (status !== 'running' && status !== 'waiting_for_confirmation')
    ) {
      return;
    }

    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt, status]);

  useEffect(() => {
    if (conversationId === null) return;

    let cancelled = false;
    const poll = async () => {
      try {
        await refresh();
        if (cancelled) return;
        setError(null);
      } catch (caught) {
        if (!cancelled) setError(messageFrom(caught));
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [conversationId, pollIntervalMs, refresh]);

  const start = useCallback(
    async (goal: string, trustStop: TrustStopId = DEFAULT_STOP) => {
      const trimmedGoal = goal.trim();
      if (!trimmedGoal) {
        setError('A goal is required before starting a run.');
        return;
      }

      setError(null);
      setIsStarting(true);
      try {
        const conversation = await api.createConversation(
          defaultStartRequest(trimmedGoal, {
            confirmationPolicy: confirmationPolicyForTrustStop(trustStop),
            preToolUseHookCommand,
          }),
        );
        setConversationId(conversation.id);
        setStatus(conversation.execution_status);
        // Phase 1 deterministic-replay contract read: ConversationInfo.agent is read through
        // the Agent Server anti-corruption layer before the event poll.
        const nativeProfile = nativeModelProfileFromConversation(conversation);
        if (nativeProfile !== null) setNativeModelProfile(nativeProfile);
        setStartedAt(Date.now());
        setElapsedSeconds(0);
        await api.run(conversation.id);
        setStatus('running');
      } catch (caught) {
        setError(messageFrom(caught));
      } finally {
        setIsStarting(false);
      }
    },
    [api, preToolUseHookCommand],
  );

  const setTrustStop = useCallback(
    async (trustStop: TrustStopId) => {
      if (conversationId === null) return;
      setError(null);
      try {
        await api.setConfirmationPolicy(
          conversationId,
          confirmationPolicyForTrustStop(trustStop),
        );
        await refresh();
      } catch (caught) {
        setError(messageFrom(caught));
      }
    },
    [api, conversationId, refresh],
  );

  const approve = useCallback(
    async (reason = DEFAULT_CONFIRMATION_RESPONSE_REASON) => {
      if (conversationId === null) return;
      setError(null);
      try {
        await api.respondToConfirmation(conversationId, { accept: true, reason });
        await refresh();
      } catch (caught) {
        setError(messageFrom(caught));
      }
    },
    [api, conversationId, refresh],
  );

  const reject = useCallback(
    async (reason: string) => {
      if (conversationId === null) return;
      const trimmedReason = reason.trim();
      if (!trimmedReason) {
        setError('A rejection reason is required.');
        return;
      }

      setError(null);
      try {
        await api.respondToConfirmation(conversationId, { accept: false, reason: trimmedReason });
        await refresh();
      } catch (caught) {
        setError(messageFrom(caught));
      }
    },
    [api, conversationId, refresh],
  );

  const pause = useCallback(async () => {
    if (conversationId === null) return;
    setError(null);
    try {
      await api.pause(conversationId);
      setStatus('paused');
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }, [api, conversationId]);

  const stop = useCallback(async () => {
    if (conversationId === null) return;
    setError(null);
    try {
      await api.stop(conversationId);
      setStatus('paused');
    } catch (caught) {
      setError(messageFrom(caught));
    }
  }, [api, conversationId]);

  const pendingActions = useMemo(
    () => (status === 'waiting_for_confirmation' ? pendingActionsFromEvents(events) : []),
    [events, status],
  );

  return useMemo(
    () => ({
      conversationId,
      events,
      eventCount,
      status,
      nativeModelProfile,
      pendingActions,
      elapsedSeconds,
      error,
      isStarting,
      start,
      setTrustStop,
      approve,
      reject,
      pause,
      stop,
    }),
    [
      conversationId,
      elapsedSeconds,
      error,
      eventCount,
      events,
      isStarting,
      nativeModelProfile,
      pendingActions,
      pause,
      approve,
      reject,
      setTrustStop,
      start,
      status,
      stop,
    ],
  );
}
