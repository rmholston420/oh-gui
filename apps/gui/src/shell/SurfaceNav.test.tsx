// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SurfaceNav from './SurfaceNav';

describe('SurfaceNav', () => {
  it('marks the current surface as the current page, not as a pressed button', () => {
    render(<SurfaceNav current="plugins" onSelect={() => {}} />);
    const plugins = screen.getByRole('button', { name: 'Plugins' });
    expect(plugins).toHaveAttribute('aria-current', 'page');
    expect(plugins).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('button', { name: 'Run' })).not.toHaveAttribute('aria-current');
  });

  it('reports the chosen surface', async () => {
    const onSelect = vi.fn();
    render(<SurfaceNav current="run" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plugins' }));
    expect(onSelect).toHaveBeenCalledWith('plugins');
  });

  it('files Plugins under Settings, because REQ-03-007 does not name it as a peer of conversations', () => {
    render(<SurfaceNav current="run" onSelect={() => {}} />);
    const settings = screen.getByRole('heading', { name: 'Settings' });
    const group = settings.parentElement;
    expect(group).not.toBeNull();
    expect(group!.querySelector('[title="Plugins the agent-server discovered"]')).not.toBeNull();
  });

  it('advertises only surfaces that exist', () => {
    render(<SurfaceNav current="run" onSelect={() => {}} />);
    // A rail row per unbuilt spec item would be a to-do list posing as navigation. This count is
    // deliberately exact: it fails when a surface is added, forcing the question of whether the
    // new entry is backed by something built.
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /worktree|automation|plan tree/i })).toBeNull();
  });
});
