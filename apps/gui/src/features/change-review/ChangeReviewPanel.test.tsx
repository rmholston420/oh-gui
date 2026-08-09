// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ChangeReviewPanel from './ChangeReviewPanel';
import type { GitChange, GitDiff } from '../../api/types';

const CHANGES: GitChange[] = [
  { status: 'UPDATED', path: 'src/app.ts' },
  { status: 'ADDED', path: 'src/new.ts' },
  { status: 'DELETED', path: 'src/old.ts' },
];

const DIFF: GitDiff = { original: 'a\nb\nc\n', modified: 'a\nB\nc\n' };

function renderPanel(overrides: Partial<Parameters<typeof ChangeReviewPanel>[0]> = {}) {
  const listGitChanges = vi.fn().mockResolvedValue(CHANGES);
  const getGitDiff = vi.fn().mockResolvedValue(DIFF);
  render(
    <ChangeReviewPanel
      repoPath="/workspace/project"
      listGitChanges={listGitChanges}
      getGitDiff={getGitDiff}
      {...overrides}
    />,
  );
  return { listGitChanges, getGitDiff };
}

describe('ChangeReviewPanel', () => {
  it('lists every changed file with a readable status word, not just a colour', async () => {
    renderPanel();
    expect(await screen.findByText('src/app.ts')).toBeInTheDocument();
    expect(screen.getAllByTestId('change-row')).toHaveLength(3);
    // Colour alone fails WCAG 1.4.1, so the status must survive as text.
    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('Deleted')).toBeInTheDocument();
  });

  it('asks for the repository path, and only for it, on mount', async () => {
    const { listGitChanges, getGitDiff } = renderPanel();
    expect(await screen.findByText('src/app.ts')).toBeInTheDocument();
    expect(listGitChanges).toHaveBeenCalledWith('/workspace/project');
    // Forty changed files must not mean forty diff requests nobody asked for.
    expect(getGitDiff).not.toHaveBeenCalled();
  });

  it('fetches a diff on first expand, joining the repo path to the relative file path', async () => {
    const { getGitDiff } = renderPanel();
    const row = (await screen.findAllByTestId('change-row'))[0];
    await userEvent.click(within(row).getByRole('button'));
    expect(getGitDiff).toHaveBeenCalledWith('/workspace/project/src/app.ts');
  });

  it('shows the changed line with a copyable sign and both line numbers', async () => {
    renderPanel();
    const row = (await screen.findAllByTestId('change-row'))[0];
    await userEvent.click(within(row).getByRole('button'));
    expect(await within(row).findByText('+1')).toBeInTheDocument();
    expect(within(row).getByText('−1')).toBeInTheDocument();
    expect(within(row).getByText('B')).toBeInTheDocument();
  });

  it('does not refetch the diff when the row is collapsed and reopened', async () => {
    const { getGitDiff } = renderPanel();
    const row = (await screen.findAllByTestId('change-row'))[0];
    const toggle = within(row).getByRole('button');
    await userEvent.click(toggle);
    expect(await within(row).findByText('B')).toBeInTheDocument();
    await userEvent.click(toggle);
    await userEvent.click(toggle);
    expect(getGitDiff).toHaveBeenCalledTimes(1);
  });

  it('does not claim a clean tree when the server cannot tell one from a non-repository', async () => {
    renderPanel({ listGitChanges: vi.fn().mockResolvedValue([]) });
    const empty = await screen.findByTestId('no-changes');
    expect(empty).toHaveTextContent(/not a git repository/i);
  });

  it('names the failing call instead of a bare error', async () => {
    renderPanel({ listGitChanges: vi.fn().mockRejectedValue(new Error('GET /changes failed (400): bad ref')) });
    expect(await screen.findByRole('alert')).toHaveTextContent('GET /changes failed (400): bad ref');
  });

  it('surfaces a diff failure on the row without destroying the list', async () => {
    renderPanel({ getGitDiff: vi.fn().mockRejectedValue(new Error('GET /diff failed (400): bad path')) });
    const row = (await screen.findAllByTestId('change-row'))[0];
    await userEvent.click(within(row).getByRole('button'));
    expect(await within(row).findByRole('alert')).toHaveTextContent('bad path');
    expect(screen.getAllByTestId('change-row')).toHaveLength(3);
  });

  it('asks for nothing when no repository is selected', async () => {
    const listGitChanges = vi.fn();
    render(<ChangeReviewPanel repoPath={null} listGitChanges={listGitChanges} />);
    expect(await screen.findByTestId('no-repo')).toBeInTheDocument();
    expect(listGitChanges).not.toHaveBeenCalled();
  });
});
