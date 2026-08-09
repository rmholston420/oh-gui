/**
 * PORTED and adapted from Agent Canvas 1.12.0
 * `components/conversation-events/chat/event-content-helpers/get-observation-content.ts` (MIT).
 *
 * Native basis: ObservationEvent.observation/action_id (observation.py:32-45)
 * and UserRejectObservation.rejection_reason/rejection_source/action_id
 * (observation.py:86-107). The native observation object is shown verbatim;
 * no success state or missing output is manufactured by this presentation layer.
 */
import {
  isObservationEvent,
  isUserRejectObservation,
  nativeJson,
  normalizeWireKind,
  observationRecord,
  stringField,
  unhandledContent,
} from '../event-types';

const KNOWN_OBSERVATION_KINDS = new Set<string>([
  'BrowserObservation',
  'ClientToolObservation',
  'DelegateObservation',
  'EditObservation',
  'FileEditorObservation',
  'FinishObservation',
  'GlobObservation',
  'GrepObservation',
  'InvokeSkillObservation',
  'ListDirectoryObservation',
  'MCPToolObservation',
  'PlanningFileEditorObservation',
  'ReadFileObservation',
  'SwitchLLMObservation',
  'TaskObservation',
  'TaskTrackerObservation',
  'TerminalObservation',
  'ThinkObservation',
  'VisionInspectObservation',
  'WorkflowObservation',
  'WriteFileObservation',
]);

export function getObservationContent(event: unknown): string | null {
  if (isUserRejectObservation(event)) return stringField(event, 'rejection_reason');
  if (!isObservationEvent(event)) return null;

  const observation = observationRecord(event);
  if (observation === null) return null;
  const observationKind = normalizeWireKind(observation.kind);
  if (observationKind === null) return null;

  if (!KNOWN_OBSERVATION_KINDS.has(observationKind)) {
    return unhandledContent(`ObservationEvent.${observationKind}`, observation);
  }
  return nativeJson(observation);
}
