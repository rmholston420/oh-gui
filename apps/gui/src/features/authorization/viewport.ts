/**
 * Viewport capability for the authorization surface (docs/specs/03-layout.md section 3.2,
 * ADR-022).
 *
 * The authorization card goes read-only when the surface is too small to authorize safely. ADR-034
 * splits that judgement along the two distinct threats the old single 900px rule conflated:
 *
 *   - **mis-tap** is a property of the pointing device, not the viewport, so the 900px floor now
 *     applies only to a coarse (touch) pointer;
 *   - **unreadable evidence** is a property of the width, so a fine pointer floors at 768px — the
 *     card's own max-w-3xl content width, below which the command and diff start compressing.
 *
 * The operator works windowed on 3440x1440; a quarter snap is 860px, which the old rule killed
 * while protecting them from a phone they do not own.
 *
 * This is a UI affordance gate, not a security boundary — see ADR-022. The threat it addresses is
 * the operator's own hand on a surface too cramped to read the command, the diff and the blast
 * radius at once. It is deliberately not mirrored in the middleware: viewport is client-reported,
 * so a server-side check would trust exactly the client it claims to guard against, and would
 * then appear in the audit log as an enforced control that is not one.
 */

import { useSyncExternalStore } from 'react';

/**
 * Touch floor. docs/specs/03-layout.md REQ-03-015, ADR-034 clause 1. Inclusive: exactly 900 is
 * wide enough.
 */
export const APPROVAL_MIN_WIDTH_COARSE = 900;

/**
 * Mouse floor: the authorization card's own `max-w-3xl` (48rem) at AuthorizationCard.tsx:111.
 * Above its max width the card is already full size, so more pixels change nothing about what can
 * be read; below it the command and diff compress. Deriving the floor from the card's real
 * constraint keeps the number honest if the card is ever resized.
 */
export const APPROVAL_MIN_WIDTH_FINE = 768;

/**
 * Which floor applies. Unknown pointer capability resolves to the stricter one (ADR-034 clause 2),
 * matching the existing choice to snapshot server-side width as 0 rather than 900.
 */
export function approvalMinWidth(pointerIsCoarse: boolean): number {
  return pointerIsCoarse ? APPROVAL_MIN_WIDTH_COARSE : APPROVAL_MIN_WIDTH_FINE;
}

/**
 * Both arguments are required. A default for `pointerIsCoarse` would let a call site silently
 * reintroduce exactly the conflation ADR-034 exists to remove.
 */
export function canActOnAuthorization(viewportWidth: number, pointerIsCoarse: boolean): boolean {
  return viewportWidth >= approvalMinWidth(pointerIsCoarse);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/**
 * `useSyncExternalStore` rather than `useState` + `useEffect`, deliberately.
 *
 * The effect version reads the width *after* the first paint, so a card mounted into an
 * already-narrow window renders actionable for one frame and then corrects itself. One frame is
 * enough to click. jsdom cannot see frames, so no unit test can close that hole — mutation M4 in
 * scripts/mutate-authz.sh survived against the effect version and is what sent us here. This
 * reads the width during render, so the hole does not exist to be tested for.
 *
 * The server snapshot is 0, not 900: when the width is unknowable the surface is read-only. A
 * fail-open default is the kind of mistake that only shows up in the one environment nobody runs.
 */
export function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    () => 0,
  );
}


const COARSE_POINTER_QUERY = '(pointer: coarse)';

function subscribeToPointer(onChange: () => void): () => void {
  // `matchMedia` is absent in some non-browser environments and its listener API differs across
  // older engines. An environment we cannot interrogate is treated as coarse by getSnapshot, so
  // failing to subscribe here is safe: it can only leave the surface stricter.
  const query = window.matchMedia?.(COARSE_POINTER_QUERY);
  if (query === undefined) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Read during render, not after first paint — same reasoning as `useViewportWidth`. A card mounted
 * into a touch environment must never render actionable for even one frame.
 *
 * Server snapshot is `true` (coarse): when the pointer is unknowable the strict floor applies.
 */
export function usePointerIsCoarse(): boolean {
  return useSyncExternalStore(
    subscribeToPointer,
    () => window.matchMedia?.(COARSE_POINTER_QUERY).matches ?? true,
    () => true,
  );
}
