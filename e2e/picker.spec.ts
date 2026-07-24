import { test, expect } from './fixtures/extension';

/**
 * Drives the picker through the real "Add fields from page" UI path (not a
 * shortcut message) against a real page — this exercises the full chain:
 * background's tab-matching/focusing, the content-script overlay, and the
 * options page picking the new field up live via the `scripts/refresh`
 * broadcast. That last part regressed once before (the listener was only
 * ever registered on a code path that a draft-originated tab never took),
 * so this also stands as a permanent regression test for that bug.
 *
 * There's no toolbar-popup-equivalent test here: Playwright can't drive a
 * real browser-action popup bubble, only pages it navigates itself (see
 * playwright.config.ts's header comment) — "Add fields from page" is a
 * normal in-page button, so it doesn't run into that limitation.
 */
test('mapping, toggling, and native-select safety all work end to end', async ({
  context,
  staticServer,
  openOptions,
  pageErrors,
}) => {
  const fixture = await context.newPage();
  fixture.on('pageerror', (error) => pageErrors.push(error));
  await fixture.goto(staticServer.url('stripe-style-checkout.html'));

  const options = await openOptions();
  await options.getByRole('button', { name: 'New' }).click();
  await options.getByRole('button', { name: 'Add fields from page' }).click();

  // Clicking "Add fields from page" saves the draft and focuses the
  // matching tab (the fixture page) for picking — wait for that hand-off
  // rather than assuming it already happened.
  await fixture.bringToFront();
  await expect(fixture.locator('text=Click a field to map it')).toBeVisible();

  await fixture.locator('#email').click();
  await fixture.locator('#card-number').click();
  await expect(fixture.locator('text=2 fields mapped')).toBeVisible();

  // Click it again: this must unmap it, not add a duplicate — a mapped
  // element can never be picked twice.
  await fixture.locator('#card-number').click();
  await expect(fixture.locator('text=1 field mapped')).toBeVisible();

  // The "Country" combobox is a plain div (no native picker to guard
  // against), included here as a real custom-widget mapping target rather
  // than only ever testing plain <input>s.
  await fixture.locator('#country-combobox').click();
  await expect(fixture.locator('text=2 fields mapped')).toBeVisible();

  // The value must not have changed underneath the click — proves the
  // click was consumed by the picker's own handler, not passed through to
  // whatever the element would normally do.
  await expect(fixture.locator('#email')).toHaveValue('');

  await fixture.getByRole('button', { name: 'Finish' }).click();

  // Finishing hands focus back to the options tab and appends the fields —
  // this exact "does the new field actually show up here" step is the
  // scripts/refresh regression mentioned above.
  await options.bringToFront();
  await expect(options.locator('text=Fields (2)')).toBeVisible();

  expect(pageErrors).toEqual([]);
});
