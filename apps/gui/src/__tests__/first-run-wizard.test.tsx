// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import FirstRunWizard, { STEP_COUNT } from '../features/first-run/FirstRunWizard';
import './setup';

async function goToStep(n: number) {
  const user = userEvent.setup();
  render(<FirstRunWizard />);
  for (let i = 1; i < n; i++) await user.click(screen.getByRole('button', { name: 'Next' }));
  return user;
}

describe('first-run wizard (spec 3.4)', () => {
  it('has five steps - items 2 and 7 were removed by ADR-003', () => {
    expect(STEP_COUNT).toBe(5);
  });

  it('states the default stop AND justifies it, plus why NeverConfirm is opt-in (item 4)', async () => {
    await goToStep(3);
    expect(screen.getByText(/ConfirmRisky\(threshold=HIGH, confirm_unknown=True\)/)).toBeVisible();
    expect(screen.getByText(/NeverConfirm\(\)/)).toBeVisible();
    expect(screen.getByText(/opt-in only, and here is why/i)).toBeVisible();
    // The justification must be present, not just the name of the policy.
    expect(screen.getByText(/Why this and not stricter/i)).toBeVisible();
  });

  it('seeds the lines-accepted counter at zero with an explanation (item 5)', async () => {
    await goToStep(4);
    expect(screen.getByTestId('lines-accepted-counter')).toHaveTextContent('0');
    expect(screen.getByText(/without opening the diff/i)).toBeVisible();
  });

  it('labels the plan tree as an example (item 6)', async () => {
    await goToStep(5);
    expect(screen.getByText('Example')).toBeVisible();
    expect(screen.getByText(/No plan has been generated/i)).toBeVisible();
  });

  it('renders the stop table from the predicate, not from static copy (item 3)', async () => {
    await goToStep(2);
    // Cells must agree with shouldConfirm(), which trust-dial.test.ts pins to the spec.
    expect(screen.getByTestId('cell-ask-risky-LOW-in')).toHaveTextContent('Proceeds');
    expect(screen.getByTestId('cell-ask-risky-HIGH-in')).toHaveTextContent('Pauses for you');
    expect(screen.getByTestId('cell-never-HIGH-in')).toHaveTextContent('Proceeds');
    expect(screen.getByTestId('cell-ask-always-LOW-in')).toHaveTextContent('Pauses for you');
    // The out-of-worktree stop must visibly differ from ask-risky on the same action.
    expect(screen.getByTestId('cell-ask-risky-LOW-out')).toHaveTextContent('Proceeds');
    expect(screen.getByTestId('cell-ask-outside-worktree-LOW-out')).toHaveTextContent(
      'Pauses for you',
    );
  });

  it('does not claim the deferred pieces are working', async () => {
    render(<FirstRunWizard />);
    expect(screen.getByText(/Not active yet/)).toBeVisible();
  });

  it('Back is disabled on the first step', () => {
    render(<FirstRunWizard />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });
});
