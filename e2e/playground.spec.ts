import { test, expect } from './fixtures/extension';

/**
 * The seeded Playground script (src/lib/playground/seed-script.ts) is the
 * single richest, most deterministic target in the extension: every field
 * type, a conditional wait, builtin generators with non-default options, and
 * a custom generator with its own options schema — all wired to a bundled
 * demo form with no external site involved. This is the fill pipeline's
 * fullest end-to-end exercise.
 */
test('running the seeded script fills every field correctly', async ({ openPlayground, pageErrors }) => {
  const playground = await openPlayground();

  await playground.getByRole('button', { name: 'Run on this form' }).click();
  await expect(playground.locator('text=Run results')).toBeVisible();

  // Every one of the 26 mapped fields must report "filled" — a single
  // "not-found"/"error" here means a selector or a generator broke.
  const results = playground.locator('.space-y-1.rounded-xl.border >> div', { hasText: /—\s+(filled|not-found|error)/ });
  await expect(results).toHaveCount(26);
  await expect(playground.locator('text=/—\\s+(not-found|error)/')).toHaveCount(0);

  // Spot-check actual DOM values, not just the "filled" status — a field
  // can report "filled" while still holding the wrong value if a generator
  // regresses (e.g. an option stops being respected).
  await expect(playground.locator('#pg-first-name')).not.toHaveValue('');
  await expect(playground.locator('#pg-email')).toHaveValue(/@/);

  // The referral-code field starts disabled and only a correct `waitFor`
  // step unlocks it before the custom generator (which reads fields.email)
  // runs — if the wait didn't work, this field would still be empty/disabled.
  await expect(playground.locator('#pg-referral-code')).toBeEnabled();
  await expect(playground.locator('#pg-referral-code')).toHaveValue(/^REF-/);

  // Password: seeded with { length: 14, symbols: false } — confirms the
  // builtin "password" generator's options are actually honored, not just
  // that *a* password came out.
  const password = await playground.locator('#pg-password').inputValue();
  expect(password).toHaveLength(14);
  expect(password).toMatch(/^[A-Za-z0-9]+$/);

  // Confirm-password is a custom generator reading `fields.password` — this
  // is the cross-field `fields.*` mechanism, not just "generators run".
  await expect(playground.locator('#pg-confirm-password')).toHaveValue(password);

  // Username: a custom generator with its own optionsSchema, seeded with
  // { prefix: "guest", digits: 6 } — confirms custom-generator options
  // actually reach the generator's `options` argument.
  await expect(playground.locator('#pg-username')).toHaveValue(/^guest_\d{6}$/);

  // Credit card number: builtin generator seeded with { formatted: true }.
  await expect(playground.locator('#pg-card-number')).toHaveValue(/^\d{4} \d{4} \d{4} \d{2,4}$/);

  expect(pageErrors).toEqual([]);
});

test('generator preview reflects live-edited options', async ({ openPlayground }) => {
  const playground = await openPlayground();
  // The demo form (left panel) is up as soon as the page is "ready", but the
  // seeded script's field cards (right panel) load asynchronously from
  // storage — wait for that explicitly instead of racing it.
  await expect(playground.locator('text=Fields (26)')).toBeVisible();

  // The field label is a Svelte `value={...}` binding, which sets the input
  // element's live `.value` property, not its `value=""` HTML attribute —
  // so a `[value=...]` CSS selector can't find it. Read the real property
  // in-page instead, the same way a user (or the app itself) would.
  const ageCardId = await playground.evaluate(() => {
    const card = [...document.querySelectorAll('div[id^="field-"]')].find(
      (el) => el.querySelector('input')?.value === 'Age',
    );
    return card?.id ?? null;
  });
  expect(ageCardId, 'Age field card should exist in the seeded script').not.toBeNull();
  const ageCard = playground.locator(`#${ageCardId}`);

  const maxInput = ageCard.locator('input[type="number"]').last();
  await maxInput.fill('19');
  await maxInput.dispatchEvent('change');

  await ageCard.getByRole('button', { name: 'Preview value' }).click();
  const preview = ageCard.locator('span.font-mono').first();
  await expect(preview).toBeVisible();
  const value = Number(await preview.textContent());
  expect(value).toBeGreaterThanOrEqual(18);
  expect(value).toBeLessThanOrEqual(19);
});
