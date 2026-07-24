import { test, expect } from './fixtures/extension';

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
test('a fresh script (no prior script existed) shows up in an already-open options tab', async ({
  context,
  staticServer,
  openOptions,
}) => {
  // The options tab is open *before* picking starts — the exact precondition that broke.
  const options = await openOptions();
  const fixture = await context.newPage();
  const url = staticServer.url('stripe-style-checkout.html');
  await fixture.goto(url);

  const serviceWorker = context.serviceWorkers()[0];
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
