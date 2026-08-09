/**
 * Node environment on purpose — no `window`.
 *
 * `useViewportWidth`'s server snapshot is the one branch jsdom can never reach, because jsdom
 * always supplies a window. Mutation M4 (server snapshot returning 900 instead of 0) survived the
 * whole jsdom suite for exactly that reason. This is the test that kills it.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AuthorizationCard from '../features/authorization/AuthorizationCard';

describe('with no window to measure', () => {
  it('renders read-only rather than assuming a wide viewport', () => {
    const html = renderToString(
      <AuthorizationCard
        action={{ toolName: 'execute_bash', command: 'true', securityRisk: 'HIGH' }}
      />,
    );
    expect(html).toContain('data-can-act="false"');
    // React splits interpolated text with `<!-- -->` markers, so match around them rather than
    // asserting a literal the renderer never emits.
    expect(html).toMatch(/at least (<!-- -->)?900(<!-- -->)?px wide/);
    // Every action disabled, not just the primary one.
    expect(html.match(/<button[^>]*disabled/g) ?? []).toHaveLength(3);
  });
});
