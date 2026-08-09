import { describe, expect, it } from 'vitest';
import { type WireRecord } from '../event-types';
import { getActionContent } from './get-action-content';
import {
  getActionEventTitleDescriptor,
  getActionSummaryTitle,
  trimEventTitleText,
} from './get-action-event-title';
import { getObservationContent } from './get-observation-content';
import { shouldRenderEvent } from './should-render-event';

const FINISH_ACTION_KIND = 'openhands__sdk__tool__builtins__finish__FinishAction-Output__1';
const TERMINAL_ACTION_KIND = 'openhands__tools__terminal__definition__TerminalAction-Output__1';
const FINISH_OBSERVATION_KIND = 'openhands__sdk__tool__builtins__finish__FinishObservation-Output__1';

/** Actual serialized SDK event shapes; no mocked module or transport substitute is used. */
function actionEvent(over: Partial<WireRecord> = {}): WireRecord {
  return {
    kind: 'ActionEvent',
    id: 'action-1',
    source: 'agent',
    llm_response_id: 'response-1',
    thought: [],
    tool_name: 'finish',
    tool_call_id: 'call-1',
    tool_call: { id: 'call-1', name: 'finish', arguments: '{"message":"done"}', origin: 'completion' },
    action: { kind: FINISH_ACTION_KIND, message: 'Done.' },
    ...over,
  };
}

function observationEvent(over: Partial<WireRecord> = {}): WireRecord {
  return {
    kind: 'ObservationEvent',
    id: 'observation-1',
    source: 'environment',
    action_id: 'action-1',
    tool_name: 'finish',
    tool_call_id: 'call-1',
    observation: { kind: FINISH_OBSERVATION_KIND, content: [{ text: 'Done.' }] },
    ...over,
  };
}

describe('shouldRenderEvent', () => {
  // Mutation M1: replace this body with a recognised-kind allowlist. An unfamiliar native event
  // would disappear, violating ADR-015's visible-UNHANDLED rule.
  it('passes an unfamiliar native discriminator through to the unhandled renderer', () => {
    expect(
      shouldRenderEvent({
        kind: 'openhands__sdk__event__future__FutureEvent-Output__1',
        source: 'agent',
      }),
    ).toBe(true);
  });

  it('passes a non-executable ActionEvent through rather than dropping action=null', () => {
    expect(shouldRenderEvent(actionEvent({ action: null }))).toBe(true);
  });

  it('returns false only when the native discriminator itself is absent', () => {
    expect(shouldRenderEvent({ source: 'agent' })).toBe(false);
  });
});

describe('action titles', () => {
  // Mutation M2: compare `action.kind === "FinishAction"` without normalising. The actual mangled
  // wire object would become UNHANDLED, so this test fails.
  it('normalizes a mangled action kind before choosing its title', () => {
    expect(getActionEventTitleDescriptor(actionEvent())).toEqual({ kind: 'native', text: 'Finish' });
  });

  it('uses the concise native summary before the action class', () => {
    expect(getActionEventTitleDescriptor(actionEvent({ summary: '  Completed\n the task  ' }))).toEqual({
      kind: 'native',
      text: 'Completed the task',
    });
  });

  it('rejects a server fallback summary instead of presenting it as agent-authored explainability', () => {
    expect(getActionSummaryTitle(actionEvent({ summary: 'finish: {"message":"done"}' }))).toBeNull();
  });

  it('marks an unknown native action class UNHANDLED instead of folding it into a generic action', () => {
    expect(
      getActionEventTitleDescriptor(
        actionEvent({ action: { kind: 'openhands__tools__future__FutureAction-Output__1' } }),
      ),
    ).toEqual({ kind: 'unhandled', text: 'UNHANDLED action: FutureAction' });
  });

  it('preserves the native non-executable state without inventing an action class', () => {
    expect(getActionEventTitleDescriptor(actionEvent({ action: null, tool_name: 'custom_tool' }))).toEqual({
      kind: 'native',
      text: 'Non-executable tool call: custom_tool',
    });
  });

  it('uses a typographic ellipsis only after the requested title limit', () => {
    expect(trimEventTitleText('abc', 3)).toBe('abc');
    expect(trimEventTitleText('abcd', 3)).toBe('abc…');
  });
});

describe('action content', () => {
  // Mutation M3: return null from the FinishAction branch. The exact SDK-native finish message
  // disappears and this assertion fails.
  it('returns a mangled FinishAction native message verbatim', () => {
    expect(getActionContent(actionEvent())).toBe('Done.');
  });

  it('keeps an empty native finish message distinct from a missing message', () => {
    expect(getActionContent(actionEvent({ action: { kind: FINISH_ACTION_KIND, message: '' } }))).toBe('');
    expect(getActionContent(actionEvent({ action: { kind: FINISH_ACTION_KIND } }))).toBeNull();
  });

  it('shows a known non-special action as its exact native action object', () => {
    expect(
      getActionContent(
        actionEvent({ action: { kind: TERMINAL_ACTION_KIND, command: 'printf ready', timeout: 30 } }),
      ),
    ).toBe(JSON.stringify({ kind: TERMINAL_ACTION_KIND, command: 'printf ready', timeout: 30 }, null, 2));
  });

  it('marks an unrecognised action payload UNHANDLED rather than treating it as terminal output', () => {
    const content = getActionContent(
      actionEvent({ action: { kind: 'openhands__tools__future__FutureAction-Output__1', plan: 'x' } }),
    );
    expect(content).toContain('UNHANDLED native event: ActionEvent.FutureAction');
    expect(content).toContain('"plan": "x"');
  });

  it('returns null when ActionEvent.action is natively null', () => {
    expect(getActionContent(actionEvent({ action: null }))).toBeNull();
  });
});

describe('observation content', () => {
  // Mutation M4: use the raw `observation.kind` in the known-kind lookup. This mangled real
  // FinishObservation would be misclassified as UNHANDLED and the exact-JSON assertion fails.
  it('normalizes a mangled observation kind and preserves its native payload', () => {
    expect(getObservationContent(observationEvent())).toBe(
      JSON.stringify({ kind: FINISH_OBSERVATION_KIND, content: [{ text: 'Done.' }] }, null, 2),
    );
  });

  it('shows the actual rejection reason without manufacturing a default', () => {
    expect(
      getObservationContent({
        kind: 'UserRejectObservation',
        action_id: 'action-1',
        tool_name: 'terminal',
        tool_call_id: 'call-1',
        rejection_source: 'user',
        rejection_reason: 'The path is outside the workspace.',
      }),
    ).toBe('The path is outside the workspace.');
    expect(
      getObservationContent({
        kind: 'UserRejectObservation',
        action_id: 'action-1',
        tool_name: 'terminal',
        tool_call_id: 'call-1',
      }),
    ).toBeNull();
  });

  it('marks an unknown observation class UNHANDLED without changing its payload', () => {
    const content = getObservationContent(
      observationEvent({ observation: { kind: 'openhands__tools__future__FutureObservation-Output__1', result: 'x' } }),
    );
    expect(content).toContain('UNHANDLED native event: ObservationEvent.FutureObservation');
    expect(content).toContain('"result": "x"');
  });
});
