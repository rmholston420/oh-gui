import { describe, expect, it } from 'vitest';
import {
  AuditLogValidationError,
  AuthorizationAuditLog,
  exportAuthorizationAuditLog,
  sdkNativeAuthorizationSnapshotFromEvent,
  type ApprovalAuditWrite,
  type AuthorizationAuditWrite,
} from './audit-log';

function approval(overrides: Partial<ApprovalAuditWrite> = {}): ApprovalAuditWrite {
  return {
    decision: 'approved',
    actionLabel: 'Read workspace package manifest',
    actionClass: 'workspace-read',
    confidence: 0.85,
    provenance: [
      {
        id: 'context-1',
        trust_class: 'workspace-derived',
        source: 'workspace/package.json',
      },
    ],
    sdkNative: sdkNativeAuthorizationSnapshotFromEvent({
      kind: 'ActionEvent',
      id: 'action-1',
      timestamp: '2026-08-09T04:30:00.000Z',
      source: 'agent',
      tool_name: 'read_file',
      tool_call_id: 'call-1',
      security_risk: 'LOW',
    }),
    ...overrides,
  };
}

function log() {
  return new AuthorizationAuditLog({
    sessionId: 'conversation-1',
    clock: () => '2026-08-09T04:31:00.000Z',
    entryId: (sequence) => `entry-${sequence}`,
  });
}

describe('sdkNativeAuthorizationSnapshotFromEvent', () => {
  it('exposes only verified ActionEvent fields and retains absent native fields as null', () => {
    const snapshot = sdkNativeAuthorizationSnapshotFromEvent({
      kind: 'ActionEvent',
      id: 'action-1',
      timestamp: '2026-08-09T04:30:00.000Z',
      source: 'agent',
      tool_name: 'execute_bash',
      tool_call_id: 'call-1',
      security_risk: 'HIGH',
      invented_analyzer: 'policy-rail',
    });

    expect(snapshot).toEqual({
      eventId: 'action-1',
      eventTimestamp: '2026-08-09T04:30:00.000Z',
      eventSource: 'agent',
      toolName: 'execute_bash',
      toolCallId: 'call-1',
      securityRisk: 'HIGH',
      actionId: null,
      rejectionReason: null,
      rejectionSource: null,
    });
    expect(snapshot).not.toHaveProperty('invented_analyzer');
  });

  it('reads the native UserRejectObservation fields without inventing an ActionEvent risk', () => {
    const snapshot = sdkNativeAuthorizationSnapshotFromEvent({
      kind: 'UserRejectObservation',
      id: 'rejection-1',
      timestamp: '2026-08-09T04:32:00.000Z',
      source: 'environment',
      tool_name: 'execute_bash',
      tool_call_id: 'call-1',
      action_id: 'action-1',
      rejection_reason: 'The command would leave the workspace.',
      rejection_source: 'user',
      security_risk: 'LOW',
    });

    expect(snapshot).toMatchObject({
      actionId: 'action-1',
      rejectionReason: 'The command would leave the workspace.',
      rejectionSource: 'user',
      securityRisk: null,
    });
  });

  it('returns null for an unsupported event instead of projecting lookalike fields', () => {
    expect(
      sdkNativeAuthorizationSnapshotFromEvent({
        kind: 'SomeFutureEvent',
        id: 'future-1',
        security_risk: 'HIGH',
      }),
    ).toBeNull();
  });
});

describe('AuthorizationAuditLog', () => {
  it('appends approval, rejection-with-reason, and relaxation-grant entries', () => {
    const audit = log();
    const approved = audit.append(approval());
    const rejected = audit.append({
      ...approval(),
      decision: 'rejected',
      rejectionReason: 'The requested path is outside the approved workspace.',
    });
    const relaxed = audit.append({
      ...approval(),
      decision: 'relaxation-granted',
      relaxationClass: 'workspace-read',
    });

    expect(audit.entries.map((entry) => entry.decision)).toEqual([
      'approved',
      'rejected',
      'relaxation-granted',
    ]);
    expect(approved.guiLocal.rejectionReason).toBeNull();
    expect(rejected.guiLocal.rejectionReason).toBe('The requested path is outside the approved workspace.');
    expect(relaxed.guiLocal.relaxationClass).toBe('workspace-read');
    expect(audit.activeRelaxationCount).toBe(1);
  });

  it('refuses a provenance-less write instead of manufacturing an empty provenance array', () => {
    const audit = log();
    const withoutProvenance = { ...approval(), provenance: undefined } as unknown as AuthorizationAuditWrite;

    try {
      audit.append(withoutProvenance);
      throw new Error('append unexpectedly accepted missing provenance');
    } catch (error) {
      expect(error).toBeInstanceOf(AuditLogValidationError);
      expect((error as AuditLogValidationError).code).toBe('missing-provenance');
    }
    expect(audit.entries).toEqual([]);
  });

  it('requires a structured provenance array and required provenance members at write time', () => {
    const audit = log();

    expect(() => audit.append({ ...approval(), provenance: null } as unknown as AuthorizationAuditWrite)).toThrow(
      /structured provenance array/i,
    );
    expect(() => audit.append({ ...approval(), provenance: [{ id: 'context-1', trust_class: 'first-party' }] } as never)).toThrow(
      /source/i,
    );
    expect(() => audit.append({ ...approval(), confidence: 1.01 })).toThrow(/confidence/i);
  });

  it('requires the user reason for a rejection and the class for a relaxation grant', () => {
    const audit = log();

    expect(() =>
      audit.append({ ...approval(), decision: 'rejected', rejectionReason: '   ' }),
    ).toThrow(/rejectionReason/i);
    expect(() =>
      audit.append({ ...approval(), decision: 'relaxation-granted', relaxationClass: '' }),
    ).toThrow(/relaxationClass/i);
  });

  it('keeps an explicitly captured empty provenance distinct from a refused missing capture', () => {
    const audit = log();
    const entry = audit.append(approval({ provenance: [] }));

    expect(entry.provenance).toEqual([]);
    expect(audit.entries).toHaveLength(1);
    expect(() => audit.append({ ...approval(), provenance: undefined } as unknown as AuthorizationAuditWrite)).toThrow(
      AuditLogValidationError,
    );
  });

  it('captures provenance and confidence at append time rather than reconstructing them later', () => {
    const audit = log();
    const source = approval();
    const entry = audit.append(source);
    (source.provenance as unknown as AuditProvenanceReferenceMutable[])[0]!.source = 'tampered-after-decision';
    (source as { confidence: number }).confidence = 0.01;

    expect(entry.provenance[0]!.source).toBe('workspace/package.json');
    expect(entry.confidence).toBe(0.85);
  });

  it('makes entries deeply immutable and preserves append-only history against mutation attempts', () => {
    const audit = log();
    const entry = audit.append(approval());
    const history = audit.entries;

    // Mutation M1: remove `deepFreeze` from append or from the history getter. These attempts then
    // succeed and the assertions below turn red, proving the append-only immutability gate.
    expect(() => {
      (entry.guiLocal as { actionLabel: string }).actionLabel = 'tampered';
    }).toThrow(TypeError);
    expect(() => {
      (entry.provenance[0]! as { source: string }).source = 'tampered';
    }).toThrow(TypeError);
    expect(() => {
      (history as unknown as AuthorizationAuditEntryMutable[]).push(entry);
    }).toThrow(TypeError);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]!.guiLocal.actionLabel).toBe('Read workspace package manifest');
    expect(audit.entries[0]!.provenance[0]!.source).toBe('workspace/package.json');
  });

  it('expires every relaxation when the conversation session ends without mutating the grant record', () => {
    const audit = log();
    const relaxation = audit.append({
      ...approval(),
      decision: 'relaxation-granted',
      relaxationClass: 'workspace-read',
    });

    expect(audit.activeRelaxationCount).toBe(1);
    const ended = audit.endSession();
    expect(ended).toEqual({
      sessionId: 'conversation-1',
      status: 'ended',
      endedAt: '2026-08-09T04:31:00.000Z',
    });
    expect(audit.activeRelaxationCount).toBe(0);
    expect(audit.entries[0]).toBe(relaxation);
    expect(() => audit.append(approval())).toThrow(/after session end/i);
  });

  it('exports immutable entries and their session scope without adding reconstructed fields', () => {
    const audit = log();
    audit.append(approval({ sdkNative: null, actionClass: null, provenance: [] }));
    const payload = JSON.parse(exportAuthorizationAuditLog(audit.entries, audit.session)) as {
      format: string;
      session: { endedAt: string | null };
      entries: Array<{ confidence: number; provenance: unknown[]; sdkNative: unknown; guiLocal: { actionClass: unknown } }>;
    };

    expect(payload.format).toBe('oh-gui.authorization-audit-log.v1');
    expect(payload.session.endedAt).toBeNull();
    expect(payload.entries[0]).toMatchObject({
      confidence: 0.85,
      provenance: [],
      sdkNative: null,
      guiLocal: { actionClass: null },
    });
  });
});

/** Narrow mutable views used only to test that frozen public values reject writes at runtime. */
type AuditProvenanceReferenceMutable = { source: string };
type AuthorizationAuditEntryMutable = { id: string };
