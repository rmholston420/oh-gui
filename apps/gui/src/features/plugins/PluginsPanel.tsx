import { useCallback, useEffect, useState } from 'react';
import { agentServer, AgentServerRequestError } from '../../api/agentServer';
import type { PluginInfo } from '../../api/types';

/**
 * Read-only view of the plugins the agent-server can see.
 *
 * Read-only is the whole scope. Install, uninstall, and the marketplace all fetch remote code into
 * the agent's context, which is arbitrary code execution reached from a GUI button; that belongs
 * with the authorization posture, not beside a refresh icon. Enable/disable is deferred with it.
 */
export interface PluginsPanelProps {
  /** Container-side workspace path scanned for `.agents/plugins/`. */
  readonly projectDir?: string | null;
  /** Injected in tests. Defaults to the real client. */
  readonly listPlugins?: typeof agentServer.listPlugins;
}

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly plugins: readonly PluginInfo[] }
  | { readonly status: 'failed'; readonly message: string };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-slate-800 py-2 last:border-b-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 min-w-0 break-words font-mono text-sm text-slate-100">{children}</dd>
    </div>
  );
}

function PluginCard({ plugin }: { plugin: PluginInfo }) {
  const [showSkills, setShowSkills] = useState(false);
  const skillCount = plugin.skills.length;

  return (
    <li className="rounded-lg border border-slate-800 bg-slate-900/40 p-4" data-testid="plugin-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-slate-100">{plugin.name}</h3>
        <span className="font-mono text-xs text-slate-400">
          {plugin.version === '' ? 'no version declared' : `v${plugin.version}`}
        </span>
        <span className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
          {skillCount === 1 ? '1 skill' : `${skillCount} skills`}
        </span>
      </div>

      {plugin.description !== '' && (
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{plugin.description}</p>
      )}

      <dl className="mt-3">
        <Row label="Path">{plugin.path === '' ? 'unreported' : plugin.path}</Row>
        <Row label="Files">{plugin.files.length}</Row>
      </dl>

      {skillCount > 0 && (
        <>
          <button
            type="button"
            className="mt-3 text-xs font-medium text-sky-400 underline underline-offset-2"
            aria-expanded={showSkills}
            onClick={() => setShowSkills((open) => !open)}
          >
            {showSkills ? 'Hide skills' : `Show ${skillCount === 1 ? 'skill' : 'skills'}`}
          </button>
          {showSkills && (
            <ul className="mt-2 space-y-2" aria-label={`Skills in ${plugin.name}`}>
              {plugin.skills.map((skill) => (
                <li key={skill.name} className="border-l-2 border-slate-700 pl-3">
                  <p className="font-mono text-xs text-slate-200">{skill.name}</p>
                  {/* `description` is nullable upstream; an absent one is not an empty one. */}
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                    {skill.description ?? 'No description declared.'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

export default function PluginsPanel({ projectDir = null, listPlugins }: PluginsPanelProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const call = listPlugins ?? agentServer.listPlugins;

  const load = useCallback(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    call({ load_user: true, load_project: true, project_dir: projectDir })
      .then((response) => {
        if (!cancelled) setState({ status: 'loaded', plugins: response.plugins });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Say which call failed and why. A bare "failed to load" hides whether the agent-server is
        // down, the path is wrong, or the response did not parse.
        const message =
          error instanceof AgentServerRequestError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        setState({ status: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [call, projectDir]);

  useEffect(load, [load]);

  return (
    <section aria-label="Plugins" className="min-w-0">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Plugins</h2>
        <button
          type="button"
          className="text-xs font-medium text-sky-400 underline underline-offset-2"
          onClick={load}
        >
          Reload
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Discovered by the agent-server in the user and project plugin directories. Read-only.
      </p>

      {state.status === 'loading' && (
        <p role="status" className="mt-4 text-sm text-slate-400">
          Loading plugins…
        </p>
      )}

      {state.status === 'failed' && (
        <p role="alert" className="mt-4 rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
          Could not list plugins. {state.message}
        </p>
      )}

      {state.status === 'loaded' && state.plugins.length === 0 && (
        <p role="status" className="mt-4 text-sm text-slate-400">
          No plugins found. A project plugin lives at <code>.agents/plugins/&lt;name&gt;/</code> with
          its manifest at <code>.plugin/plugin.json</code>.
        </p>
      )}

      {state.status === 'loaded' && state.plugins.length > 0 && (
        <ul className="mt-4 space-y-3">
          {state.plugins.map((plugin) => (
            <PluginCard key={`${plugin.name}@${plugin.path}`} plugin={plugin} />
          ))}
        </ul>
      )}
    </section>
  );
}
