import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StaticServer } from './static-server';

const EXTENSION_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.output/chrome-mv3');

interface ExtensionFixtures {
  context: BrowserContext;
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
  context: async ({}, use) => {
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
        '--headless=new',
        '--no-sandbox',
      ],
    });
    await use(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    }
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
