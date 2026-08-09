// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PluginsPanel from './PluginsPanel';
import { AgentServerRequestError } from '../../api/agentServer';
import type { PluginInfo, PluginsResponse } from '../../api/types';

/** Shaped from a live `POST /api/plugins` against the pinned agent-server. */
const OH_GUI: PluginInfo = {
  name: 'oh-gui',
  version: '0.1.0',
  description: "OH-GUI's agent-side footprint.",
  path: '/tmp/proj/.agents/plugins/oh-gui',
  skills: [
    { name: 'git-workflow', description: 'Git workflow discipline.' },
    { name: 'planning', description: null },
  ],
  files: ['.plugin/plugin.json', 'commands/gates.md'],
};

function respond(plugins: readonly PluginInfo[]) {
  return vi.fn(async (): Promise<PluginsResponse> => ({ plugins }));
}

describe('PluginsPanel', () => {
  it('lists a discovered plugin with its version and skill count', async () => {
    render(<PluginsPanel listPlugins={respond([OH_GUI])} />);
    expect(await screen.findByText('oh-gui')).toBeInTheDocument();
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
    expect(screen.getByText('2 skills')).toBeInTheDocument();
  });

  it('scans both the user and project directories, forwarding the project dir', async () => {
    const listPlugins = respond([]);
    render(<PluginsPanel projectDir="/workspace" listPlugins={listPlugins} />);
    await waitFor(() => expect(listPlugins).toHaveBeenCalled());
    expect(listPlugins).toHaveBeenCalledWith({
      load_user: true,
      load_project: true,
      project_dir: '/workspace',
    });
  });

  it('keeps skills collapsed until asked, then names each one', async () => {
    render(<PluginsPanel listPlugins={respond([OH_GUI])} />);
    await screen.findByText('oh-gui');
    expect(screen.queryByText('git-workflow')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show skills' }));
    expect(screen.getByText('git-workflow')).toBeInTheDocument();
  });

  it('distinguishes a skill with no description from one with an empty description', async () => {
    render(<PluginsPanel listPlugins={respond([OH_GUI])} />);
    await screen.findByText('oh-gui');
    await userEvent.click(screen.getByRole('button', { name: 'Show skills' }));
    expect(screen.getByText('No description declared.')).toBeInTheDocument();
  });

  it('says which call failed rather than a bare failure', async () => {
    const listPlugins = vi.fn(async () => {
      throw new AgentServerRequestError('POST', '/plugins', 404, 'Not Found');
    });
    render(<PluginsPanel listPlugins={listPlugins} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('POST /plugins failed (404)');
    expect(alert).toHaveTextContent('Not Found');
  });

  it('tells the operator where a project plugin belongs when none are found', async () => {
    render(<PluginsPanel listPlugins={respond([])} />);
    expect(await screen.findByText(/No plugins found/)).toBeInTheDocument();
    expect(screen.getByText('.agents/plugins/<name>/')).toBeInTheDocument();
  });

  it('reloads on demand', async () => {
    const listPlugins = respond([OH_GUI]);
    render(<PluginsPanel listPlugins={listPlugins} />);
    await screen.findByText('oh-gui');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(listPlugins).toHaveBeenCalledTimes(2));
  });

  it('renders a plugin that declares no version without inventing one', async () => {
    render(<PluginsPanel listPlugins={respond([{ ...OH_GUI, version: '', skills: [] }])} />);
    expect(await screen.findByText('no version declared')).toBeInTheDocument();
    expect(screen.getByText('0 skills')).toBeInTheDocument();
  });
});
