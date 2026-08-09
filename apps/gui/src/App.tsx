import AuthorizationCard from './features/authorization/AuthorizationCard';
import FirstRunWizard from './features/first-run/FirstRunWizard';

/**
 * There is no router yet — the shell (docs/specs/03-layout.md section 3.1) is not built. Until it
 * is, `?surface=` selects which surface to mount so each can be driven headed in Playwright.
 *
 * This is a seam, not a design: when the real shell lands it replaces this outright. It is kept
 * honest by being trivial — no state, no history, no nesting — so there is nothing to migrate.
 */
export default function App() {
  const surface = new URLSearchParams(window.location.search).get('surface');

  if (surface === 'authorization') {
    return (
      <main className="p-6">
        <AuthorizationCard
          action={{
            toolName: 'execute_bash',
            // Long on purpose: at 390px a short command fits, and an overflow assertion that
            // cannot fail is decoration. This is the width the `pre` must actually handle.
            command:
              'rm -rf ~/dev/oh-gui/node_modules && docker volume prune -f && git clean -xfd ~/dev/oh-gui',
            securityRisk: 'HIGH',
          }}
        />
      </main>
    );
  }

  return <FirstRunWizard />;
}
