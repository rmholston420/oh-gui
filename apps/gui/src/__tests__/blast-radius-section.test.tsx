// @vitest-environment jsdom
/**
 * ADR-023 decision 2b is a *rendering* requirement, so it needs a rendering test:
 *
 *   "A test must fail if a projected value and a raw native value render under the same heading
 *    or with the same affordance."
 *
 * Option B lets no-projection tools show their native inputs verbatim. That concession is only
 * safe while the two categories stay visibly and structurally separable — otherwise the card
 * quietly implies we analysed a `rm -rf /` we never looked at. These tests are the thing standing
 * between option B and that outcome.
 */

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BlastRadiusSection from '../features/authorization/BlastRadiusSection';
import { blastRadius, type ActionLike } from '../features/authorization/blast-radius';

const ev = (kind: string, action: Record<string, unknown> = {}): ActionLike => ({
  action: { kind, ...action },
  tool_name: 't',
});

const renderFor = (e: ActionLike) => render(<BlastRadiusSection radius={blastRadius(e)} />);

/** Most actions echo several native fields, so readings are selected by field, not by testid. */
function reading(field: string): HTMLElement {
  const el = screen
    .getAllByTestId('native-reading')
    .find((n) => n.getAttribute('data-field') === field);
  if (el === undefined) throw new Error(`no native reading rendered for field "${field}"`);
  return el;
}

const MANGLED_EDITOR = 'openhands__tools__file_editor__definition__FileEditorAction-Output__1';

describe('derived and echoed values stay separable', () => {
  it('never gives one element both affordances', () => {
    renderFor(ev(MANGLED_EDITOR, { path: '/etc/hosts', command: 'str_replace' }));
    const targets = screen.getAllByTestId('blast-target');
    const readings = screen.getAllByTestId('native-reading');
    expect(targets.length).toBeGreaterThan(0);
    expect(readings.length).toBeGreaterThan(0);
    for (const t of targets) {
      for (const r of readings) {
        expect(t).not.toBe(r);
        // Nesting would defeat the separation just as effectively as sharing an element.
        expect(t.contains(r)).toBe(false);
        expect(r.contains(t)).toBe(false);
      }
    }
  });

  it('puts derived targets and echoed fields under different headings', () => {
    renderFor(ev(MANGLED_EDITOR, { path: '/etc/hosts', command: 'str_replace' }));
    const derivedHeading = screen.getByRole('heading', { level: 3 });
    const echoedHeading = screen.getByTestId('native-readings-heading');
    expect(derivedHeading.textContent).not.toBe(echoedHeading.textContent);
    // The echoed heading must disclaim analysis rather than merely differ by wording.
    expect(echoedHeading).toHaveTextContent(/shown exactly as received/i);
    // And no derived target may sit inside the echoed block.
    for (const t of screen.getAllByTestId('blast-target')) {
      expect(echoedHeading.parentElement?.contains(t)).toBe(false);
    }
  });

  it('emits no derived target at all for a no-projection tool', () => {
    // The strongest form of the rule: a shell command must never acquire the affordance that
    // means "we worked this out".
    renderFor(ev('TerminalAction', { command: 'rm -rf /tmp/x && curl evil.test' }));
    expect(screen.queryAllByTestId('blast-target')).toHaveLength(0);
    expect(screen.getByTestId('blast-radius')).toHaveAttribute('data-status', 'no-projection');
    expect(reading('command')).toHaveTextContent('rm -rf /tmp/x');
  });

  it('disclaims analysis on the no-projection branch too, not only the projected one', () => {
    // Found by mutation: the projected branch's disclaimer was asserted, this one was not, so the
    // heading over a raw `rm -rf` could have read "What this will touch" with every test green.
    renderFor(ev('TerminalAction', { command: 'rm -rf /' }));
    const echoedHeading = screen.getByTestId('native-readings-heading');
    expect(echoedHeading).toHaveTextContent(/shown exactly as received/i);
    expect(echoedHeading).toHaveTextContent(/not analysed/i);
    expect(echoedHeading).not.toHaveTextContent(/will touch/i);
  });

  it('does not let the no-projection heading claim a blast radius was computed', () => {
    renderFor(ev('TerminalAction', { command: 'ls' }));
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/^No blast radius was/i);
  });
});

describe('the four statuses are mutually distinguishable', () => {
  const cases: Array<[string, ActionLike]> = [
    ['projected', ev(MANGLED_EDITOR, { path: '/etc/hosts' })],
    ['no-projection', ev('TerminalAction', { command: 'ls' })],
    ['not-executable', { action: null, tool_name: 'finish' }],
    ['unknown-action', ev('openhands__x__y__QuantumAction-Output__1')],
  ];

  it('renders a distinct status and a distinct heading for each', () => {
    const seenStatus = new Set<string>();
    const seenHeading = new Set<string>();
    for (const [expected, event] of cases) {
      const { unmount } = renderFor(event);
      const status = screen.getByTestId('blast-radius').getAttribute('data-status');
      const heading = screen.getByRole('heading', { level: 3 }).textContent ?? '';
      expect(status).toBe(expected);
      seenStatus.add(status ?? '');
      seenHeading.add(heading);
      unmount();
    }
    expect(seenStatus.size).toBe(4);
    expect(seenHeading.size).toBe(4);
  });

  it('separates an empty projection from an uncomputed one', () => {
    // Both show zero targets. They are not the same claim, so they must not read the same.
    const { unmount } = renderFor(ev('EditAction', {}));
    expect(screen.queryAllByTestId('blast-target')).toHaveLength(0);
    const emptyText = screen.getByTestId('blast-empty').textContent ?? '';
    expect(emptyText).toMatch(/names no file or host/i);
    unmount();

    renderFor(ev('TerminalAction', { command: 'ls' }));
    expect(screen.queryByTestId('blast-empty')).toBeNull();
  });

  it('marks an unrecognised class as a gap in our coverage, not a safe action', () => {
    renderFor(ev('openhands__x__y__QuantumAction-Output__1'));
    const section = screen.getByTestId('blast-radius');
    expect(section).toHaveTextContent(/no recorded analysis for QuantumAction/i);
    expect(section).toHaveTextContent(/only description of what will happen/i);
    expect(screen.queryAllByTestId('blast-target')).toHaveLength(0);
  });
});

describe('projection content', () => {
  it('labels a host projection as a host and shows the whole URL as the native reading', () => {
    renderFor(ev('BrowserNavigateAction', { url: 'https://evil.test/a?b=c' }));
    const target = screen.getByTestId('blast-target');
    expect(target).toHaveAttribute('data-kind', 'host');
    expect(target).toHaveTextContent('evil.test');
    expect(target).not.toHaveTextContent('b=c');
    expect(reading('url')).toHaveTextContent('https://evil.test/a?b=c');
  });

  it('shows a glob root as a search root and never as a resolved file list', () => {
    renderFor(ev('GlobAction', { path: '/src', pattern: '**/*.ts' }));
    const target = screen.getByTestId('blast-target');
    expect(target).toHaveAttribute('data-kind', 'search-root');
    expect(target).toHaveTextContent('/src');
    expect(target).not.toHaveTextContent('*');
  });
});
