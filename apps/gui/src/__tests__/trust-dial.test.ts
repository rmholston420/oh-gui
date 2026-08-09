import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIRM_RISKY,
  DEFAULT_STOP,
  TRUST_STOPS,
  shouldConfirm,
  type SecurityRisk,
  type TrustStopId,
} from '../features/first-run/trust-dial';

/**
 * Pins the display mirror to docs/specs/04-authorization.md section 4.1.
 * If the spec changes and this module does not, the gate fails rather than the wizard quietly
 * telling the operator something untrue about what their dial does.
 */
const RISKS: SecurityRisk[] = ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'];

describe('trust-dial mirror', () => {
  it('has exactly the four stops the spec defines, in spec order', () => {
    expect(TRUST_STOPS.map((s) => s.id)).toEqual([
      'ask-always',
      'ask-risky',
      'ask-outside-worktree',
      'never',
    ]);
  });

  it('defaults to ConfirmRisky(threshold=HIGH, confirm_unknown=True) (spec 3.4 item 4)', () => {
    expect(DEFAULT_STOP).toBe('ask-risky');
    expect(DEFAULT_CONFIRM_RISKY).toEqual({ threshold: 'HIGH', confirmUnknown: true });
  });

  it('"Ask always" pauses on every risk, in or out of the worktree', () => {
    for (const risk of RISKS) {
      expect(shouldConfirm('ask-always', { risk })).toBe(true);
      expect(shouldConfirm('ask-always', { risk, writesOutsideWorktree: true })).toBe(true);
    }
  });

  it('"Never" pauses on nothing - including HIGH and UNKNOWN', () => {
    for (const risk of RISKS) {
      expect(shouldConfirm('never', { risk })).toBe(false);
      expect(shouldConfirm('never', { risk, writesOutsideWorktree: true })).toBe(false);
    }
  });

  it('"Ask on risky" pauses on HIGH and UNKNOWN only, at the default params', () => {
    expect(shouldConfirm('ask-risky', { risk: 'LOW' })).toBe(false);
    expect(shouldConfirm('ask-risky', { risk: 'MEDIUM' })).toBe(false);
    expect(shouldConfirm('ask-risky', { risk: 'HIGH' })).toBe(true);
    expect(shouldConfirm('ask-risky', { risk: 'UNKNOWN' })).toBe(true);
  });

  it('confirm_unknown is a real knob, not decoration (spec 4.1 v4.0 correction)', () => {
    const off = { threshold: 'HIGH', confirmUnknown: false } as const;
    expect(shouldConfirm('ask-risky', { risk: 'UNKNOWN' }, off)).toBe(false);
    expect(shouldConfirm('ask-risky', { risk: 'HIGH' }, off)).toBe(true);
  });

  it('threshold is a real knob', () => {
    const low = { threshold: 'LOW', confirmUnknown: true } as const;
    expect(shouldConfirm('ask-risky', { risk: 'LOW' }, low)).toBe(true);
    const med = { threshold: 'MEDIUM', confirmUnknown: true } as const;
    expect(shouldConfirm('ask-risky', { risk: 'LOW' }, med)).toBe(false);
    expect(shouldConfirm('ask-risky', { risk: 'MEDIUM' }, med)).toBe(true);
  });

  describe('"Ask on writes outside worktree"', () => {
    it('lets in-scope reads and writes proceed', () => {
      expect(shouldConfirm('ask-outside-worktree', { risk: 'LOW' })).toBe(false);
    });

    it('pauses a LOW-risk write that lands outside the worktree', () => {
      // This is the whole point of the stop. If this ever returns false the stop is inert.
      expect(
        shouldConfirm('ask-outside-worktree', { risk: 'LOW', writesOutsideWorktree: true }),
      ).toBe(true);
    });

    it('lets an ordinary in-scope MEDIUM edit proceed - the stop is about location, not size', () => {
      // If this pauses, the stop contradicts its own spec behavior ("in-scope writes proceed").
      expect(shouldConfirm('ask-outside-worktree', { risk: 'MEDIUM' })).toBe(false);
    });

    it('still pauses HIGH and UNKNOWN regardless of location', () => {
      expect(shouldConfirm('ask-outside-worktree', { risk: 'HIGH' })).toBe(true);
      expect(shouldConfirm('ask-outside-worktree', { risk: 'UNKNOWN' })).toBe(true);
    });

    it('is strictly stricter than "Ask on risky", never looser - across every parameter combination', () => {
      // Previously this swept risks at the DEFAULT params only. That is what let the UNKNOWN
      // elevation bug below ship green: the two spellings only disagree when confirmUnknown is
      // off. Sweep the whole parameter space, not just the defaults.
      for (const risk of RISKS) {
        for (const out of [false, true]) {
          for (const threshold of ['LOW', 'MEDIUM', 'HIGH'] as const) {
            for (const confirmUnknown of [true, false]) {
              const params = { threshold, confirmUnknown };
              const a = shouldConfirm('ask-risky', { risk, writesOutsideWorktree: out }, params);
              const b = shouldConfirm(
                'ask-outside-worktree',
                { risk, writesOutsideWorktree: out },
                params,
              );
              if (a) {
                expect(
                  b,
                  `ask-outside-worktree must never be looser than ask-risky (risk=${risk} outside=${out} threshold=${threshold} confirmUnknown=${confirmUnknown})`,
                ).toBe(true);
              }
            }
          }
        }
      }
    });

    it('pauses an UNKNOWN-risk write outside the worktree even when confirm_unknown is off', () => {
      // Native semantics, verified against openhands/sdk/security/ensemble.py at SDK 1.41.0:
      // EnsembleSecurityAnalyzer filters UNKNOWN and returns max(concrete) when
      // propagate_unknown is false (the default). The worktree analyzer contributes a concrete
      // HIGH, so the policy is handed HIGH -- it never sees UNKNOWN and confirm_unknown is not
      // consulted. ConfirmRisky(threshold=HIGH).should_confirm(HIGH) is true because
      // SecurityRisk.is_riskier is reflexive.
      const unknownOff = { threshold: 'HIGH', confirmUnknown: false } as const;
      expect(
        shouldConfirm(
          'ask-outside-worktree',
          { risk: 'UNKNOWN', writesOutsideWorktree: true },
          unknownOff,
        ),
      ).toBe(true);
    });

    it('elevation outranks the threshold knob: an out-of-worktree write pauses at every threshold', () => {
      for (const threshold of ['LOW', 'MEDIUM', 'HIGH'] as const) {
        for (const risk of RISKS) {
          expect(
            shouldConfirm(
              'ask-outside-worktree',
              { risk, writesOutsideWorktree: true },
              { threshold, confirmUnknown: false },
            ),
            `out-of-worktree write must pause (risk=${risk} threshold=${threshold})`,
          ).toBe(true);
        }
      }
    });
  });

  it('is total: every stop x risk pair returns a boolean', () => {
    const stops: TrustStopId[] = TRUST_STOPS.map((s) => s.id);
    for (const stop of stops) {
      for (const risk of RISKS) {
        expect(typeof shouldConfirm(stop, { risk })).toBe('boolean');
      }
    }
  });

  it('orders the stops from strictest to loosest', () => {
    const strictness = TRUST_STOPS.map(
      (s) => RISKS.filter((risk) => shouldConfirm(s.id, { risk })).length,
    );
    expect(strictness).toEqual([...strictness].sort((a, b) => b - a));
  });
});
