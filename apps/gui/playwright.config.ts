import { defineConfig, devices } from '@playwright/test';

const HOST = '127.0.0.1';
const PORT = 5173;
const URL = `http://${HOST}:${PORT}`;

// Watched runs are for a human to read in real time, so they get a large window and a slow
// step. Unwatched runs keep Playwright's defaults.
const WATCH_WIDTH = Number(process.env.WATCH_WIDTH ?? 1920);
const WATCH_HEIGHT = Number(process.env.WATCH_HEIGHT ?? 1080);
/** Chrome's tab strip, omnibox and the automation banner sit above the viewport. */
const CHROME_UI_HEIGHT = 140;

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
    launchOptions: {
      slowMo: process.env.WATCH ? Number(process.env.WATCH_MS ?? 1200) : 0,
      // The OS window and the page viewport are two different things in headed Chromium. Setting
      // only `viewport` leaves a small window with a letterboxed page inside it; setting only
      // `--window-size` leaves the page rendering at the default 1280x720 regardless of how large
      // the window is. Both are needed, and they are kept in step below.
      args: process.env.WATCH ? [`--window-size=${WATCH_WIDTH},${WATCH_HEIGHT + CHROME_UI_HEIGHT}`] : [],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Spec 03 puts the four-region Pro layout above 1600px. Watching at the default 1280 would
        // show the collapsed layout, so a headed run would be demonstrating the wrong thing.
        ...(process.env.WATCH ? { viewport: { width: WATCH_WIDTH, height: WATCH_HEIGHT } } : {}),
      },
    },
  ],
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
