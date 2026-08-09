import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Navigation that offers a surface the workspace cannot render is a dead button. It happened: a
 * patch added `changes` to the nav and its App wiring in one script, the App half failed on a
 * mismatched anchor, and the result type-checked, passed 264 unit tests, and shipped -- because
 * every test that knew about the panel rendered the panel directly, and every test that knew about
 * the nav rendered the nav directly. Nothing owned the seam between them.
 */

const NAV = readFileSync(new URL('./SurfaceNav.tsx', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

function declaredSurfaces(): string[] {
  const match = NAV.match(/export type Surface =([^;]+);/);
  if (!match) throw new Error('SurfaceNav no longer declares a `Surface` union');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('surface wiring', () => {
  it('finds the surface union at all', () => {
    // Otherwise a renamed type would make every assertion below vacuously true.
    expect(declaredSurfaces().length).toBeGreaterThanOrEqual(2);
    expect(declaredSurfaces()).toContain('run');
  });

  it('offers no surface the workspace cannot render', () => {
    const unwired = declaredSurfaces().filter(
      (surface) => !APP.includes(`surface !== '${surface}'`),
    );
    expect(unwired, `nav offers ${unwired.join(', ')} but App.tsx renders no panel for it`).toEqual(
      [],
    );
  });

  it('advertises every surface it offers in the nav itself', () => {
    const unlisted = declaredSurfaces().filter(
      (surface) => !NAV.includes(`surface: '${surface}'`),
    );
    expect(unlisted, `Surface union declares ${unlisted.join(', ')} with no nav entry`).toEqual([]);
  });
});
