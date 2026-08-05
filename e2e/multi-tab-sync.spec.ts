import { test, expect } from './fixtures/extension';

/**
 * Regression coverage for a real bug: saveScript() only broadcast
 * scripts/refresh when called from background.ts's picker-finish flow — the
 * Playground's own auto-seed (and every other direct ScriptEditor "Save")
 * called the same storage function but never told any other already-open
 * Options tab about it. Reported as: "salvei o exemplo do playground e
 * quando volto [para a aba de options], não está exibindo novo script".
 * Fixed by moving the broadcast into saveScript()/deleteScript() themselves
 * (scripts-store.ts), so it fires regardless of which page called it.
 */
test('a script saved from the Playground shows up in an already-open options tab', async ({ openOptions, openPlayground }) => {
  const options = await openOptions();
  await expect(options.locator('text=No scripts yet.')).toBeVisible();

  // Opening the Playground auto-seeds its example script via saveScript() —
  // the exact code path that used to stay silent to other open tabs.
  const playground = await openPlayground();
  await expect(playground.locator('input[placeholder="Script name"]')).toHaveValue('Playground example');

  await options.bringToFront();
  // Scoped to the entries nested inside a Flow folder — the folder button
  // itself carries the same label for a single-script Flow.
  await expect(options.locator('nav [role="group"] button', { hasText: 'Playground example' })).toBeVisible();
});

/**
 * Regression coverage for a real bug: picking fields used to write a
 * "draft" to storage and rely on the options page's own onMount to notice
 * it — which only ever happened when a *brand new* options tab was created.
 * If an options tab was already open, `focusOrOpenOptions` just refocused
 * it without remounting it, so the draft silently sat in storage unread —
 * "it just redirects there without showing the new fields". Fixed by having
 * background.ts always save a real script up front and reuse the same
 * scripts/refresh broadcast the "existing script" flow already relied on,
 * regardless of whether an options tab happens to be open already.
 */
test('a fresh script (no prior script existed) shows up in an already-open options tab', async ({ context, openOptions, serviceWorker, staticServer }) => {
  // The options tab is open *before* picking starts — the exact precondition that broke.
  const options = await openOptions();
  const fixture = await context.newPage();
  const url = staticServer.url('stripe-style-checkout.html');
  await fixture.goto(url);

  await serviceWorker.evaluate(async (targetUrl) => {
    const [tab] = await chrome.tabs.query({ url: targetUrl });
    await chrome.tabs.sendMessage(tab.id!, { type: 'picker/start' });
  }, url);
  await fixture.waitForSelector('text=Click a field to map it');
  await fixture.locator('#email').click();
  await fixture.getByRole('button', { name: 'Finish' }).click();

  await options.bringToFront();
  await expect(options.locator('text=Fields (1)')).toBeVisible();

  // Not a second, duplicate options tab — the same one, live-updated.
  const pages = context.pages();
  const optionsTabs = pages.filter((page) => page.url().includes('options.html'));
  expect(optionsTabs).toHaveLength(1);
});

test('fields added to an existing script show up in an already-open second options tab', async ({
  context,
  staticServer,
  openOptions,
}) => {
  const fixture = await context.newPage();
  const url = staticServer.url('stripe-style-checkout.html');
  await fixture.goto(url);

  const firstOptionsTab = await openOptions();
  await firstOptionsTab.getByRole('button', { name: 'New' }).click();
  await firstOptionsTab.getByRole('button', { name: 'Add fields from page' }).click();
  await fixture.bringToFront();
  await expect(fixture.locator('text=Click a field to map it')).toBeVisible();
  await fixture.locator('#email').click();
  await fixture.getByRole('button', { name: 'Finish' }).click();
  await firstOptionsTab.bringToFront();
  await expect(firstOptionsTab.locator('text=Fields (1)')).toBeVisible();
  await firstOptionsTab.getByRole('button', { name: 'Save', exact: true }).click();

  // A *second* options tab is opened after the script already exists —
  // the scenario the bug report specifically called out.
  const secondOptionsTab = await context.newPage();
  await secondOptionsTab.goto(firstOptionsTab.url());
  await secondOptionsTab.locator('text=Formaster').first().waitFor();

  await firstOptionsTab.bringToFront();
  await firstOptionsTab.getByRole('button', { name: 'Add fields from page' }).click();
  await fixture.bringToFront();
  // The script already has 1 field, so re-entering the picker pre-marks it —
  // the toolbar reads "1 field mapped", not "Click a field to map it".
  await expect(fixture.locator('text=1 field mapped')).toBeVisible();
  await fixture.locator('#card-number').click();
  await fixture.getByRole('button', { name: 'Finish' }).click();

  // Both open options tabs hear the update — not just whichever one happened
  // to be focused.
  await expect(firstOptionsTab.locator('text=Fields (2)')).toBeVisible();
  await expect(secondOptionsTab.locator('text=Fields (2)')).toBeVisible();
});
