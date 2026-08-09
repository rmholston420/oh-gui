import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import truthTable from '../../../../docs/evidence/trust-dial/policy-truth-table.json';
import {
  DEFAULT_CONFIRM_RISKY,
  shouldConfirm,
  type SecurityRisk,
  type TrustStopId,
} from '../features/first-run/trust-dial';

/**
 * Pins the display mirror to UPSTREAM, not to the spec.
 *
 * `trust-dial.test.ts` already pins every cell to docs/specs/04-authorization.md section 4.1 —
 * to a table a human typed. That catches drift between the mirror and our own document. It
 * cannot catch the case where the document itself is wrong, which is exactly what happened to
 * `AuthorizeRequest`: it was pinned to the documented envelope and was wrong in four of eight
 * fields for as long as anyone had checked.
 *
 * The fixture here is not typed by hand. `scripts/verify_trust_dial.py` extracts
 * `openhands.sdk.security.*` from the pinned agent-server image, proves it matches the pinned
 * sdist, and executes the real `AlwaysConfirm` / `NeverConfirm` / `ConfirmRisky` /
 * `EnsembleSecurityAnalyzer` objects across the full parameter space. Every expectation below
 * is upstream's own answer.
 *
 * Read the `caveat` field in the fixture before trusting this further than it goes: the
 * serialization base class and a few display imports were stubbed to avoid installing the SDK,
 * so logic living in `DiscriminatedUnionMixin` is not covered.
 */

const STOPS: TrustStopId[] = ['ask-always', 'ask-risky', 'ask-outside-worktree', 'never'];
const THRESHOLDS = ['LOW', 'MEDIUM', 'HIGH'] as const;

describe('trust-dial vs the pinned image', () => {
  it('is checked against a real capture, not a hand-written fixture', () => {
    expect(truthTable.source).toContain('agent-server@sha256:f0244fd7');
    expect(truthTable.sdk_version).toBe('1.41.0');
    expect(Object.keys(truthTable.stops).length).toBe(4 * 3 * 2 * 4 * 2);
  });

  it('was captured from the image we currently pin, not an older one', () => {
    // Without this, bumping the pin in docs/UPSTREAM_PINS.md leaves the fixture silently stale:
    // every assertion below would keep passing against the semantics of an image we no longer
    // run. A green check against the wrong version is worse than no check, because it is the one
    // an operator believes. Re-run scripts/capture-trust-dial.sh whenever the pin moves.
    const repoRoot = join(__dirname, '..', '..', '..', '..');
    const pins = readFileSync(join(repoRoot, 'docs', 'UPSTREAM_PINS.md'), 'utf8');
    const pinned = pins.match(/sha256:[0-9a-f]{64}/)?.[0];
    expect(pinned, 'no image digest found in docs/UPSTREAM_PINS.md').toBeTruthy();
    expect(
      truthTable.source,
      `the truth table was captured from a different image than docs/UPSTREAM_PINS.md pins (${pinned}). Re-run scripts/capture-trust-dial.sh.`,
    ).toContain(pinned as string);
  });

  it('agrees with upstream on every stop x threshold x confirm_unknown x risk x location', () => {
    const mismatches: string[] = [];

    for (const stop of STOPS) {
      for (const threshold of THRESHOLDS) {
        for (const confirmUnknown of [true, false]) {
          for (const risk of truthTable.risk_levels as SecurityRisk[]) {
            for (const outside of [false, true]) {
              const key = `${stop}|${threshold}|${confirmUnknown ? 'True' : 'False'}|${risk}|${outside ? 'True' : 'False'}`;
              const upstream = (truthTable.stops as Record<string, boolean>)[key];
              expect(upstream, `fixture is missing ${key}`).toBeTypeOf('boolean');

              const ours = shouldConfirm(
                stop,
                { risk, writesOutsideWorktree: outside },
                { threshold, confirmUnknown },
              );
              if (ours !== upstream) {
                mismatches.push(`${key}: mirror=${ours} upstream=${upstream}`);
              }
            }
          }
        }
      }
    }

    expect(mismatches, `the mirror disagrees with the pinned image:\n${mismatches.join('\n')}`).toEqual(
      [],
    );
  });

  it('carries upstream ConfirmRisky defaults, not defaults we picked', () => {
    // The wizard presents these as the recommended stop. If upstream changes its own defaults,
    // our "recommended" silently stops matching what an unconfigured agent-server would do.
    expect(DEFAULT_CONFIRM_RISKY.threshold).toBe(truthTable.confirm_risky_defaults.threshold);
    expect(DEFAULT_CONFIRM_RISKY.confirmUnknown).toBe(
      truthTable.confirm_risky_defaults.confirm_unknown,
    );
  });

  it('models the ensemble at its real default (propagate_unknown=false)', () => {
    // The mirror's out-of-worktree elevation is only correct at this default. If upstream ever
    // flipped it, an UNKNOWN-risk out-of-worktree write would return UNKNOWN from fusion and the
    // decision would fall back to confirm_unknown — which the mirror does not model.
    expect(truthTable.ensemble_propagate_unknown_default).toBe(false);
  });

  it('confirms the elevation claim the mirror makes in its own comment', () => {
    // trust-dial.ts asserts that an out-of-worktree write reaches the policy as a concrete HIGH,
    // including when the incoming risk is UNKNOWN. That is the claim a previous version got
    // wrong. Assert it against the fusion output directly, not through shouldConfirm, so a
    // compensating error in the predicate cannot hide it.
    const fusion = truthTable.raw.ensemble_fusion as Record<string, string>;
    for (const risk of truthTable.risk_levels as string[]) {
      expect(fusion[`${risk}|True`], `out-of-worktree fusion for ${risk}`).toBe('HIGH');
    }
    expect(fusion['LOW|False']).toBe('LOW');
    expect(fusion['UNKNOWN|False']).toBe('UNKNOWN');
  });
});
