import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

/**
 * LIVE change review against the real Agent Server. Nothing is mocked.
 *
 * A fixture cannot prove the two things that actually matter here. First, `/api/changes` and
 * `/api/diff` spell their `path` parameter the same way but mean different things -- a repository
 * directory and a single file. Second, `/api/diff` returns whole file contents rather than a
 * unified diff, so the client's own diff is what the operator reads; if it is wrong, only a real
 * repository shows it.
 *
 * The repository is built inside the container because the agent-server resolves paths in its own
 * filesystem. A host path finds nothing.
 */

const AGENT_SERVER = 'http://127.0.0.1:8000';
const CONTAINER = 'ohg-verify';
const REPO_DIR = '/tmp/ohg-e2e-repo';

const T0 = Date.now();
function step(message: string): void {
  const seconds = ((Date.now() - T0) / 1000).toFixed(0).padStart(4);
  console.log(`\x1b[36m[${seconds}s]\x1b[0m ${message}`);
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 60_000 });
}

function inContainer(script: string): string {
  return docker('exec', '-u', '0', CONTAINER, 'sh', '-c', script);
}

test.describe('@live change review against agent-server', () => {
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

    // Fail with a sentence rather than a git error buried in a shell trace.
    const gitVersion = inContainer('git --version 2>&1 || true').trim();
    expect(
      gitVersion.startsWith('git version'),
      `git is not available inside ${CONTAINER}, so /api/changes cannot work: ${gitVersion}`,
    ).toBe(true);
    step(`container has ${gitVersion}`);

    step(`building a real repository at ${CONTAINER}:${REPO_DIR}`);
    // Committed first, then edited: `/api/changes` reports the working tree against HEAD, so a
    // repository with no commit reports nothing and the spec would pass vacuously.
    inContainer(
      [
        `rm -rf ${REPO_DIR}`,
        `mkdir -p ${REPO_DIR}`,
        `cd ${REPO_DIR}`,
        `git init -q`,
        `git config user.email e2e@localhost`,
        `git config user.name e2e`,
        `printf 'alpha\\nbravo\\ncharlie\\n' > kept.txt`,
        `printf 'one\\ntwo\\nthree\\n' > edited.txt`,
        `printf 'gone\\n' > removed.txt`,
        `git add -A`,
        `git commit -q -m base`,
        // The working-tree changes the panel must report.
        `printf 'one\\nTWO CHANGED\\nthree\\n' > edited.txt`,
        `printf 'brand new\\n' > added.txt`,
        `rm removed.txt`,
        `git add -A`,
      ].join(' && '),
    );
    step('repository built: 1 edited, 1 added, 1 removed, 1 untouched');
  });

  test.afterAll(() => {
    inContainer(`rm -rf ${REPO_DIR}`);
  });

  test('the server reports exactly the working-tree changes', async ({ request }) => {
    const response = await request.get(
      `${AGENT_SERVER}/api/changes?path=${encodeURIComponent(REPO_DIR)}`,
    );
    expect(response.ok(), `GET /api/changes -> HTTP ${response.status()}`).toBe(true);
    const changes = (await response.json()) as { status: string; path: string }[];
    const byPath = Object.fromEntries(changes.map((change) => [change.path, change.status]));
    step(`server reported: ${JSON.stringify(byPath)}`);

    expect(byPath['edited.txt']).toBe('UPDATED');
    expect(byPath['added.txt']).toBe('ADDED');
    expect(byPath['removed.txt']).toBe('DELETED');
    // The untouched file must be absent, not present-and-unchanged.
    expect(byPath['kept.txt']).toBeUndefined();
  });

  test('the diff endpoint returns whole files, which is why the client diffs them', async ({
    request,
  }) => {
    const response = await request.get(
      `${AGENT_SERVER}/api/diff?path=${encodeURIComponent(`${REPO_DIR}/edited.txt`)}`,
    );
    expect(response.ok(), `GET /api/diff -> HTTP ${response.status()}`).toBe(true);
    const diff = (await response.json()) as { original: string | null; modified: string | null };

    // Both sides complete, no `@@` hunk headers: the contract this feature is built on.
    expect(diff.original).toContain('two');
    expect(diff.modified).toContain('TWO CHANGED');
    expect(diff.original).not.toContain('@@');
    step('confirmed whole-file original and modified, not a unified diff');
  });

  test('the operator sees the changed files and the changed line', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('oh-gui:lens', 'pro'));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/?repoPath=${encodeURIComponent(REPO_DIR)}`);

    await page.getByRole('button', { name: 'Changes' }).click();
    step('opened change review from the navigation');

    const rows = page.getByTestId('change-row');
    await expect(rows).toHaveCount(3, { timeout: 15_000 });
    await expect(page.getByText('3 changed files')).toBeVisible();
    step('three changed files listed');

    const edited = rows.filter({ hasText: 'edited.txt' });
    await expect(edited.getByText('Updated')).toBeVisible();
    await edited.getByRole('button').click();

    // The payoff: a diff the server never computed, rendered from two whole files.
    await expect(edited.getByText('TWO CHANGED')).toBeVisible({ timeout: 15_000 });
    await expect(edited.getByText('+1')).toBeVisible();
    await expect(edited.getByText('−1')).toBeVisible();
    step('client-computed diff shows the changed line');

    // An added file has no original side; it must render as all-added, not as an error.
    const added = rows.filter({ hasText: 'added.txt' });
    await added.getByRole('button').click();
    await expect(added.getByText('brand new')).toBeVisible({ timeout: 15_000 });
    step('added file renders without an original side');
  });
});
