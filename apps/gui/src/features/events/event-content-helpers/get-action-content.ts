/**
 * PORTED and adapted from Agent Canvas 1.12.0
 * `components/conversation-events/chat/event-content-helpers/get-action-content.ts` (MIT).
 *
 * Native basis: ActionEvent.action (action.py:40-43); FinishAction.message is
 * verified at sdk/tool/builtins/finish.py:21-22, and ThinkAction.thought at
 * sdk/tool/builtins/think.py:21-24. Other current action classes are rendered
 * as their native action object verbatim, not inferred from tool-specific fields.
 */
import {
  actionRecord,
  isActionEvent,
  nativeJson,
  normalizeWireKind,
  stringField,
  unhandledContent,
} from '../event-types';

const KNOWN_ACTION_KINDS = new Set<string>([
  'BrowserAction',
  'BrowserClickAction',
  'BrowserCloseTabAction',
  'BrowserGetContentAction',
  'BrowserGetStateAction',
  'BrowserGetStorageAction',
  'BrowserGoBackAction',
  'BrowserListTabsAction',
  'BrowserNavigateAction',
  'BrowserScrollAction',
  'BrowserSetStorageAction',
  'BrowserStartRecordingAction',
  'BrowserStopRecordingAction',
  'BrowserSwitchTabAction',
  'BrowserTypeAction',
  'DelegateAction',
  'EditAction',
  'FileEditorAction',
  'FinishAction',
  'GlobAction',
  'GrepAction',
  'InvokeSkillAction',
  'ListDirectoryAction',
  'MCPToolAction',
  'PlanningFileEditorAction',
  'ReadFileAction',
  'SwitchLLMAction',
  'TaskAction',
  'TaskTrackerAction',
  'TerminalAction',
  'ThinkAction',
  'VisionInspectAction',
  'WorkflowAction',
  'WriteFileAction',
]);

/**
 * Returns `null` when no native action payload exists. An unfamiliar action
 * class is not treated as any neighbouring class: its marker stays UNHANDLED.
 */
export function getActionContent(event: unknown): string | null {
  if (!isActionEvent(event)) return null;
  const action = actionRecord(event);
  if (action === null) return null;

  const actionKind = normalizeWireKind(action.kind);
  if (actionKind === null) return null;

  if (actionKind === 'FinishAction' || actionKind === 'ThinkAction') {
    return stringField(action, actionKind === 'FinishAction' ? 'message' : 'thought');
  }

  if (!KNOWN_ACTION_KINDS.has(actionKind)) return unhandledContent(`ActionEvent.${actionKind}`, action);
  return nativeJson(action);
}
