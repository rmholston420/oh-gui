import { useSyncExternalStore } from 'react';

/** docs/specs/03-layout.md §3.2: exactly 900px is actionable; 899px is read-only. */
export const MIN_INTERACTIVE_VIEWPORT_WIDTH = 900;

export function isReadOnlyViewport(viewportWidth: number): boolean {
  return viewportWidth < MIN_INTERACTIVE_VIEWPORT_WIDTH;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/**
 * Boolean capability gate consumed by approve/reject/relax surfaces.
 *
 * The server snapshot intentionally fails closed: an unknown viewport is
 * read-only, never actionable. useSyncExternalStore reads before first paint,
 * avoiding the brief actionable frame an effect-based implementation creates.
 */
export function useViewportGate(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isReadOnlyViewport(window.innerWidth),
    () => true,
  );
}
