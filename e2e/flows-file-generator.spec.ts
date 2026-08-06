import { test, expect } from './fixtures/extension';
import { field, flow, pdfTemplate, pngTemplate, runOn, script, seed, storageKeys } from './fixtures/flow-builders';

/**
 * The motivating end-to-end case for this whole feature: page 1 asks for a
 * name, page 2 asks to upload a document with that same name printed on it.
 * These drive both real pages in sequence and assert on what actually
 * landed in `input.files[0]` — decoded by the fixture itself (see
 * flow-page-b.html), including a non-white pixel count, so "a file was
 * attached" can't be confused with "the text layer actually rendered".
 */

const FLOW = 'flow-doc';

async function openBothPages(
  context: import('@playwright/test').BrowserContext,
  staticServer: { url(name: string): string },
) {
  const urlA = staticServer.url('flow-page-a.html');
  const urlB = staticServer.url('flow-page-b.html');
  const pageA = await context.newPage();
  await pageA.goto(urlA);
  const pageB = await context.newPage();
  await pageB.goto(urlB);
  return { pageA, pageB, urlA, urlB };
}

/**
 * The fixture decodes the attachment asynchronously in its `change` handler,
 * so its report can land a tick after the fill's own result comes back —
 * read it straight away and this flakes under load. `clearFileInfo` before a
 * second run in the same test is the other half: without it, a stale report
 * from the first run would satisfy the wait and pass for the wrong reason.
 */
async function fileInfo(pageB: import('@playwright/test').Page) {
  await expect(pageB.locator('#file-info')).not.toBeEmpty();
  return JSON.parse((await pageB.locator('#file-info').textContent()) || '{}');
}

async function clearFileInfo(pageB: import('@playwright/test').Page): Promise<void> {
  await pageB.locator('#file-info').evaluate((el) => (el.textContent = ''));
}

const publishName = (value: string) =>
  script({
    id: 's-a',
    flowId: FLOW,
    name: 'Page A — name',
    steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value }, saveAs: 'fullName' })],
  });

const uploadDoc = (templateId: string) =>
  script({
    id: 's-b',
    flowId: FLOW,
    name: 'Page B — document',
    steps: [field({ id: 'f-doc', selector: 'document', elementType: 'file', generator: { kind: 'file', templateId } })],
  });

test('a PNG generated on page B carries the name published on page A', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  const template = pngTemplate({ id: 'tpl', layers: [{ source: { kind: 'flowVariable', key: 'fullName' } }] });
  await seed(serviceWorker, { flows: [flow(FLOW)], templates: [template] });

  await runOn(serviceWorker, publishName('Ada Lovelace'), urlA);
  expect(await runOn(serviceWorker, uploadDoc('tpl'), urlB)).toEqual([{ fieldId: 'f-doc', status: 'filled' }]);

  const info = await fileInfo(pageB);
  expect(info).toMatchObject({ attached: true, name: 'doc.png', type: 'image/png', width: 320, height: 120 });
  expect(info.inkPixels, 'the flow variable must actually be drawn, not resolve to blank').toBeGreaterThan(100);
});

test('a longer name produces visibly more ink, proving the value reaches the canvas', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  const template = pngTemplate({ id: 'tpl', layers: [{ source: { kind: 'flowVariable', key: 'fullName' } }] });
  await seed(serviceWorker, { flows: [flow(FLOW)], templates: [template] });

  await runOn(serviceWorker, publishName('Al'), urlA);
  await runOn(serviceWorker, uploadDoc('tpl'), urlB);
  const short = await fileInfo(pageB);

  await clearFileInfo(pageB);
  await runOn(serviceWorker, publishName('Ada Lovelace Byron'), urlA);
  await runOn(serviceWorker, uploadDoc('tpl'), urlB);
  const long = await fileInfo(pageB);

  // Same template, same canvas, only the flow variable differs — if the
  // variable were being ignored these two would be byte-identical.
  expect(long.inkPixels).toBeGreaterThan(short.inkPixels);
});

test('{{key}} in outputFilename resolves against the flow', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  const template = pngTemplate({
    id: 'tpl',
    layers: [{ source: { kind: 'literal', value: 'static' } }],
    outputFilename: 'doc-{{fullName}}.png',
  });
  await seed(serviceWorker, { flows: [flow(FLOW)], templates: [template] });

  await runOn(serviceWorker, publishName('ada'), urlA);
  await runOn(serviceWorker, uploadDoc('tpl'), urlB);

  expect((await fileInfo(pageB)).name).toBe('doc-ada.png');
});

test('a PDF template renders through the background worker and attaches', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  const template = pdfTemplate({ id: 'tpl-pdf', layers: [{ source: { kind: 'flowVariable', key: 'fullName' } }] });
  await seed(serviceWorker, { flows: [flow(FLOW)], templates: [template] });

  await runOn(serviceWorker, publishName('Ada Lovelace'), urlA);
  expect(await runOn(serviceWorker, uploadDoc('tpl-pdf'), urlB)).toEqual([{ fieldId: 'f-doc', status: 'filled' }]);

  const info = await fileInfo(pageB);
  expect(info).toMatchObject({ attached: true, name: 'doc.pdf', type: 'application/pdf' });
  // A real pdf-lib document, not an empty placeholder blob.
  expect(info.size).toBeGreaterThan(500);
});

test('a file field errors clearly when its flow variable was never published', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlB } = await openBothPages(context, staticServer);
  const template = pngTemplate({ id: 'tpl', layers: [{ source: { kind: 'flowVariable', key: 'fullName' } }] });
  await seed(serviceWorker, { flows: [flow(FLOW)], templates: [template] });

  const results = await runOn(serviceWorker, uploadDoc('tpl'), urlB);
  expect(results[0].status).toBe('error');
  expect(results[0].message).toContain('"fullName" is not set yet');

  // Nothing was attached — no `change` event ever fired, so the fixture
  // never wrote its report. A blank document would be far worse than this.
  expect(await pageB.locator('#file-info').textContent()).toBe('');
});

test('a file field pointing at a deleted template errors instead of hanging', async ({ context, serviceWorker, staticServer }) => {
  const { urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });

  const results = await runOn(serviceWorker, uploadDoc('tpl-that-never-existed'), urlB);
  expect(results[0].status).toBe('error');
  expect(results[0].message).toContain('File template not found');
});

test('the Flow variables panel refreshes on its own when a run finishes in another tab', async ({ context, extensionId, serviceWorker, staticServer }) => {
  const { urlA } = await openBothPages(context, staticServer);
  const template = pngTemplate({ id: 'tpl', layers: [{ source: { kind: 'flowVariable', key: 'fullName' } }] });
  await seed(serviceWorker, {
    flows: [flow(FLOW, 'Document flow')],
    templates: [template],
    scripts: [publishName('Ada Lovelace'), uploadDoc('tpl')],
  });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html?script=s-b`);
  await options.locator('text=Formaster').first().waitFor({ state: 'visible' });

  await options.getByRole('button', { name: /Flow variables/ }).click();
  // Declared by the sibling script but never run: the panel has to say so
  // rather than omit the key entirely.
  // The key now also appears as a chip in the collapsed summary row, so
  // scope to the expanded panel's own row.
  await expect(options.locator('text=fullName').first()).toBeVisible();
  await expect(options.locator('text=not filled yet')).toBeVisible();

  // Now run the publishing script against page A, in a completely
  // different tab, while this editor just sits there.
  await runOn(serviceWorker, publishName('Ada Lovelace'), urlA);

  // No reload, no re-selecting the script — the panel must pick it up from
  // the fill/result broadcast alone.
  await expect(options.locator('text=Ada Lovelace')).toBeVisible();
  await expect(options.locator('text=not filled yet')).toHaveCount(0);
});

test('the sidebar shows a multi-script Flow as a collapsible folder, and the editor links its siblings', async ({ context, extensionId, serviceWorker, staticServer }) => {
  const {  } = await openBothPages(context, staticServer);
  const template = pngTemplate({ id: 'tpl', layers: [{ source: { kind: 'flowVariable', key: 'fullName' } }] });
  await seed(serviceWorker, {
    flows: [flow(FLOW, 'Document flow')],
    templates: [template],
    scripts: [publishName('Ada Lovelace'), uploadDoc('tpl')],
  });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html?script=s-b`);
  await options.locator('text=Formaster').first().waitFor({ state: 'visible' });

  // The Flow is a folder holding both scripts, not a flat pair of entries.
  const folder = options.locator('nav button[aria-expanded]', { hasText: 'Document flow' });
  await expect(folder).toBeVisible();
  await expect(folder).toHaveAttribute('aria-expanded', 'true');
  await expect(options.locator('nav [role="group"] button', { hasText: 'Page A — name' })).toBeVisible();
  await expect(options.locator('nav [role="group"] button', { hasText: 'Page B — document' })).toBeVisible();

  // Collapsing it hides the scripts inside without touching the folder.
  await folder.click();
  await expect(folder).toHaveAttribute('aria-expanded', 'false');
  await expect(options.locator('nav [role="group"] button', { hasText: 'Page A — name' })).toHaveCount(0);
  await folder.click();
  await expect(options.locator('nav [role="group"] button', { hasText: 'Page A — name' })).toBeVisible();

  // The editor's "Pages:" row links the flow's other scripts — scoped to
  // that paragraph, since the sidebar entry carries the same text.
  const pagesRow = options.locator('p', { hasText: 'Pages:' });
  await expect(pagesRow.getByRole('button', { name: 'Page A — name' })).toBeVisible();
});

test('deleting the last script in a Flow deletes the Flow, but deleting one of two does not', async ({ context, extensionId, serviceWorker, staticServer }) => {
  const {  } = await openBothPages(context, staticServer);
  await seed(serviceWorker, {
    flows: [flow(FLOW, 'Document flow')],
    scripts: [publishName('Ada Lovelace'), uploadDoc('tpl')],
  });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html?script=s-b`);
  await options.locator('text=Formaster').first().waitFor({ state: 'visible' });

  expect(await storageKeys(serviceWorker, `formaster:flow:${FLOW}`)).toHaveLength(1);

  async function deleteSelectedScript() {
    await options.getByRole('button', { name: 'Delete' }).click();
    await options.getByRole('button', { name: 'Delete', exact: true }).last().click();
  }

  // First of two: the Flow is still in use, so it must survive.
  await deleteSelectedScript();
  await expect(options.locator('nav [role="group"] button', { hasText: 'Page B — document' })).toHaveCount(0);
  expect(await storageKeys(serviceWorker, `formaster:flow:${FLOW}`)).toHaveLength(1);

  // Last one out turns the lights off.
  await deleteSelectedScript();
  await expect(options.locator('nav [role="group"] button', { hasText: 'Page A — name' })).toHaveCount(0);
  expect(await storageKeys(serviceWorker, `formaster:flow:${FLOW}`)).toHaveLength(0);
});

test('a run in one Flow leaves another Flow\'s generated document untouched', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  const template = pngTemplate({ id: 'tpl', layers: [{ source: { kind: 'flowVariable', key: 'fullName' } }], outputFilename: '{{fullName}}.png' });
  await seed(serviceWorker, { flows: [flow(FLOW), flow('flow-b')], templates: [template] });

  await runOn(serviceWorker, publishName('main-flow'), urlA);
  // A second Flow publishes the *same key* with a different value…
  await runOn(
    serviceWorker,
    script({
      id: 's-other',
      flowId: 'flow-b',
      steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value: 'other-flow' }, saveAs: 'fullName' })],
    }),
    urlA,
  );

  // …and the document generated for the first Flow must still be the first Flow's.
  await runOn(serviceWorker, uploadDoc('tpl'), urlB);
  expect((await fileInfo(pageB)).name).toBe('main-flow.png');
});
