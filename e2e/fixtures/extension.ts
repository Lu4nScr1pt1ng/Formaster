import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StaticServer } from './static-server';

const EXTENSION_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.output/chrome-mv3');
const VIDEO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/videos');
const VIEWPORT = { width: 1280, height: 720 };

/**
 * Watching a run.
 *
 * These tests drive a real extension in a real browser, so the whole thing
 * is observable — it's just hidden behind `--headless=new` by default so a
 * full suite doesn't throw dozens of windows on screen. Opt in per run:
 *
 *   HEADED=1 SLOWMO=400 npx playwright test e2e/flows-multistep-wizard.spec.ts
 *     → a visible browser window, paced slowly enough to follow
 *
 *   VIDEO=1 npx playwright test e2e/flows-multistep-wizard.spec.ts
 *     → test-results/videos/*.webm, reviewable afterwards (works headless)
 *
 *   npx playwright test --ui
 *     → Playwright's own UI, with a time-travel trace per step
 */
const WATCHABLE = {
  headed: Boolean(process.env.HEADED),
  video: Boolean(process.env.VIDEO),
  slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : undefined,
};

interface ExtensionFixtures {
  context: BrowserContext;
  /**
   * The extension's MV3 background service worker.
   *
   * Always take it from here rather than reading `context.serviceWorkers()[0]`
   * in a test: at the moment a test starts, the worker may not have
   * registered yet, so that array can still be empty and the test blows up
   * on `undefined.evaluate(...)`. It's timing-dependent, so it only shows up
   * under load — as a cluster of unrelated-looking failures in one run.
   */
  serviceWorker: Worker;
  extensionId: string;
  /** Uncaught exceptions from any page opened via the helpers below, across the whole test. */
  pageErrors: Error[];
  openPopup(): Promise<Page>;
  openOptions(query?: string): Promise<Page>;
  openPlayground(): Promise<Page>;
  openDocs(): Promise<Page>;
}

interface WorkerFixtures {
  staticServer: StaticServer;
}

export const test = base.extend<ExtensionFixtures, WorkerFixtures>({
  // Worker-scoped: one static file server (for test-fixtures/*.html) shared
  // by every test in this worker — it's stateless, so reuse is free and
  // avoids a port bind per test.
  staticServer: [
    async ({}, use) => {
      const server = new StaticServer();
      await server.start();
      await use(server);
      await server.stop();
    },
    { scope: 'worker' },
  ],

  // Test-scoped: a brand-new, isolated browser profile per test. This is
  // the single most important thing for not-flaky extension tests — no two
  // tests ever share `browser.storage.local`, so test order and parallelism
  // can't leak state between them the way a shared/reused profile would.
  context: async ({}, use, testInfo) => {
    const userDataDir = await mkdtemp(path.join(tmpdir(), 'formaster-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // `headless: true` makes Playwright inject its own legacy headless
      // flag, which never starts an MV3 background service worker — no
      // service worker, no extension. The documented workaround is
      // `headless: false` (so Playwright stays out of the way) plus an
      // explicit `--headless=new` arg, which does support MV3 extensions.
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // HEADED=1 drops this flag so a real browser window opens and the
        // run can be watched. See the "Watching a run" note below.
        ...(WATCHABLE.headed ? [] : ['--headless=new']),
        '--no-sandbox',
      ],
      // SLOWMO=<ms> paces every action so a human can follow along; without
      // it a whole wizard walkthrough is over in under a second.
      slowMo: WATCHABLE.slowMo,
      viewport: VIEWPORT,
      // VIDEO=1 writes a .webm per test — the way to review a run after the
      // fact (or on a machine with no display) instead of watching it live.
      recordVideo: WATCHABLE.video ? { dir: VIDEO_DIR, size: VIEWPORT } : undefined,
    });
    await use(context);

    // Collected before `context.close()` — that's what finalises each
    // recording — then attached so the HTML report links them per test
    // instead of leaving a directory of hash-named .webm files to guess at.
    const videos = WATCHABLE.video ? context.pages().map((page) => page.video()) : [];
    await context.close();
    for (const [index, video] of videos.entries()) {
      if (!video) continue;
      await testInfo.attach(`video-${index + 1}`, { path: await video.path(), contentType: 'video/webm' });
    }

    await rm(userDataDir, { recursive: true, force: true });
  },

  serviceWorker: async ({ context }, use) => {
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    }
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  pageErrors: async ({}, use) => {
    const errors: Error[] = [];
    await use(errors);
  },

  openPopup: async ({ context, extensionId, pageErrors }, use) => {
    await use(() => openExtensionPage(context, extensionId, 'popup.html', pageErrors, 'text=Formaster'));
  },

  openOptions: async ({ context, extensionId, pageErrors }, use) => {
    await use((query?: string) =>
      openExtensionPage(context, extensionId, `options.html${query ?? ''}`, pageErrors, 'text=Formaster'),
    );
  },

  openPlayground: async ({ context, extensionId, pageErrors }, use) => {
    await use(() => openExtensionPage(context, extensionId, 'playground.html', pageErrors, 'text=Playground form'));
  },

  openDocs: async ({ context, extensionId, pageErrors }, use) => {
    await use(() => openExtensionPage(context, extensionId, 'docs.html', pageErrors, 'text=Scripting reference'));
  },
});

async function openExtensionPage(
  context: BrowserContext,
  extensionId: string,
  path: string,
  pageErrors: Error[],
  readySelector: string,
): Promise<Page> {
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto(`chrome-extension://${extensionId}/${path}`);
  // A committed navigation isn't a rendered app — Svelte still has to
  // mount, and popup/options both do an async onMount (storage reads)
  // before the real UI replaces the loading skeleton. Waiting on a piece of
  // text that only exists once that's done is what actually makes "the
  // page is ready" true, instead of racing it.
  await page.locator(readySelector).first().waitFor({ state: 'visible' });
  return page;
}

export { expect } from '@playwright/test';
