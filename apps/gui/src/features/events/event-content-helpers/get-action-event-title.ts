/**
 * PORTED and adapted from Agent Canvas 1.12.0
 * `components/conversation-events/chat/event-content-helpers/get-action-event-title.ts` (MIT).
 *
 * Native basis: ActionEvent.summary (action.py:77-88), action (action.py:40-43),
 * and tool_name (action.py:44-46). Nested action fields are not read here.
 */
import {
  actionRecord,
  isActionEvent,
  normalizeWireKind,
  stringField,
  type WireRecord,
} from '../event-types';

export type EventTitleDescriptor =
  | { readonly kind: 'native'; readonly text: string }
  | { readonly kind: 'unhandled'; readonly text: string }
  | null;

const ACTION_LABELS: Readonly<Record<string, string>> = {
  BrowserAction: 'Use browser',
  BrowserClickAction: 'Use browser',
  BrowserCloseTabAction: 'Use browser',
  BrowserGetContentAction: 'Use browser',
  BrowserGetStateAction: 'Use browser',
  BrowserGetStorageAction: 'Use browser',
  BrowserGoBackAction: 'Use browser',
  BrowserListTabsAction: 'Use browser',
  BrowserNavigateAction: 'Use browser',
  BrowserScrollAction: 'Use browser',
  BrowserSetStorageAction: 'Use browser',
  BrowserStartRecordingAction: 'Use browser',
  BrowserStopRecordingAction: 'Use browser',
  BrowserSwitchTabAction: 'Use browser',
  BrowserTypeAction: 'Use browser',
  DelegateAction: 'Delegate task',
  EditAction: 'Edit file',
  FileEditorAction: 'Edit file',
  FinishAction: 'Finish',
  GlobAction: 'Search files',
  GrepAction: 'Search files',
  InvokeSkillAction: 'Invoke skill',
  ListDirectoryAction: 'List directory',
  MCPToolAction: 'Call MCP tool',
  PlanningFileEditorAction: 'Plan file edit',
  ReadFileAction: 'Read file',
  SwitchLLMAction: 'Switch model',
  TaskAction: 'Run task',
  TaskTrackerAction: 'Update tasks',
  TerminalAction: 'Run terminal command',
  ThinkAction: 'Thinking',
  VisionInspectAction: 'Inspect image',
  WorkflowAction: 'Run workflow',
  WriteFileAction: 'Write file',
};

export function trimEventTitleText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

/** Canvas rejects server-generated `tool_name: {...}` fallback summaries. */
export function getActionSummaryTitle(event: WireRecord): string | null {
  const summary = stringField(event, 'summary');
  if (summary === null) return null;
  const normalized = summary.trim().replace(/\s+/g, ' ');
  return normalized.length === 0 || /^[a-z][a-z0-9_]*\s*:\s*[[{]/i.test(normalized)
    ? null
    : normalized;
}

export function getActionEventTitleDescriptor(event: unknown): EventTitleDescriptor {
  if (!isActionEvent(event)) return null;

  const summary = getActionSummaryTitle(event);
  if (summary !== null) return { kind: 'native', text: summary };

  const action = actionRecord(event);
  if (action === null) {
    const toolName = stringField(event, 'tool_name');
    return toolName === null
      ? { kind: 'native', text: 'Non-executable tool call' }
      : { kind: 'native', text: `Non-executable tool call: ${toolName}` };
  }

  const actionKind = normalizeWireKind(action.kind);
  if (actionKind === null) return null;
  const label = ACTION_LABELS[actionKind];
  return label === undefined
    ? { kind: 'unhandled', text: `UNHANDLED action: ${actionKind}` }
    : { kind: 'native', text: label };
}
