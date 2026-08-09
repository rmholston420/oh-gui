import AuthorizationCard, {
  type PendingAction,
} from './features/authorization/AuthorizationCard';
import FirstRunWizard from './features/first-run/FirstRunWizard';
import RunView from './features/run/RunView';
import Shell from './shell/Shell';

/**
 * There is no router yet — the shell (docs/specs/03-layout.md section 3.1) is not built. Until it
 * is, `?surface=` selects which surface to mount so each can be driven headed in Playwright.
 *
 * This is a seam, not a design: when the real shell lands it replaces this outright. It is kept
 * honest by being trivial — no state, no history, no nesting — so there is nothing to migrate.
 */
/**
 * Demo actions for the headed run. Every command here is inert.
 *
 * This previously mounted a real `rm -rf ~/dev/oh-gui/node_modules && docker volume prune -f`.
 * Nothing executed it — but a destructive string sitting in a dev surface is one careless
 * copy-paste from being real, and `docker volume prune` in particular would have taken the ~122 GB
 * of volumes on Colossus that are permanently off-limits. The command below is long enough to
 * still overflow a 390px viewport, which is the only property the layout tests actually need.
 */
const DEMO_ACTIONS: Record<string, PendingAction> = {
  terminal: {
    toolName: 'execute_bash',
    command:
      'find ~/dev/oh-gui -type f -name "*.ts" -newer package.json -print | sort | head -n 50',
    securityRisk: 'HIGH',
    event: {
      tool_name: 'execute_bash',
      action: {
        kind: 'openhands__tools__terminal__definition__TerminalAction-Output__1',
        command:
          'find ~/dev/oh-gui -type f -name "*.ts" -newer package.json -print | sort | head -n 50',
        is_input: false,
        timeout: 30,
        reset: false,
      },
      // The agent's own account (spec 04 §4.2). Deliberately phrased the way a real model phrases
      // it: a confident, agreeable summary that says nothing about blast radius.
      summary: 'Looking for recently changed TypeScript files',
      thought: [{ type: 'text', text: 'I need to see which files changed after the last install so I can narrow the search.' }],
      reasoning_content:
        'The user asked what changed. `-newer package.json` is a cheap proxy for "since the last dependency change". Capping at 50 keeps the output readable.',
    },
  },
  edit: {
    toolName: 'str_replace_editor',
    command: 'str_replace /etc/hosts',
    securityRisk: 'MEDIUM',
    event: {
      tool_name: 'str_replace_editor',
      action: {
        kind: 'openhands__tools__file_editor__definition__FileEditorAction-Output__1',
        command: 'str_replace',
        path: '/etc/hosts',
      },
      summary: 'Adding a local hostname entry',
      // No `type` field — the shape canvas's filter silently dropped. It must still render.
      thought: [{ text: 'Mapping the dev domain to localhost so the app can be reached by name.' }],
    },
  },
  unknown: {
    toolName: 'quantum_tool',
    command: 'quantum_tool --entangle',
    securityRisk: null,
    event: {
      tool_name: 'quantum_tool',
      action: { kind: 'openhands__tools__quantum__definition__QuantumAction-Output__1' },
      thinking_blocks: [{ type: 'redacted_thinking', data: 'redacted-by-provider' }],
    },
  },
  none: {
    toolName: 'finish',
    command: 'finish',
    securityRisk: 'LOW',
    event: { tool_name: 'finish', action: null },
  },
};

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const surface = query.get('surface');

  // `?demo=1` preserves the inert pre-agent-server surfaces. Keep the older authorization query
  // working too: the existing headed checks use it to exercise the safety-card viewport boundary.
  if (query.get('demo') === '1' || surface === 'authorization') {
    if (surface !== 'authorization') return <FirstRunWizard />;
    // `?action=` picks which blast-radius outcome to mount, so the headed run can drive all four
    // rather than asserting three of them only in jsdom.
    const variant = query.get('action') ?? 'terminal';
    return (
      <main className="p-6">
        <AuthorizationCard action={DEMO_ACTIONS[variant] ?? DEMO_ACTIONS.terminal!} />
      </main>
    );
  }

  // The lens is presentation over one mounted surface (spec 03 §3.0). `RunView` is mounted once
  // and is not remounted, refetched, or re-routed when the lens toggles — that is the constraint,
  // not an optimisation.
  return (
    <Shell
      commandBarContent={<span className="font-mono text-xs text-slate-400">agent-server · 127.0.0.1:8000</span>}
    >
      <RunView />
    </Shell>
  );
}
