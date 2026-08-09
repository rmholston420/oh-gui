/**
 * Viewport capability for the authorization surface (docs/specs/03-layout.md section 3.2,
 * ADR-022).
 *
 * Below 900px the authorization card is read-only: Approve, Reject and "relax for this class" are
 * unavailable, with no exception path (ADR-003 removed the delegated-review exception).
 *
 * This is a UI affordance gate, not a security boundary — see ADR-022. The threat it addresses is
 * the operator's own hand on a surface too cramped to read the command, the diff and the blast
 * radius at once. It is deliberately not mirrored in the middleware: viewport is client-reported,
 * so a server-side check would trust exactly the client it claims to guard against, and would
 * then appear in the audit log as an enforced control that is not one.
 */

import { useSyncExternalStore } from 'react';

/** docs/specs/03-layout.md section 3.2. Inclusive: exactly 900 is wide enough. */
export const APPROVAL_MIN_WIDTH = 900;

export function canActOnAuthorization(viewportWidth: number): boolean {
  return viewportWidth >= APPROVAL_MIN_WIDTH;
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
