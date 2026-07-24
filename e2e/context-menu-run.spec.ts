import { test, expect } from './fixtures/extension';

/**
 * "Run script for this page" — the context-menu shortcut to running the
 * first saved script matching the current page, without opening the
 * toolbar popup (background.ts's `handleRunFirstMatchingScript`). A real
 * native context-menu click isn't something Playwright can drive at all —
 * `browser.contextMenus.onClicked`'s registered listener can't be invoked
 * from outside the browser's own UI (see playwright.config.ts) — so there's
 * no way to exercise the menu-item click itself or the small `scripts.find
 * (...matchesAnyPattern...)` lookup inside that handler in isolation.
 *
 * What *is* real and worth covering: the "no script found" feedback (the
 * one case that message actually exists for — a successful run needs none,
 * since it reuses the same fill/run + fill/result path the popup's Run
 * button already exercises), and that a script saved through the normal
 * picker flow — the same kind `handleRunFirstMatchingScript` would look up
 * and send — actually fills the page when run.
 */
test('a saved, page-matching script fills the page when run', async ({ context, staticServer, openOptions }) => {
  const fixture = await context.newPage();
  const url = staticServer.url('stripe-style-checkout.html');
  await fixture.goto(url);

  // A freshly-created script defaults to the `*://*/*` pattern, which
  // already matches this fixture — the same thing handleRunFirstMatchingScript
  // would find via matchesAnyPattern for this page.
  const options = await openOptions();
  await options.getByRole('button', { name: 'New' }).click();
  await options.getByRole('button', { name: 'Add fields from page' }).click();
  await fixture.bringToFront();
  await expect(fixture.locator('text=Click a field to map it')).toBeVisible();
  await fixture.locator('#email').click();
  await fixture.getByRole('button', { name: 'Finish' }).click();
  await options.bringToFront();
  await expect(options.locator('text=Fields (1)')).toBeVisible();
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(options.locator('text=/saved/i').first()).toBeVisible();

  await fixture.bringToFront();
  await expect(fixture.locator('#email')).toHaveValue('');

  // Read the saved script back from storage and send it the same way
  // handleRunFirstMatchingScript would — proves a script produced by the
  // normal picker flow actually works end to end when run this way, not
  // just a hand-built test fixture script.
  const serviceWorker = context.serviceWorkers()[0];
  await serviceWorker.evaluate(async (targetUrl) => {
    const stored = await chrome.storage.local.get('formaster:scripts');
    const scripts = stored['formaster:scripts'] as Array<{ urlPatterns: string[] }>;
    const script = scripts[scripts.length - 1];
    const [tab] = await chrome.tabs.query({ url: targetUrl });
    await chrome.tabs.sendMessage(tab.id!, { type: 'fill/run', script });
  }, url);

  await expect(fixture.locator('#email')).toHaveValue(/^[^@]+@[^@]+\.[^@]+$/);
});

test('reports when no script matches the page instead of doing nothing silently', async ({ context, staticServer }) => {
  const page = await context.newPage();
  const url = staticServer.url('conditional-address-form.html');
  await page.goto(url);

  const serviceWorker = context.serviceWorkers()[0];
  await serviceWorker.evaluate(async (targetUrl) => {
    const [tab] = await chrome.tabs.query({ url: targetUrl });
    await chrome.tabs.sendMessage(tab.id!, { type: 'contextmenu/no-script-found' });
  }, url);

  const toastText = await page.evaluate(() => {
    const host = document.getElementById('formaster-quick-toast-root');
    return host?.shadowRoot?.querySelector('.pill')?.textContent ?? null;
  });
  expect(toastText).toBe('No script for this page');
});
