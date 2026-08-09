import { describe, expect, it } from 'vitest';
import { type WireRecord } from '../event-types';
import { groupEvents } from './group-events';

const FINISH_ACTION_KIND = 'openhands__sdk__tool__builtins__finish__FinishAction-Output__1';
const FINISH_OBSERVATION_KIND = 'openhands__sdk__tool__builtins__finish__FinishObservation-Output__1';

function action(id: string): WireRecord {
  return {
    kind: 'ActionEvent',
    id,
    source: 'agent',
    tool_name: 'finish',
    tool_call_id: `${id}-call`,
    action: { kind: FINISH_ACTION_KIND, message: `finished ${id}` },
  };
}

function observation(actionId: string, id = `${actionId}-observation`): WireRecord {
  return {
    kind: 'ObservationEvent',
    id,
    source: 'environment',
    action_id: actionId,
    tool_name: 'finish',
    tool_call_id: `${actionId}-call`,
    observation: { kind: FINISH_OBSERVATION_KIND, content: [{ text: 'ok' }] },
  };
}

describe('groupEvents', () => {
  // Mutation M5: pair an observation with the preceding action instead of its native action_id.
  // This non-adjacent, interleaved history makes that mutant fail.
  it('pairs only the action named by observation.action_id, even across unrelated events', () => {
    const first = action('action-1');
    const second = action('action-2');
    const events: WireRecord[] = [first, { kind: 'MessageEvent', id: 'message-1' }, second, observation('action-1')];

    expect(groupEvents(events)).toEqual([
      {
        kind: 'action-observation',
        action: first,
        observation: events[3],
        actionIndex: 0,
        observationIndex: 3,
      },
      { kind: 'single', event: events[1], index: 1 },
      { kind: 'single', event: second, index: 2 },
    ]);
  });

  it('leaves an orphan observation independent rather than folding it into a neighbour', () => {
    const orphan = observation('missing-action');
    expect(groupEvents([action('action-1'), orphan])).toEqual([
      { kind: 'single', event: expect.any(Object), index: 0 },
      { kind: 'single', event: orphan, index: 1 },
    ]);
  });

  it('does not collapse duplicate observations into one fabricated completion', () => {
    const original = action('action-1');
    const first = observation('action-1', 'observation-1');
    const duplicate = observation('action-1', 'observation-2');
    expect(groupEvents([original, first, duplicate])).toEqual([
      { kind: 'single', event: original, index: 0 },
      { kind: 'single', event: first, index: 1 },
      { kind: 'single', event: duplicate, index: 2 },
    ]);
  });

  it('does not pair an observation that precedes its action', () => {
    const later = action('action-1');
    const earlier = observation('action-1');
    expect(groupEvents([earlier, later])).toEqual([
      { kind: 'single', event: earlier, index: 0 },
      { kind: 'single', event: later, index: 1 },
    ]);
  });
});
