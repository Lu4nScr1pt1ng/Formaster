import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/extension';
import { field, flow, script, seed } from './fixtures/flow-builders';

/**
 * Completions inside a custom generator's code editor for the four objects
 * it gets in scope. Registered through the JavaScript language's own data
 * facet, so they sit alongside CodeMirror's built-in JS completions rather
 * than replacing them.
 */

const scriptWithGenerator = script({
  id: 's1',
  flowId: 'f1',
  name: 'Has a generator',
  customGenerators: [
    {
      id: 'g1',
      name: 'Ref code',
      code: '',
      optionsSchema: [{ key: 'prefix', type: 'select', label: 'Style', default: 'a', choices: [{ value: 'a', label: 'A' }] }],
    },
  ],
  steps: [
    field({ id: 'f-first', selector: 'first-name', label: 'First name', generator: { kind: 'fixed', value: 'Ada' }, saveAs: 'fullName' }),
    field({ id: 'f-mail', selector: 'email', label: 'Email address', generator: { kind: 'custom', generatorId: 'g1' } }),
  ],
});

async function openEditor(context: import('@playwright/test').BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html?script=s1`);
  await page.locator('text=Formaster').first().waitFor({ state: 'visible' });
  return page;
}

/** The generator's *code* editor — the card also holds a second CodeMirror for the options schema, below it. */
const codeArea = (page: Page) => page.locator('#generator-g1 .cm-content').first();

async function completionsFor(page: Page, typed: string): Promise<string[]> {
  await codeArea(page).click();
  await page.keyboard.type(typed);
  const list = page.locator('.cm-tooltip-autocomplete');
  await list.waitFor({ state: 'visible' });
  return list.locator('.cm-completionLabel').allInnerTexts();
}

test('helpers. offers every built-in generator', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [scriptWithGenerator] });
  const page = await openEditor(context, extensionId);

  const labels = await completionsFor(page, 'return helpers.cp');
  expect(labels).toContain('cpf()');
});

test('fields. offers the script own fields, keyed the way the filler keys them', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [scriptWithGenerator] });
  const page = await openEditor(context, extensionId);

  // "First name" is reachable as `fields.firstName` — the same camelCasing
  // `fieldContextKey` applies at fill time.
  const labels = await completionsFor(page, 'return fields.');
  expect(labels).toEqual(expect.arrayContaining(['firstName', 'emailAddress']));
});

test('flowVars. offers the flow keys, with their current value as the hint', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [scriptWithGenerator] });
  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.set({
      'formaster:flow-values:f1': { fullName: { value: 'Ada Lovelace', updatedAt: new Date().toISOString() } },
    });
  });
  const page = await openEditor(context, extensionId);

  await codeArea(page).click();
  await page.keyboard.type('return flowVars.');
  const list = page.locator('.cm-tooltip-autocomplete');
  await list.waitFor({ state: 'visible' });
  await expect(list.locator('.cm-completionLabel')).toHaveText(['fullName']);
  await expect(list.locator('.cm-completionDetail')).toHaveText(['Ada Lovelace']);
});

test('options. offers only the knobs this generator declares', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [scriptWithGenerator] });
  const page = await openEditor(context, extensionId);

  const labels = await completionsFor(page, 'return options.');
  expect(labels).toEqual(['prefix']);
});

test('picking a completion inserts it, and the generator still runs', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [scriptWithGenerator] });
  const page = await openEditor(context, extensionId);

  await codeArea(page).click();
  await page.keyboard.type('return fields.first');
  // Clicking the option rather than pressing Enter: under load the list can
  // be on screen a beat before it has settled on a selection, and the
  // keystroke then lands on nothing.
  await page.locator('.cm-tooltip-autocomplete li', { hasText: 'firstName' }).click();
  await expect(codeArea(page)).toHaveText('return fields.firstName');

  // The completed code is real code: previewing the field that uses this
  // generator resolves the earlier field and returns its value.
  await page.locator('#field-f-mail').getByRole('button', { name: 'Preview value' }).click();
  await expect(page.locator('#field-f-mail').locator('text=Ada')).toBeVisible();
});

test('built-in JavaScript completions still work alongside the custom ones', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [scriptWithGenerator] });
  const page = await openEditor(context, extensionId);

  // CodeMirror's JS support completes identifiers in scope (it has no type
  // information, so it can't offer `String` methods). Registering ours
  // through the language data facet rather than a second `autocompletion()`
  // is what keeps that working instead of replacing it.
  const labels = await completionsFor(page, 'const referralPrefix = "R"; return referral');
  expect(labels).toContain('referralPrefix');
});
