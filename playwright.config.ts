import { defineConfig } from '@playwright/test';

/**
 * Playwright can only drive extensions inside a real (non-stealth) Chromium
 * persistent context — that's why every spec here launches its own via the
 * `extension` fixture (see e2e/fixtures/extension.ts) instead of using the
 * default `page`/`context` fixtures. There is deliberately no Firefox
 * project: Playwright doesn't support loading an unpacked WebExtension into
 * its Firefox build the way it does for Chromium, so Firefox-specific
 * behavior (see wxt.config.ts's `browser === 'firefox'` branches) isn't
 * covered by this suite and needs manual verification instead.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // A flaky retry is a bug wearing a disguise — force failures to be visible
  // and fixed instead of quietly re-run away.
  retries: 0,
  // Each test launches its own full browser process (a persistent context
  // with the extension loaded); keep this bounded so a full run doesn't try
  // to spin up a dozen Chromium instances at once on a small CI runner.
  workers: process.env.CI ? 2 : 4,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 'html' on CI too (not just local) so a failure produces a real,
  // uploadable report to look at instead of only CI's inline log.
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // A locator action (click/fill/...) with nothing to act on should fail
    // fast, not silently retry for the full test timeout — that's the
    // difference between "obviously broken, see it immediately" and a
    // mystery hang someone has to dig a trace out of later.
    actionTimeout: 10_000,
  },
});
