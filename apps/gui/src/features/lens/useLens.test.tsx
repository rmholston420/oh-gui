// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LENS, LENS_STORAGE_KEY, useLens } from './useLens';

function LensConsumer() {
  const { lens, setLens, toggleLens } = useLens();
  return (
    <section>
      <output aria-label="Current lens">{lens}</output>
      <button type="button" onClick={toggleLens}>
        Toggle lens
      </button>
      <button type="button" onClick={() => setLens('vibe')}>
        Use Vibe
      </button>
    </section>
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe('useLens', () => {
  it('defaults to Vibe and only toggles between the two permitted values', async () => {
    const user = userEvent.setup();
    render(<LensConsumer />);

    expect(screen.getByLabelText('Current lens')).toHaveTextContent(DEFAULT_LENS);
    await user.click(screen.getByRole('button', { name: 'Toggle lens' }));
    expect(screen.getByLabelText('Current lens')).toHaveTextContent('pro');
    await user.click(screen.getByRole('button', { name: 'Toggle lens' }));
    expect(screen.getByLabelText('Current lens')).toHaveTextContent('vibe');
  });

  it('reads a valid persisted selection and discards any non-binary value', () => {
    window.localStorage.setItem(LENS_STORAGE_KEY, 'pro');
    const { unmount } = render(<LensConsumer />);
    expect(screen.getByLabelText('Current lens')).toHaveTextContent('pro');
    unmount();

    window.localStorage.setItem(LENS_STORAGE_KEY, 'standard');
    render(<LensConsumer />);
    expect(screen.getByLabelText('Current lens')).toHaveTextContent('vibe');
  });

  it('persists a change made through its DOM consumer', async () => {
    const user = userEvent.setup();
    render(<LensConsumer />);

    await user.click(screen.getByRole('button', { name: 'Toggle lens' }));

    expect(window.localStorage.getItem(LENS_STORAGE_KEY)).toBe('pro');
  });
});
