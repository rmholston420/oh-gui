/**
 * Authorization card — minimal Phase 1 slice of docs/specs/04-authorization.md section 4.2.
 *
 * WHAT THIS SLICE DELIBERATELY DOES NOT BUILD
 * -------------------------------------------
 * Section 4.2's untrusted-content indicator is built as an explicit GUI-local provenance input:
 * pinned SDK 1.41.0 `ActionEvent` carries no trust-class or context-provenance field. The badge
 * never presents that local input as SDK-native. The 4.2.1 audit log remains outside this slice.
 * The agent's own account (`summary` / `thought` / `reasoning_content`) IS now built — ported from
 * Agent Canvas, see `agent-account.ts` — and renders below the blast radius so the derived reading
 * is what the operator meets first.
 *
 * Blast radius IS now built, per ADR-023 (ratified option B), but only as identity reads of
 * native fields and one URL parse — see `blast-radius.ts`. It is optional on `PendingAction`:
 * a card given no `event` renders no blast-radius section at all, which is honest, whereas a
 * card that invented an empty one would not be. An empty projection and an uncomputed one must
 * never look alike (section 4.2, ADR-015), which `BlastRadiusSection` enforces structurally.
 *
 * This slice exists to make the 900px read-only gate real — a gate needs something to gate — and
 * to establish the headed-Playwright pattern the remaining Phase 1 frontend work will use.
 *
 * RISK ATTRIBUTION
 * ----------------
 * `securityRisk` is rendered as *the LLM's* assessment, never as an unattributed verdict. The
 * native field description for `ActionEvent.security_risk` reads "The LLM's assessment of the
 * safety risk of this action" (sdk/event/llm_convertible/action.py:66-69). Rendering it as "Risk:
 * HIGH" would imply an analyzer verdict the system does not have — ADR-015's Status amendment
 * removed analyzer attribution from this card precisely because it is not recoverable.
 */

import { useId, useMemo, useState } from 'react';
import { readAgentAccount, type AgentAccountSource } from './agent-account';
import { AgentAccountSection } from './AgentAccountSection';
import { blastRadius, type ActionLike } from './blast-radius';
import BlastRadiusSection from './BlastRadiusSection';
import { UntrustedContentBadge } from './UntrustedContentBadge';
import type { GuiLocalUntrustedContentProvenance } from './untrusted-content';
import {
  approvalMinWidth,
  canActOnAuthorization,
  usePointerIsCoarse,
  useViewportWidth,
} from './viewport';

export type SecurityRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export interface PendingAction {
  /** The exact command / patch / tool call about to execute (section 4.2, first bullet). */
  command: string;
  toolName: string;
  /** `ActionEvent.security_risk`. Null when the agent supplied none — never defaulted to LOW. */
  securityRisk: SecurityRisk | null;
  /**
   * GUI-local (not SDK-native) untrusted-content provenance. The pinned SDK's `ActionEvent` has
   * no equivalent field. Omit only when this GUI has no provenance input; within the local value,
   * `null` means not computed and `[]` means computed with no untrusted influence.
   */
  guiLocalUntrustedContentProvenance?: GuiLocalUntrustedContentProvenance;
  /**
   * The native `ActionEvent` fields blast radius is projected from. Optional: when absent, no
   * blast-radius section renders. Omission is not the same as an empty radius, so it must not
   * be modelled as one.
   */
  event?: ActionLike & AgentAccountSource;
}

export interface AuthorizationCardProps {
  action: PendingAction;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  onApproveAndRelax?: () => void;
}

const RISK_STYLE: Record<SecurityRisk, string> = {
  // Contrast checked in the headed e2e run, not by eye. jsdom cannot see colour.
  LOW: 'bg-emerald-950 text-emerald-200 border-emerald-700',
  MEDIUM: 'bg-amber-950 text-amber-100 border-amber-600',
  HIGH: 'bg-rose-950 text-rose-100 border-rose-600',
  UNKNOWN: 'bg-slate-800 text-slate-100 border-slate-500',
};

export default function AuthorizationCard({
  action,
  onApprove,
  onReject,
  onApproveAndRelax,
}: AuthorizationCardProps) {
  const width = useViewportWidth();
  const pointerIsCoarse = usePointerIsCoarse();
  const canAct = canActOnAuthorization(width, pointerIsCoarse);
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const radius = useMemo(
    () => (action.event === undefined ? null : blastRadius(action.event)),
    [action.event],
  );

  // Same optionality rule as the radius: no event means no self-report section, because "the agent
  // said nothing" and "we were never given the event" are different facts (spec 04 §4.2).
  const account = useMemo(
    () =>
      action.event === undefined
        ? null
        : readAgentAccount(action.event),
    [action.event],
  );

  // Section 4.2: "Reject with reason (free-text required)". Required means the control is
  // unavailable without it, not that a blank reason is silently accepted.
  const rejectReady = canAct && reason.trim().length > 0;

  return (
    <section
      aria-labelledby="authz-heading"
      data-testid="authorization-card"
      data-can-act={canAct}
      className="max-w-3xl rounded-lg border border-slate-600 bg-night-900 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="authz-heading" className="text-lg font-semibold">
          Approval needed
        </h2>
        {action.securityRisk === null ? (
          <span
            data-testid="risk-badge"
            className="rounded border border-slate-500 bg-slate-800 px-2 py-1 text-xs text-slate-100"
          >
            No risk assessment provided
          </span>
        ) : (
          <span
            data-testid="risk-badge"
            className={`rounded border px-2 py-1 text-xs font-semibold ${RISK_STYLE[action.securityRisk]}`}
          >
            {/* Attribution is part of the label, not a tooltip: a tooltip is not read by
                someone scanning the card in a hurry, which is when this matters most. */}
            The agent rates this {action.securityRisk}
          </span>
        )}
        <UntrustedContentBadge provenance={action.guiLocalUntrustedContentProvenance} />
      </div>

      {/* Above the command and the analysis sections, not below them. This notice governs whether
          the operator can act at all, so it must be legible before they invest in reading anything
          else. It was previously last, and the agent-account section pushed it off a 390px screen
          entirely — caught by the narrow-viewport gate, which is why that gate asserts viewport
          presence rather than mere existence in the DOM. */}
      {!canAct && (
        <p
          data-testid="narrow-viewport-notice"
          role="status"
          className="mt-3 rounded border border-amber-600 bg-amber-950 p-3 text-sm text-amber-100"
        >
          <span className="font-semibold">Read-only at this window size. </span>
          Approving, rejecting, or relaxing needs a window at least {approvalMinWidth(pointerIsCoarse)}px wide, so
          the command and its effects can be read together before you decide. Widen the window to
          act.
        </p>
      )}

      <p className="mt-1 text-sm text-slate-300">
        <span className="font-medium text-slate-200">{action.toolName}</span> is about to run:
      </p>
      {/* Focusable and labelled: the block scrolls horizontally on a narrow window, and a
          scrollable region a keyboard cannot reach hides the tail of the very command being
          authorized. Found by the headed axe run at 390px, not by review. */}
      <pre
        tabIndex={0}
        role="region"
        aria-label="Command awaiting authorization"
        data-testid="pending-command"
        className="mt-2 overflow-x-auto rounded border border-slate-700 bg-night-950 p-3 text-sm text-slate-100"
      >
        {action.command}
      </pre>

      {radius !== null && <BlastRadiusSection radius={radius} />}
      {/* Below the radius, deliberately: derived first, self-report second. Order is asserted. */}
      {account !== null && <AgentAccountSection account={account} />}


      <div className="mt-3">
        <label htmlFor={reasonId} className="block text-sm text-slate-300">
          Reason (required to reject)
        </label>
        <input
          id={reasonId}
          data-testid="reject-reason"
          value={reason}
          disabled={!canAct}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded border border-slate-600 bg-night-950 p-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* Reject is first and Approve is not visually primary: the cheap-to-reverse action
            should not be the one the hand reaches for by default. */}
        <button
          type="button"
          data-testid="reject"
          disabled={!rejectReady}
          onClick={() => onReject?.(reason.trim())}
          className="rounded border border-slate-500 px-3 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          data-testid="approve"
          disabled={!canAct}
          onClick={() => onApprove?.()}
          className="rounded border border-slate-500 px-3 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          data-testid="approve-and-relax"
          disabled={!canAct}
          onClick={() => onApproveAndRelax?.()}
          className="rounded border border-slate-500 px-3 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve and relax for this class
        </button>
      </div>
    </section>
  );
}
