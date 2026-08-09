import AuthorizationCard, {
  type PendingAction,
} from './features/authorization/AuthorizationCard';
import FirstRunWizard from './features/first-run/FirstRunWizard';

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
    },
  },
  unknown: {
    toolName: 'quantum_tool',
    command: 'quantum_tool --entangle',
    securityRisk: null,
    event: {
      tool_name: 'quantum_tool',
      action: { kind: 'openhands__tools__quantum__definition__QuantumAction-Output__1' },
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
  const surface = new URLSearchParams(window.location.search).get('surface');

  if (surface === 'authorization') {
    // `?action=` picks which blast-radius outcome to mount, so the headed run can drive all four
    // rather than asserting three of them only in jsdom.
    const variant = new URLSearchParams(window.location.search).get('action') ?? 'terminal';
    return (
      <main className="p-6">
        <AuthorizationCard action={DEMO_ACTIONS[variant] ?? DEMO_ACTIONS.terminal!} />
      </main>
    );
  }

  return <FirstRunWizard />;
}
