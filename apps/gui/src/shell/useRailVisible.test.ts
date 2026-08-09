import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RAIL_MIN_VIEWPORT_WIDTH, isRailVisible } from './useRailVisible';

describe('isRailVisible', () => {
  it('matches the CSS breakpoint exactly at the boundary', () => {
    expect(isRailVisible(RAIL_MIN_VIEWPORT_WIDTH)).toBe(true);
    expect(isRailVisible(RAIL_MIN_VIEWPORT_WIDTH - 1)).toBe(false);
  });

  it('treats the operator\'s common unmaximised widths as railless', () => {
    // 3440x1440 maximised clears the bar; a window that is not full-screen usually does not.
    expect(isRailVisible(1280)).toBe(false);
    expect(isRailVisible(1699)).toBe(false);
    expect(isRailVisible(3440)).toBe(true);
  });
});

describe('the TypeScript copy of the breakpoint', () => {
  it('is the same number the stylesheet uses to show the rail', () => {
    // CSS cannot tell React what it decided, so the value is written twice. This test is the
    // only thing keeping the two honest: change one without the other and it fails here.
    const css = readFileSync(new URL('./Shell.css', import.meta.url), 'utf8');
    const railBreakpoints = [...css.matchAll(/@media \(min-width: (\d+)px\)/g)]
      .map((match) => Number(match[1]))
      .filter((width) => width > 1200);
    expect(railBreakpoints).toContain(RAIL_MIN_VIEWPORT_WIDTH);
  });
});
