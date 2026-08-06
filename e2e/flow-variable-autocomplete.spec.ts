import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/extension';
import { field, flow, script, seed } from './fixtures/flow-builders';

/**
 * Flow-variable keys used to be typed from memory everywhere. Now the pure
 * key fields suggest, and the free-text fields that accept `{{key}}` offer
 * the list as soon as `{{` is typed.
 */

const publisher = script({
  id: 's-pub',
  flowId: 'f1',
  name: 'Publisher',
  steps: [
    field({ id: 'p1', selector: 'full-name', generator: { kind: 'fixed', value: 'Ada' }, saveAs: 'fullName' }),
    field({ id: 'p2', selector: 'email', generator: { kind: 'fixed', value: 'a@b.c' }, saveAs: 'emailAddress' }),
  ],
});

const consumer = script({
  id: 's-con',
  flowId: 'f1',
  name: 'Consumer',
  steps: [field({ id: 'c1', selector: 'greeting', generator: { kind: 'fixed', value: '' } })],
});

async function openOptionsAt(context: import('@playwright/test').BrowserContext, extensionId: string, query = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html${query}`);
  await page.locator('text=Formaster').first().waitFor({ state: 'visible' });
  return page;
}

const fixedValue = (page: Page) => page.locator('input[placeholder="Value, or {{flowVariable}}"]');

test('typing {{ in a fixed value offers the flow keys and completes the placeholder', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [publisher, consumer] });
  const options = await openOptionsAt(context, extensionId, '?script=s-con');

  await fixedValue(options).click();
  await fixedValue(options).fill('Hello ');
  await options.keyboard.type('{{');

  const list = options.getByRole('listbox', { name: 'Flow variables' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('option')).toHaveText(['emailAddress', 'fullName']);

  // Filters as you keep typing, then completes just the placeholder.
  await options.keyboard.type('full');
  await expect(list.getByRole('option')).toHaveText(['fullName']);
  await options.keyboard.press('Enter');

  await expect(fixedValue(options)).toHaveValue('Hello {{fullName}}');
  await expect(list).toHaveCount(0);
});

test('completing a placeholder mid-string keeps the text after the caret', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [publisher, consumer] });
  const options = await openOptionsAt(context, extensionId, '?script=s-con');

  await fixedValue(options).fill('start  end');
  // Put the caret between the two spaces, then open a placeholder there.
  await fixedValue(options).press('Home');
  for (let i = 0; i < 6; i++) await fixedValue(options).press('ArrowRight');
  await options.keyboard.type('{{');
  await options.getByRole('option', { name: 'fullName' }).click();

  await expect(fixedValue(options)).toHaveValue('start {{fullName}} end');
});

test('a complete placeholder does not re-open the list', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [publisher, consumer] });
  const options = await openOptionsAt(context, extensionId, '?script=s-con');

  // `fill` sets the whole value at once — the backscan finds the closing
  // braces, so there's no open placeholder to complete.
  await fixedValue(options).fill('Hi {{fullName}}');
  await expect(options.getByRole('listbox', { name: 'Flow variables' })).toHaveCount(0);
});

test('a key published only by a run is suggested even though no field declares it', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [consumer] });
  // A value left behind by an earlier run whose field has since been
  // removed — still readable, so still worth offering.
  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.set({
      'formaster:flow-values:f1': { leftoverKey: { value: 'x', updatedAt: new Date().toISOString() } },
    });
  });

  const options = await openOptionsAt(context, extensionId, '?script=s-con');
  await fixedValue(options).click();
  await options.keyboard.type('{{');
  await expect(options.getByRole('option', { name: 'leftoverKey' })).toBeVisible();
});

test('the publish key field suggests keys already used in the flow', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [publisher, consumer] });
  const options = await openOptionsAt(context, extensionId, '?script=s-con');

  await options.getByRole('button', { name: 'Save as flow variable' }).click();
  await options.getByRole('combobox', { name: 'Flow variable key' }).click();
  await expect(options.getByRole('option', { name: 'fullName' })).toBeVisible();
  await options.getByRole('option', { name: 'emailAddress' }).click();

  await expect(options.getByRole('combobox', { name: 'Flow variable key' })).toHaveValue('emailAddress');
});

test('an un-named publish key is flagged, and no longer makes the whole script unsavable', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [consumer] });
  const options = await openOptionsAt(context, extensionId, '?script=s-con');

  // Clicking the toggle starts the key empty, which the schema rejects.
  // That used to fail the entire save with a cryptic
  // `saveAsFlowVariable.key: Too small`; now the half-finished option is
  // simply dropped on the way out, and the row says why it isn't published.
  await options.getByRole('button', { name: 'Save as flow variable' }).click();
  await expect(options.locator("text=/Name it, or the script can't be saved/")).toBeVisible();

  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(options.locator('text=/"Consumer" saved/')).toBeVisible();
  await expect(options.locator('text=/Could not save/')).toHaveCount(0);
});

test('Escape closes the suggestion list inside the template editor without closing the modal', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  const fileScript = script({
    id: 's-file',
    flowId: 'f1',
    name: 'File script',
    steps: [field({ id: 'f-doc', selector: 'document', elementType: 'file', generator: { kind: 'fixed', value: '' } })],
  });
  await seed(serviceWorker, { flows: [flow('f1', 'Flow')], scripts: [publisher, fileScript] });
  const options = await openOptionsAt(context, extensionId, '?script=s-file');

  await options.getByRole('button', { name: 'File template' }).click();
  await options.getByRole('option', { name: '+ New template…' }).click();
  await options.getByRole('button', { name: 'Add layer' }).click();

  const layerText = options.locator('input[placeholder="Text, may include {{flowVariable}}"]');
  await layerText.click();
  await options.keyboard.type('{{');
  await expect(options.getByRole('listbox', { name: 'Flow variables' })).toBeVisible();

  // Escape is handled by the innermost open layer only — the popup goes,
  // the template editor stays.
  await options.keyboard.press('Escape');
  await expect(options.getByRole('listbox', { name: 'Flow variables' })).toHaveCount(0);
  await expect(options.getByRole('button', { name: 'Save template' })).toBeVisible();
});
