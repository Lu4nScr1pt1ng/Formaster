import { test, expect } from './fixtures/extension';

/**
 * Covers src/lib/picker/detect-generator.ts through its two real entry
 * points: the picker pre-selecting a generator when a field is mapped, and
 * the right-click "Fill this field" context-menu action filling a single
 * field on the spot. Neither a real toolbar popup nor a real native OS
 * context menu is something Playwright can drive (see
 * playwright.config.ts) — the context-menu tests below dispatch a real
 * `contextmenu` DOM event (so content.ts's own listener records the target,
 * exactly as it would from a real right-click) and then send the message
 * the menu item's `onClicked` handler would send, which exercises
 * everything past the native menu itself.
 */
test('picking a field auto-suggests its generator from id/name/placeholder', async ({
  context,
  staticServer,
  openOptions,
}) => {
  const fixture = await context.newPage();
  await fixture.goto(staticServer.url('stripe-style-checkout.html'));

  const options = await openOptions();
  await options.getByRole('button', { name: 'New' }).click();
  await options.getByRole('button', { name: 'Add fields from page' }).click();

  await fixture.bringToFront();
  await expect(fixture.locator('text=Click a field to map it')).toBeVisible();
  await fixture.locator('#email').click();
  // The label is "ZIP / postal code" — contains "zip", which should resolve
  // to the postal-code generator with a US locale, not just any match.
  await fixture.locator('#postal-code').click();
  await fixture.getByRole('button', { name: 'Finish' }).click();

  await options.bringToFront();
  await expect(options.locator('text=Fields (2)')).toBeVisible();

  // The field-label input's value is a Svelte `value={...}` binding — a
  // live DOM property, not an HTML attribute — so it has to be read via a
  // real property lookup, not a `[value=...]` CSS selector (see
  // playground.spec.ts for the same gotcha).
  async function cardByLabel(label: string) {
    const cardId = await options.evaluate((wantedLabel) => {
      const card = [...document.querySelectorAll('div[id^="field-"]')].find(
        (el) => el.querySelector('input')?.value === wantedLabel,
      );
      return card?.id ?? null;
    }, label);
    expect(cardId, `field card labeled "${label}" should exist`).not.toBeNull();
    return options.locator(`#${cardId}`);
  }

  // Scoped to the generator-id dropdown specifically (aria-label="Built-in
  // generator") — the field-type dropdown right next to it can coincidentally
  // contain the same substring (e.g. a native `type="email"` input shows
  // "EMAIL" there too), so a plain text search across the whole card would
  // match either one.
  const emailCard = await cardByLabel('Email');
  await expect(emailCard.locator('button[aria-label="Built-in generator"]')).toHaveText('Email');

  const zipCard = await cardByLabel('ZIP / postal code');
  await expect(zipCard.locator('button[aria-label="Built-in generator"]')).toHaveText('Postal code');
  await expect(zipCard.locator('button[aria-label="Country"]')).toHaveText('United States');
});

test('right-click "Fill this field" fills a recognized field on the spot', async ({ context, serviceWorker, staticServer }) => {
  const page = await context.newPage();
  const url = staticServer.url('stripe-style-checkout.html');
  await page.goto(url);

  await page.locator('#email').dispatchEvent('contextmenu');
  await serviceWorker.evaluate(async (targetUrl) => {
    const [tab] = await chrome.tabs.query({ url: targetUrl });
    await chrome.tabs.sendMessage(tab.id!, { type: 'contextmenu/fill-field' });
  }, url);

  await expect(page.locator('#email')).toHaveValue(/^[^@]+@[^@]+\.[^@]+$/);
});

test('right-click "Fill this field" reports unrecognized fields instead of guessing', async ({ context, serviceWorker, staticServer }) => {
  const page = await context.newPage();
  const url = staticServer.url('stripe-style-checkout.html');
  await page.goto(url);

  // A field injected on the fly, deliberately with no id/name/placeholder/
  // label/autocomplete — every real field on this fixture now resolves to
  // something (the country combobox included, since Formaster learned to
  // detect country/país fields), so this is the one guaranteed-blank target
  // left for asserting the "nothing matched" fallback.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'blank-signal-field';
    document.body.appendChild(input);
  });
  await page.locator('#blank-signal-field').dispatchEvent('contextmenu');
  await serviceWorker.evaluate(async (targetUrl) => {
    const [tab] = await chrome.tabs.query({ url: targetUrl });
    await chrome.tabs.sendMessage(tab.id!, { type: 'contextmenu/fill-field' });
  }, url);

  const toastText = await page.evaluate(() => {
    const host = document.getElementById('formaster-quick-toast-root');
    return host?.shadowRoot?.querySelector('.pill')?.textContent ?? null;
  });
  expect(toastText).toBe('Input type not identified');
  await expect(page.locator('#blank-signal-field')).toHaveValue('');
});

test('right-click "Fill this field" recognizes a country combobox from its label', async ({ context, serviceWorker, staticServer }) => {
  const page = await context.newPage();
  const url = staticServer.url('stripe-style-checkout.html');
  await page.goto(url);

  await page.locator('#country-search').dispatchEvent('contextmenu');
  await serviceWorker.evaluate(async (targetUrl) => {
    const [tab] = await chrome.tabs.query({ url: targetUrl });
    await chrome.tabs.sendMessage(tab.id!, { type: 'contextmenu/fill-field' });
  }, url);

  // The field's own label ("Country or region") is English, so detection
  // pins the US locale — see detect-generator.ts's EN/PT country rule.
  await expect(page.locator('#country-search')).toHaveValue('United States');
});

/**
 * content.ts (the content script backing the two tests above) never runs on
 * chrome-extension:// pages, including the extension's own — the Playground
 * wires up the exact same context-menu-fill module itself
 * (src/lib/picker/context-menu-fill.ts) specifically so this still works on
 * its own demo form. This is the regression test for that.
 */
test('right-click "Fill this field" also works on the Playground\'s own demo form', async ({ context, extensionId, serviceWorker }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/playground.html`);
  await page.locator('text=Playground form').waitFor();

  await page.locator('#pg-first-name').dispatchEvent('contextmenu');
  await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'chrome-extension://*/playground.html*' });
    await chrome.tabs.sendMessage(tab.id!, { type: 'contextmenu/fill-field' });
  });

  await expect(page.locator('#pg-first-name')).not.toHaveValue('');
});
