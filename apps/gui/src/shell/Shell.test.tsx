// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { LENS_STORAGE_KEY } from '../features/lens/useLens';
import { Shell } from './Shell';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => {
  window.localStorage.clear();
  setViewportWidth(1280);
});

describe('Shell lens control', () => {
  it('uses one binary toggle and switches its actual DOM layout from Vibe to Pro', async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    render(
      <Shell
        leftRail={<p>Rail content</p>}
        rightColumn={<p>Conversation content</p>}
        commandBarContent={<span>Global command context</span>}
      >
        <p>Shared run surface</p>
      </Shell>,
    );

    expect(screen.getByText('Shared run surface')).toBeVisible();
    expect(screen.queryByLabelText('Navigation')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Conversation')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Switch to Pro lens' }));

    expect(screen.getByTestId('shell-root')).toHaveAttribute('data-lens', 'pro');
    expect(screen.getByLabelText('Navigation')).toBeInTheDocument();
    expect(screen.getByLabelText('Conversation')).toBeInTheDocument();
    expect(screen.getByText('Global command context')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Switch to Vibe lens' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(window.localStorage.getItem(LENS_STORAGE_KEY)).toBe('pro');
  });

  it('keeps the shared center model mounted and its DOM state intact when the lens changes', async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    let mounts = 0;

    function SharedDataSurface() {
      mounts += 1;
      return <input aria-label="Goal" defaultValue="keep this shared model" />;
    }

    render(
      <Shell rightColumn={<p>Conversation content</p>}>
        <SharedDataSurface />
      </Shell>,
    );

    const goal = screen.getByLabelText('Goal');
    await user.clear(goal);
    await user.type(goal, 'Do not refetch');
    await user.click(screen.getByRole('button', { name: 'Switch to Pro lens' }));

    expect(screen.getByLabelText('Goal')).toHaveValue('Do not refetch');
    expect(mounts).toBe(1);
  });
});

describe('Shell rail control', () => {
  it('collapses and expands the actual navigation content', async () => {
    setViewportWidth(1700);
    const user = userEvent.setup();
    render(
      <Shell lens="pro" leftRail={<p>Rail content</p>}>
        <p>Shared run surface</p>
      </Shell>,
    );

    const railContent = screen.getByText('Rail content');
    const railContentWrapper = railContent.parentElement;
    expect(railContentWrapper).not.toHaveAttribute('hidden');

    await user.click(screen.getByRole('button', { name: 'Collapse navigation' }));
    expect(railContentWrapper).toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Expand navigation' }));
    expect(railContentWrapper).not.toHaveAttribute('hidden');
  });
});

describe('Shell viewport gate', () => {
  it('passes a fail-closed boolean to the real render consumer at 899px and unlocks at 900px', async () => {
    setViewportWidth(899);
    render(
      <Shell>
        {({ isReadOnlyViewport }) => (
          <button type="button" disabled={isReadOnlyViewport}>
            Approve
          </button>
        )}
      </Shell>,
    );

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/read-only below 900px/i);

    await act(async () => {
      setViewportWidth(900);
    });

    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
