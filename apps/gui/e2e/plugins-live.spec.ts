import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

/**
 * LIVE plugins panel against the real Agent Server. Nothing is mocked.
 *
 * This spec earns its keep by proving something a fixture cannot: that `POST /api/plugins` is the
 * endpoint that reports a project plugin at all. The obvious choice, `GET /plugins/installed`,
 * returns `{"plugins": []}` here — it reports only registry-managed installs performed through
 * `POST /plugins/install`, never a plugin discovered from `.agents/plugins/`. A mocked panel would
 * have passed against the wrong endpoint indefinitely.
 *
 * The repo's own `.agents/` is copied into the container so the agent-server can discover it: the
 * server resolves `project_dir` inside its own filesystem, so a host path would find nothing.
 */

const AGENT_SERVER = 'http://127.0.0.1:8000';
const CONTAINER = 'ohg-verify';
const PROJECT_DIR = '/tmp/ohg-e2e-proj';

const T0 = Date.now();
function step(message: string): void {
  const seconds = ((Date.now() - T0) / 1000).toFixed(0).padStart(4);
  console.log(`\x1b[36m[${seconds}s]\x1b[0m ${message}`);
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 60_000 });
}

test.describe('@live plugins panel against agent-server', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeAll(async ({ request }) => {
    let detail: string;
    let ready = false;
    try {
      const response = await request.get(`${AGENT_SERVER}/ready`, { timeout: 5_000 });
      ready = response.ok();
      detail = `GET /ready -> HTTP ${response.status()}`;
    } catch (error) {
      detail = `GET /ready -> ${error instanceof Error ? error.message : String(error)}`;
    }
    expect(
      ready,
      `agent-server is not ready at ${AGENT_SERVER} (${detail}).\n  docker start ${CONTAINER}\n`,
    ).toBe(true);

    step(`staging .agents into ${CONTAINER}:${PROJECT_DIR}`);
    // Two steps, not one: `docker cp` onto an existing directory path is refused by the snap
    // build's AppArmor profile with "Operation not permitted", and a plain `mv` into place fails
    // the same way. Copying to the final path directly is the form that works.
    docker('exec', CONTAINER, 'sh', '-c', `rm -rf ${PROJECT_DIR}; mkdir -p ${PROJECT_DIR}`);
    docker('cp', '../../.agents', `${CONTAINER}:${PROJECT_DIR}/.agents`);
    step('staged');
  });

  test.afterAll(() => {
    // `-u 0`: `docker cp` writes as root, and the agent-server container runs as a non-root user,
    // so an unprivileged `rm -rf` fails on every copied file. Without this the teardown error
    // masks the real test result.
    docker('exec', '-u', '0', CONTAINER, 'rm', '-rf', PROJECT_DIR);
  });

  test('reports the oh-gui plugin and every skill it bundles', async ({ page }) => {
    step('loading the plugins surface');
    await page.goto(`/?surface=plugins&projectDir=${encodeURIComponent(PROJECT_DIR)}`);

    const card = page.getByTestId('plugin-card').filter({ hasText: 'oh-gui' });
    await expect(card).toBeVisible({ timeout: 30_000 });
    step('plugin card rendered');

    // 22, not 18. The server reports `get_all_skills()`: the 18 skill directories on disk plus one
    // keyword-triggered skill synthesised per command, of which this plugin ships 4. This spec
    // originally asserted 18 and was wrong -- the live server was right.
    await expect(card.getByText(/^\d+ agent-visible skills$/)).toHaveText('22 agent-visible skills');
    await expect(card).toContainText('v0.1.0');

    await card.getByRole('button', { name: /^Show skills$/ }).click();
    const skills = card.getByRole('list', { name: 'Skills in oh-gui' }).getByRole('listitem');
    await expect(skills).toHaveCount(22);
    await expect(skills.filter({ hasText: 'oh-gui-repo-navigation' })).toHaveCount(1);
    step('all 22 agent-visible skills listed live');
  });

  test('the installed endpoint does not report a project plugin', async ({ request }) => {
    // Pins the reason this panel calls POST /plugins. If a future agent-server starts reporting
    // project plugins here, this fails and the panel should be reconsidered.
    const response = await request.get(`${AGENT_SERVER}/api/plugins/installed`);
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { plugins: unknown[] };
    expect(body.plugins.map((p) => (p as { name: string }).name)).not.toContain('oh-gui');
    step('confirmed /plugins/installed omits project plugins');
  });
});
