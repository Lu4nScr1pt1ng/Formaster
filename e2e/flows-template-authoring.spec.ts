import { test, expect } from './fixtures/extension';
import { field, flow, pngTemplate, runOn, script, seed } from './fixtures/flow-builders';

/**
 * Authoring a File Template through the UI rather than seeding one into
 * storage: the "+ New template…" sentinel a file field offers when there are
 * no templates yet, the layer editor, the orphan-key warning, and — the part
 * that matters most — that a template built this way actually renders at
 * fill time.
 */

const FLOW = 'flow-author';

// A file field as the picker actually leaves it: detected as `file`, but with
// no template chosen yet — `generatorRefFromSuggestion` hands back an empty
// `fixed` generator, and FieldRow shows the template picker off `elementType`.
const fileScript = script({
  id: 's-file',
  flowId: FLOW,
  name: 'Uploads a document',
  steps: [field({ id: 'f-doc', selector: 'document', elementType: 'file', generator: { kind: 'fixed', value: '' } })],
});

const publisher = script({
  id: 's-pub',
  flowId: FLOW,
  name: 'Publishes a name',
  steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value: 'Ada' }, saveAs: 'name' })],
});

async function openOptionsAt(context: import('@playwright/test').BrowserContext, extensionId: string, scriptId: string) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html?script=${scriptId}`);
  await page.locator('text=Formaster').first().waitFor({ state: 'visible' });
  return page;
}

test('"+ New template…" opens the editor and assigns the saved template back to the field', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await seed(serviceWorker, { flows: [flow(FLOW, 'Flow')], scripts: [fileScript] });
  const options = await openOptionsAt(context, extensionId, 's-file');

  // A file field with no templates yet must not be a dead end — the picker
  // itself offers the way out.
  await options.getByRole('button', { name: 'File template' }).click();
  await expect(options.getByRole('option', { name: 'No templates yet' })).toBeVisible();
  await options.getByRole('option', { name: '+ New template…' }).click();

  await expect(options.locator('text=File template').first()).toBeVisible();
  await options.locator('input[placeholder="e.g. Valid document"]').fill('Proof');
  await options.getByRole('button', { name: 'Add layer' }).click();
  await options.locator('input[placeholder="Text, may include {{flowVariable}}"]').fill('Name: {{name}}');
  await options.getByRole('button', { name: 'Save template' }).click();

  // Saving returns to the field with the new template already selected —
  // otherwise the user would have to go find it in the dropdown themselves.
  await expect(options.getByRole('button', { name: 'File template' })).toHaveText(/Proof/);

  const stored = await serviceWorker.evaluate(async () => {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([key]) => key.startsWith('formaster:file-template:'))
      .map(([, value]) => value as { name: string; format: string; textLayers: unknown[] });
  });
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ name: 'Proof', format: 'png' });
  expect(stored[0].textLayers).toHaveLength(1);
});

test('a template authored through the UI really renders at fill time', async ({
  context,
  staticServer,
  extensionId,
  serviceWorker,
}) => {
  await seed(serviceWorker, { flows: [flow(FLOW, 'Flow')], scripts: [fileScript, publisher] });
  const options = await openOptionsAt(context, extensionId, 's-file');

  await options.getByRole('button', { name: 'File template' }).click();
  await options.getByRole('option', { name: '+ New template…' }).click();
  await options.locator('input[placeholder="e.g. Valid document"]').fill('Doc');
  await options.locator('input[placeholder="document.png"]').fill('doc-{{name}}.png');
  await options.getByRole('button', { name: 'Add layer' }).click();
  await options.locator('input[placeholder="Text, may include {{flowVariable}}"]').fill('Name: {{name}}');
  await options.getByRole('button', { name: 'Save template' }).click();
  await options.getByRole('button', { name: 'Save', exact: true }).click();

  const savedScript = await serviceWorker.evaluate(
    async () => (await chrome.storage.local.get('formaster:script:s-file'))['formaster:script:s-file'],
  );

  const page = await context.newPage();
  const urlA = staticServer.url('flow-page-a.html');
  await page.goto(urlA);
  await runOn(serviceWorker, publisher, urlA);

  const pageB = await context.newPage();
  const urlB = staticServer.url('flow-page-b.html');
  await pageB.goto(urlB);
  expect(await runOn(serviceWorker, savedScript as never, urlB)).toEqual([{ fieldId: 'f-doc', status: 'filled' }]);

  // Waits for the fixture's async decode rather than reading a report that
  // may not be written yet — see flows-file-generator.spec.ts.
  await expect(pageB.locator('#file-info')).not.toBeEmpty();
  const info = JSON.parse((await pageB.locator('#file-info').textContent()) || '{}');
  // The filename proves the `{{name}}` typed into the editor resolved
  // against the Flow, and the ink proves the layer was actually drawn.
  expect(info.name).toBe('doc-Ada.png');
  expect(info.inkPixels).toBeGreaterThan(100);
});

test('a layer referencing a key nobody publishes is flagged while authoring', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow(FLOW, 'Flow')], scripts: [fileScript, publisher] });
  const options = await openOptionsAt(context, extensionId, 's-file');

  await options.getByRole('button', { name: 'File template' }).click();
  await options.getByRole('option', { name: '+ New template…' }).click();
  await options.getByRole('button', { name: 'Add layer' }).click();
  const layerInput = options.locator('input[placeholder="Text, may include {{flowVariable}}"]');

  // `name` is published by the sibling script, so it's fine…
  await layerInput.fill('Name: {{name}}');
  await expect(options.locator('text=/No field currently saves/')).toHaveCount(0);

  // …while a typo isn't, and gets caught here rather than at fill time.
  await layerInput.fill('Name: {{namee}}');
  await expect(options.locator('text=/No field currently saves "namee"/')).toBeVisible();
});

test('editing an existing template from the field row updates what gets rendered', async ({
  context,
  staticServer,
  extensionId,
  serviceWorker,
}) => {
  await seed(serviceWorker, {
    flows: [flow(FLOW, 'Flow')],
    templates: [pngTemplate({ id: 'tpl', name: 'Original', layers: [{ source: { kind: 'literal', value: 'before' } }] })],
    scripts: [
      script({
        id: 's-file',
        flowId: FLOW,
        name: 'Uploads a document',
        steps: [field({ id: 'f-doc', selector: 'document', elementType: 'file', generator: { kind: 'file', templateId: 'tpl' } })],
      }),
      publisher,
    ],
  });

  const options = await openOptionsAt(context, extensionId, 's-file');
  await options.getByRole('button', { name: 'Edit template' }).click();
  await options.locator('input[placeholder="document.png"]').fill('renamed.png');
  await options.getByRole('button', { name: 'Save template' }).click();

  const page = await context.newPage();
  const url = staticServer.url('flow-page-b.html');
  await page.goto(url);
  const savedScript = await serviceWorker.evaluate(
    async () => (await chrome.storage.local.get('formaster:script:s-file'))['formaster:script:s-file'],
  );
  await runOn(serviceWorker, savedScript as never, url);

  await expect(page.locator('#file-info')).not.toBeEmpty();
  expect(JSON.parse((await page.locator('#file-info').textContent()) || '{}').name).toBe('renamed.png');
});
