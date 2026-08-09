import { defineConfig, devices } from '@playwright/test';

const HOST = '127.0.0.1';
const PORT = 5173;
const URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  // `WATCH=1` is for the operator watching the browser, not for CI-style throughput. Headed runs
  // default to 8 parallel windows that each live under a second, which is a green tick, not a
  // demonstration. One worker plus slowMo makes the run legible in real time.
  workers: process.env.WATCH ? 1 : undefined,
  use: {
    baseURL: URL,
    trace: 'on-first-retry',
    launchOptions: { slowMo: process.env.WATCH ? Number(process.env.WATCH_MS ?? 600) : 0 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `--host 127.0.0.1` is load-bearing, not decoration. Vite's default host is `localhost`,
    // which on a dual-stack machine resolves to ::1 first, so Vite binds only the IPv6 loopback
    // while Playwright polls the IPv4 one and waits out its timeout. Binding explicitly to the
    // same literal address we poll removes the resolution order from the equation.
    command: `npm run dev -- --host ${HOST} --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: true,
    timeout: 60_000,
    // Without these, Playwright discards the dev server's output and a startup failure surfaces
    // only as "Timed out waiting 60000ms", with no reason. Vite's error is the whole diagnosis.
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
