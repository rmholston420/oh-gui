import { useSyncExternalStore } from 'react';

/**
 * docs/specs/03-layout.md: the left rail only exists at the four-region breakpoint. Below 1700px
 * the rail is `display: none` (Shell.css), which also removes it from the accessibility tree —
 * so anything mounted *only* in the rail is unreachable, not merely narrow.
 *
 * This is the ADR-031 breakpoint, duplicated here as a number because CSS cannot tell React what
 * it decided. `Shell.test.tsx` pins the two to each other so the copy cannot drift silently.
 */
export const RAIL_MIN_VIEWPORT_WIDTH = 1700;

export function isRailVisible(viewportWidth: number): boolean {
  return viewportWidth >= RAIL_MIN_VIEWPORT_WIDTH;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/**
 * True when the rail is actually rendered and reachable.
 *
 * Fails closed to `false`: on an unknown viewport the caller must assume the rail is absent and
 * provide navigation elsewhere. The opposite default would hide navigation on the server render
 * and leave the surface unreachable, which is the exact bug this hook exists to prevent.
 */
export function useRailVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isRailVisible(window.innerWidth),
    () => false,
  );
}
