import { describe, expect, it } from 'vitest';
import type { AgentServerEvent } from '../../api/types';
import {
  detectFailureSignatures,
  materiallyIdenticalToolCallSignature,
  reliabilityPosture,
  toolCallObservations,
} from './reliability';

const successfulCall = (id: string, toolCallId: string): AgentServerEvent[] => [
  {
    id,
    kind: 'ActionEvent',
    timestamp: '2026-08-09T00:00:00Z',
    source: 'agent',
    tool_name: 'terminal',
    tool_call_id: toolCallId,
    action: { command: 'pwd', timeout: 30 },
  },
  {
    id: `observation-${id}`,
    kind: 'ObservationEvent',
    timestamp: '2026-08-09T00:00:01Z',
    source: 'environment',
    action_id: id,
  },
];

const failedCall = (id: string, toolCallId: string): AgentServerEvent[] => [
  {
    id,
    kind: 'ActionEvent',
    timestamp: '2026-08-09T00:00:00Z',
    source: 'agent',
    tool_name: 'terminal',
    tool_call_id: toolCallId,
    action: { command: 'pwd', timeout: 30 },
  },
  {
    id: `error-${id}`,
    kind: 'AgentErrorEvent',
    timestamp: '2026-08-09T00:00:01Z',
    source: 'agent',
    tool_call_id: toolCallId,
    error: 'Tool execution failed',
  },
];

describe('reliability posture', () => {
  it('renders a reachable no-data state instead of assigning a flattering tier', () => {
    const posture = reliabilityPosture([], 'ollama_chat/qwen3.6:35b-a3b-mtp-coder', 'dense');

    expect(posture).toMatchObject({
      tier: 'no-data',
      observedAttempts: 0,
      successRate: null,
      initialExpectation: 'dense-27b-to-35b',
    });
  });

  it('moves the calculated tier down when observed failures are injected', () => {
    const fourSuccesses = [
      ...successfulCall('a-1', 'call-1'),
      ...successfulCall('a-2', 'call-2'),
      ...successfulCall('a-3', 'call-3'),
      ...successfulCall('a-4', 'call-4'),
    ];
    const healthy = reliabilityPosture(fourSuccesses, 'local/qwen3.6:35b', 'dense');
    const mutatedWithFailure = reliabilityPosture(
      [...fourSuccesses, ...failedCall('a-5', 'call-5')],
      'local/qwen3.6:35b',
      'dense',
    );

    expect(healthy.tier).toBe('high');
    expect(healthy.successRate).toBe(1);
    expect(mutatedWithFailure.tier).toBe('guarded');
    expect(mutatedWithFailure.successRate).toBe(0.8);
    expect(mutatedWithFailure.observedFailures).toBe(1);
  });

  it('does not count unresolved actions as completed observations', () => {
    const events: AgentServerEvent[] = [
      {
        id: 'pending-action',
        kind: 'ActionEvent',
        timestamp: '2026-08-09T00:00:00Z',
        source: 'agent',
        tool_name: 'terminal',
        tool_call_id: 'pending-call',
        action: { command: 'pwd' },
      },
    ];
    const observations = toolCallObservations(events);
    expect(observations[0]?.outcome).toBe('pending');
    expect(reliabilityPosture(events, null, null).tier).toBe('no-data');
  });

  it('does not treat a user-rejected action as a successful tool call', () => {
    const events: AgentServerEvent[] = [
      {
        id: 'rejected-action',
        kind: 'ActionEvent',
        timestamp: '2026-08-09T00:00:00Z',
        source: 'agent',
        tool_name: 'terminal',
        tool_call_id: 'rejected-call',
        action: { command: 'pwd' },
      },
      {
        id: 'user-reject',
        kind: 'UserRejectObservation',
        timestamp: '2026-08-09T00:00:01Z',
        source: 'user',
        action_id: 'rejected-action',
      },
    ];

    expect(toolCallObservations(events)[0]?.outcome).toBe('ignored');
    expect(reliabilityPosture(events, null, null).tier).toBe('no-data');
  });
});

describe('failure signature vocabulary', () => {
  it('detects malformed tool output and requires a diagnostic retry', () => {
    const events: AgentServerEvent[] = [
      {
        id: 'malformed-action',
        kind: 'ActionEvent',
        timestamp: '2026-08-09T00:00:00Z',
        source: 'agent',
        action: null,
        tool_name: 'terminal',
        tool_call_id: 'bad-call',
        tool_call: {
          arguments: JSON.stringify({
            _openhands_malformed_tool_call: true,
            error: 'Malformed tool-call arguments failed validation',
          }),
        },
      },
      {
        id: 'malformed-error',
        kind: 'AgentErrorEvent',
        timestamp: '2026-08-09T00:00:01Z',
        source: 'agent',
        tool_call_id: 'bad-call',
        error: 'Malformed tool-call arguments failed validation',
      },
    ];

    expect(detectFailureSignatures(events)).toContainEqual(
      expect.objectContaining({
        kind: 'malformed-tool-call',
        toolCallId: 'bad-call',
        recommendedAction: 'retry-with-diagnostic',
      }),
    );
    expect(toolCallObservations(events)[0]?.outcome).toBe('failure');
  });

  it('detects tool-call abandonment when prose follows an unresolved call', () => {
    const events: AgentServerEvent[] = [
      {
        id: 'unresolved-action',
        kind: 'ActionEvent',
        timestamp: '2026-08-09T00:00:00Z',
        source: 'agent',
        action: { command: 'pwd' },
        tool_name: 'terminal',
        tool_call_id: 'unresolved-call',
      },
      {
        id: 'prose-after-call',
        kind: 'MessageEvent',
        timestamp: '2026-08-09T00:00:01Z',
        source: 'agent',
        llm_message: {
          content: [{ type: 'text', text: 'I will explain the result instead.' }],
        },
      },
    ];

    expect(detectFailureSignatures(events)).toContainEqual(
      expect.objectContaining({
        kind: 'tool-call-abandonment',
        recommendedAction: 'review-abandonment',
      }),
    );
  });

  it('detects circular retries using a material, order-independent call signature', () => {
    const first = failedCall('retry-1', 'retry-call-1');
    const repeated = [
      {
        ...failedCall('retry-2', 'retry-call-2')[0]!,
        action: { timeout: 30, command: 'pwd' },
      },
      failedCall('retry-2', 'retry-call-2')[1]!,
    ];
    const events = [...first, ...repeated];

    expect(materiallyIdenticalToolCallSignature(first[0]!)).toBe(
      materiallyIdenticalToolCallSignature(repeated[0]!),
    );
    expect(detectFailureSignatures(events)).toContainEqual(
      expect.objectContaining({
        kind: 'circular-retry',
        recommendedAction: 'break-retry-loop',
      }),
    );
  });
});
