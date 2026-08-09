// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AuthorizationAuditLog } from './audit-log';
import { AuthorizationAuditLogPanel } from './AuditLogPanel';

function populatedLog() {
  const log = new AuthorizationAuditLog({
    sessionId: 'conversation-panel',
    clock: () => '2026-08-09T04:40:00.000Z',
    entryId: (sequence) => `panel-entry-${sequence}`,
  });
  log.append({
    decision: 'rejected',
    actionLabel: 'Run migration command',
    actionClass: null,
    confidence: 0.75,
    provenance: [
      {
        id: 'context-config-1',
        trust_class: 'third-party-untrusted',
        source: 'README pasted into conversation',
      },
    ],
    sdkNative: null,
    rejectionReason: 'The command is based on untrusted instructions.',
  });
  log.append({
    decision: 'relaxation-granted',
    actionLabel: 'Read workspace manifest',
    actionClass: 'workspace-read',
    confidence: 0.9,
    provenance: [],
    sdkNative: {
      eventId: 'action-2',
      eventTimestamp: '2026-08-09T04:39:00.000Z',
      eventSource: 'agent',
      toolName: 'read_file',
      toolCallId: 'call-2',
      securityRisk: 'LOW',
      actionId: null,
      rejectionReason: null,
      rejectionSource: null,
    },
    relaxationClass: 'workspace-read',
  });
  return log;
}

describe('AuthorizationAuditLogPanel', () => {
  it('renders GUI-local decision evidence separately from SDK-native readings', () => {
    const audit = populatedLog();
    render(
      <AuthorizationAuditLogPanel
        entries={audit.entries}
        session={audit.session}
        activeRelaxationCount={audit.activeRelaxationCount}
      />,
    );

    expect(screen.getByTestId('authorization-audit-log-panel')).toBeInTheDocument();
    expect(screen.getByTestId('active-relaxation-count')).toHaveTextContent('Active relaxations: 1');
    expect(screen.getAllByText('GUI-local decision record')).toHaveLength(2);
    expect(screen.getAllByText('SDK-native readings')).toHaveLength(2);
    expect(screen.getByText('The command is based on untrusted instructions.')).toBeInTheDocument();
    expect(screen.getByText('Not computed')).toBeInTheDocument();
    expect(screen.getByText('context-config-1')).toBeInTheDocument();
    expect(screen.getByText('third-party-untrusted')).toBeInTheDocument();
    expect(screen.getByTestId('audit-sdk-native-unavailable')).toHaveTextContent(/not supplied/i);
    expect(screen.getByTestId('audit-provenance-empty-panel-entry-2')).toHaveTextContent(
      /no context items informed this decision/i,
    );
  });

  it('exports the visible immutable session payload through the host callback', async () => {
    const audit = populatedLog();
    const user = userEvent.setup();
    let exported: string | null = null;
    render(
      <AuthorizationAuditLogPanel
        entries={audit.entries}
        session={audit.session}
        activeRelaxationCount={audit.activeRelaxationCount}
        onExport={(payload) => {
          exported = payload;
        }}
      />,
    );

    await user.click(screen.getByTestId('audit-log-export'));

    expect(exported).not.toBeNull();
    expect(JSON.parse(exported!)).toMatchObject({
      format: 'oh-gui.authorization-audit-log.v1',
      session: { sessionId: 'conversation-panel', status: 'active' },
      entries: [
        { decision: 'rejected', confidence: 0.75 },
        { decision: 'relaxation-granted', confidence: 0.9 },
      ],
    });
  });

  it('shows session-scoped relaxation expiry instead of retaining an active badge after end', () => {
    const audit = populatedLog();
    audit.endSession();
    render(
      <AuthorizationAuditLogPanel
        entries={audit.entries}
        session={audit.session}
        activeRelaxationCount={audit.activeRelaxationCount}
      />,
    );

    expect(screen.getByTestId('active-relaxation-count')).toHaveTextContent('Active relaxations: 0');
    expect(screen.getByTestId('audit-session-ended')).toHaveTextContent(/all relaxation grants have expired/i);
    expect(screen.getByText(/Expired when this session ended/)).toBeInTheDocument();
  });

  it('renders an explicit empty state when no decision was written', () => {
    const audit = new AuthorizationAuditLog({ sessionId: 'empty-session' });
    render(
      <AuthorizationAuditLogPanel
        entries={audit.entries}
        session={audit.session}
        activeRelaxationCount={audit.activeRelaxationCount}
      />,
    );

    expect(screen.getByTestId('audit-log-empty')).toHaveTextContent(/no authorization decisions/i);
  });
});
