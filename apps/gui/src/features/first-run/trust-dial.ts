/**
 * Trust-dial semantics, mirrored from docs/specs/04-authorization.md section 4.1.
 *
 * DISPLAY-ONLY MIRROR. This is not the enforcement point. Enforcement lives in the Python
 * middleware against the real `ConfirmationPolicyBase` / `SecurityAnalyzerBase` objects
 * (ADR-001 item 4). This module exists so the first-run wizard can show the operator what each
 * stop actually decides, computed rather than described.
 *
 * Divergence risk is real and is logged as owed work: Phase 1 must drive this table from the
 * middleware (the generated Agent Server OpenAPI schema, per ADR-001 Amendment #1 finding 2)
 * instead of from a hand-maintained mirror. Until then `trust-dial.test.ts` pins every cell to
 * the spec table so drift fails the gate rather than misleading the operator.
 */

import {
  alwaysConfirm,
  confirmRisky as confirmRiskyPolicy,
  neverConfirm,
  type ConfirmationPolicy,
} from '../../api/types';

export type SecurityRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type TrustStopId = 'ask-always' | 'ask-risky' | 'ask-outside-worktree' | 'never';

export interface ConfirmRiskyParams {
  /** Actions at or above this risk pause. Surfaced in the UI, not an invisible default (spec 4.1 v4.0 correction). */
  threshold: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Whether UNKNOWN-risk actions pause. Also operator-visible. */
  confirmUnknown: boolean;
}

export interface TrustStop {
  id: TrustStopId;
  label: string;
  /** The policy object this maps to upstream. Shown verbatim so the UI cannot drift from the spec silently. */
  mapsTo: string;
  behavior: string;
}

/** docs/specs/04-authorization.md section 4.1, in spec order. */
export const TRUST_STOPS: readonly TrustStop[] = [
  {
    id: 'ask-always',
    label: 'Ask always',
    mapsTo: 'AlwaysConfirm()',
    behavior: 'Every action pauses for approval.',
  },
  {
    id: 'ask-risky',
    label: 'Ask on risky',
    mapsTo: 'ConfirmRisky(threshold=HIGH, confirm_unknown=True)',
    behavior: 'Only HIGH-risk (and by default UNKNOWN) actions pause.',
  },
  {
    id: 'ask-outside-worktree',
    label: 'Ask on writes outside worktree',
    mapsTo:
      'SecurityAnalyzerBase subclass in EnsembleSecurityAnalyzer, feeding ConfirmRisky(threshold=HIGH)',
    behavior: 'Read-only and in-scope writes proceed; out-of-scope writes pause.',
  },
  { id: 'never', label: 'Never', mapsTo: 'NeverConfirm()', behavior: 'Full autonomy. Opt-in only.' },
] as const;

/** The wizard must state and justify this explicitly (spec 3.4 item 4). */
export const DEFAULT_STOP: TrustStopId = 'ask-risky';
export const DEFAULT_CONFIRM_RISKY: ConfirmRiskyParams = { threshold: 'HIGH', confirmUnknown: true };

/**
 * Translate each dial position to the native policy union the Agent Server consumes.
 *
 * `ask-outside-worktree` shares ConfirmRisky with `ask-risky`: its narrower envelope is enforced
 * by ADR-029's separately configured pre-tool-use COMMAND hook, not by a fourth confirmation-policy
 * variant. Vibe and Pro therefore choose defaults on this same data model rather than separate paths.
 */
export function confirmationPolicyForTrustStop(stop: TrustStopId): ConfirmationPolicy {
  switch (stop) {
    case 'ask-always':
      return alwaysConfirm();
    case 'never':
      return neverConfirm();
    case 'ask-risky':
    case 'ask-outside-worktree':
      return confirmRiskyPolicy(DEFAULT_CONFIRM_RISKY.threshold, DEFAULT_CONFIRM_RISKY.confirmUnknown);
  }
}

const RANK: Record<Exclude<SecurityRisk, 'UNKNOWN'>, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/**
 * The out-of-worktree analyzer elevates to HIGH, not to "at least MEDIUM" as
 * docs/specs/04-authorization.md section 4.1 currently says. See KNOWN_ISSUES 2026-08-08.
 *
 * The spec's own behavior column for this stop reads "Read-only and in-scope writes proceed;
 * out-of-scope pauses". Neither literal reading of the text delivers that:
 *   - elevate to MEDIUM + standard ConfirmRisky(threshold=HIGH) -> MEDIUM is below the threshold,
 *     so the elevation changes nothing and the stop is inert. It would silently not work.
 *   - elevate to MEDIUM + ConfirmRisky(threshold=MEDIUM) -> an ordinary in-scope MEDIUM edit now
 *     pauses too, contradicting "in-scope writes proceed".
 * Elevating to HIGH against the standard HIGH threshold is the only combination that matches the
 * stated behavior, and it keeps ConfirmRisky standard as the spec's hard correction requires.
 */
export interface ActionContext {
  risk: SecurityRisk;
  /** True when the action writes outside the conversation worktree. */
  writesOutsideWorktree?: boolean;
}

function confirmRisky(risk: SecurityRisk, params: ConfirmRiskyParams): boolean {
  if (risk === 'UNKNOWN') return params.confirmUnknown;
  return RANK[risk] >= RANK[params.threshold];
}

/**
 * Does this action pause for operator approval at this stop?
 * Pure and total: every (stop, risk) pair is defined.
 */
export function shouldConfirm(
  stop: TrustStopId,
  action: ActionContext,
  params: ConfirmRiskyParams = DEFAULT_CONFIRM_RISKY,
): boolean {
  switch (stop) {
    case 'ask-always':
      return true;
    case 'never':
      return false;
    case 'ask-risky':
      return confirmRisky(action.risk, params);
    case 'ask-outside-worktree': {
      // The analyzer elevates an out-of-worktree write to HIGH before the policy ever sees it.
      //
      // The elevation is unconditional, including when the incoming risk is UNKNOWN. This
      // mirrors EnsembleSecurityAnalyzer.security_risk() in the SDK
      // (openhands/sdk/security/ensemble.py): it collects each child analyzer's assessment and,
      // at the default propagate_unknown=False, filters UNKNOWN out and returns max(concrete).
      // The worktree analyzer returns a concrete HIGH, so HIGH survives fusion and UNKNOWN does
      // not reach the policy at all.
      //
      // A previous version guarded this with `action.risk !== 'UNKNOWN'`, which left UNKNOWN
      // intact and handed the decision to confirm_unknown. At the default confirmUnknown=true
      // both spellings pause, which is why every test passed; with confirmUnknown=false they
      // diverge and this display mirror told the operator an out-of-worktree write would
      // proceed when the real policy pauses it. See trust-dial.test.ts, which now sweeps the
      // parameter space instead of only the defaults.
      const elevated: SecurityRisk = action.writesOutsideWorktree ? 'HIGH' : action.risk;
      return confirmRisky(elevated, params);
    }
  }
}

/** Human-readable outcome, used by the wizard so the copy cannot disagree with the predicate. */
export function outcomeLabel(pauses: boolean): string {
  return pauses ? 'Pauses for you' : 'Proceeds';
}
