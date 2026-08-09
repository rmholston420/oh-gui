import { useCallback, useEffect, useMemo, useState } from 'react';
import { agentServer, type AgentServerClient } from '../../api/agentServer';
import {
  defaultStartRequest,
  type AgentServerEvent,
  type ConversationExecutionStatus,
} from '../../api/types';

const POLL_INTERVAL_MS = 3_000;

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'The Agent Server request failed.';
}

export interface UseConversationOptions {
  api?: AgentServerClient;
  pollIntervalMs?: number;
}

export interface ConversationRun {
  conversationId: string | null;
  events: AgentServerEvent[];
  eventCount: number | null;
  status: ConversationExecutionStatus | null;
  elapsedSeconds: number;
  error: string | null;
  isStarting: boolean;
  start(goal: string): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Owns one locally hosted Agent Server conversation. The event log and server execution status are
 * durable objects; the UI never reconstructs state from a message transcript.
 */
export function useConversation({
  api = agentServer,
  pollIntervalMs = POLL_INTERVAL_MS,
}: UseConversationOptions = {}): ConversationRun {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentServerEvent[]>([]);
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [status, setStatus] = useState<ConversationExecutionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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
        // `getConversation` is intentionally best-effort (per the verified contract). The event
        // count and searched event objects still refresh when that endpoint has its known mid-run
        // validation failure.
        const [count, page, conversation] = await Promise.all([
          api.getEventCount(conversationId),
          api.searchEvents(conversationId),
          api.getConversation(conversationId).catch(() => null),
        ]);
        if (cancelled) return;
        setEventCount(count);
        setEvents(page.items);
        if (conversation !== null) setStatus(conversation.execution_status);
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
  }, [api, conversationId, pollIntervalMs]);

  const start = useCallback(
    async (goal: string) => {
      const trimmedGoal = goal.trim();
      if (!trimmedGoal) {
        setError('A goal is required before starting a run.');
        return;
      }

      setError(null);
      setIsStarting(true);
      try {
        const conversation = await api.createConversation(defaultStartRequest(trimmedGoal));
        setConversationId(conversation.id);
        setStatus(conversation.execution_status);
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
    [api],
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

  return useMemo(
    () => ({
      conversationId,
      events,
      eventCount,
      status,
      elapsedSeconds,
      error,
      isStarting,
      start,
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
      pause,
      start,
      status,
      stop,
    ],
  );
}
