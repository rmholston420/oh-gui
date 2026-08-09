import { describe, expect, it } from 'vitest';

import { clampStep } from '../features/first-run/wizard-nav';
import { STEP_COUNT } from '../features/first-run/FirstRunWizard';

describe('clampStep', () => {
  it('never returns an index outside the array, for any input', () => {
    for (let n = -20; n <= 40; n++) {
      const r = clampStep(n, STEP_COUNT);
      expect(r, `clampStep(${n}) escaped the range`).toBeGreaterThanOrEqual(0);
      expect(r, `clampStep(${n}) escaped the range`).toBeLessThanOrEqual(STEP_COUNT - 1);
    }
  });

  it('passes in-range values through untouched', () => {
    for (let n = 0; n < STEP_COUNT; n++) expect(clampStep(n, STEP_COUNT)).toBe(n);
  });

  it('pins to the ends rather than wrapping', () => {
    expect(clampStep(-1, STEP_COUNT)).toBe(0);
    expect(clampStep(STEP_COUNT, STEP_COUNT)).toBe(STEP_COUNT - 1);
    expect(clampStep(999, STEP_COUNT)).toBe(STEP_COUNT - 1);
  });

  it('degrades safely on a degenerate step list', () => {
    expect(clampStep(3, 0)).toBe(0);
    expect(clampStep(-3, 0)).toBe(0);
    expect(clampStep(0, 1)).toBe(0);
  });
});
