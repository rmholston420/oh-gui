import { defineConfig, devices } from '@playwright/test';

const HOST = '127.0.0.1';
const PORT = 5173;
const URL = `http://${HOST}:${PORT}`;

// Watched runs are for a human to read in real time, so they get the whole screen and a slow step.
// Unwatched runs keep Playwright's defaults.
//
// The default is `--start-maximized` with `viewport: null` rather than a hardcoded size. A fixed
// height is a guess about the operator's monitor: guess high and the window is taller than the
// screen so the bottom of the page is simply unreachable, guess low and it is needlessly short.
// Maximizing asks the window manager instead, and `viewport: null` makes the page adopt the real
// window size rather than rendering a letterboxed 1280x720 inside it.
//
// Set WATCH_WIDTH and WATCH_HEIGHT to force an exact size — useful for reproducing a specific
// breakpoint, e.g. WATCH_WIDTH=1200 to sit in spec 03's three-region band.
const FIXED_WIDTH = process.env.WATCH_WIDTH ? Number(process.env.WATCH_WIDTH) : null;
const FIXED_HEIGHT = process.env.WATCH_HEIGHT ? Number(process.env.WATCH_HEIGHT) : null;
const HAS_FIXED_SIZE = FIXED_WIDTH !== null && FIXED_HEIGHT !== null;
/** Chrome's tab strip, omnibox and the automation banner sit above the viewport. */
const CHROME_UI_HEIGHT = 140;

const watchArgs = HAS_FIXED_SIZE
  ? [`--window-size=${FIXED_WIDTH},${FIXED_HEIGHT + CHROME_UI_HEIGHT}`]
  : ['--start-maximized'];

/**
 * Spec 03 puts the four-region Pro layout above 1600px. Watching at Playwright's default 1280 would
 * show the collapsed layout, so a headed run would be demonstrating the wrong thing.
 *
 * `viewport: null` (adopt the real maximized window) is mutually exclusive with the
 * `deviceScaleFactor` that `devices['Desktop Chrome']` carries — Playwright rejects the pair at
 * `browser.newContext` with "deviceScaleFactor option is not supported with null viewport". So the
 * key is deleted rather than overridden: passing `deviceScaleFactor: undefined` still counts as
 * present and still throws.
 */
function chromiumUse() {
  const base = { ...devices['Desktop Chrome'] };
  if (!process.env.WATCH) return base;
  if (HAS_FIXED_SIZE) return { ...base, viewport: { width: FIXED_WIDTH, height: FIXED_HEIGHT } };
  delete (base as { deviceScaleFactor?: number }).deviceScaleFactor;
  return { ...base, viewport: null };
}

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
      slowMo: process.env.WATCH ? Number(process.env.WATCH_MS ?? 1800) : 0,
      // The OS window and the page viewport are two different things in headed Chromium. Setting
      // only `viewport` leaves a small window with a letterboxed page inside it; setting only
      // `--window-size` leaves the page rendering at the default 1280x720 regardless of how large
      // the window is. Both are needed, and they are kept in step below.
      args: process.env.WATCH ? watchArgs : [],
    },
  },
  projects: [{ name: 'chromium', use: chromiumUse() }],
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
