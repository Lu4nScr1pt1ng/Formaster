import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/extension';
import {
  clearStorage,
  field,
  flow,
  getStored,
  pngTemplate,
  readDownload,
  runOn,
  script,
  seed,
  storageKeys,
} from './fixtures/flow-builders';
import type { FlowBundle } from '../src/lib/schema/flow-bundle';
import type { FileTemplate } from '../src/lib/schema/file-template';
import type { FormScript } from '../src/lib/schema/script';

/**
 * A script is no longer self-contained: it names a Flow and its file fields
 * name a File Template, both living in other stores. Exporting a Flow
 * bundles all three so it can actually be moved. These tests drive the real
 * UI (the folder's export icon, the import dialog's file input) and, where
 * it matters, prove the *reimported* Flow still fills — a JSON diff would
 * pass even if a template were dropped.
 */

const FLOW = 'flow-doc';

async function openOptions(context: import('@playwright/test').BrowserContext, extensionId: string, query = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html${query}`);
  await page.locator('text=Formaster').first().waitFor({ state: 'visible' });
  return page;
}

async function exportFlowFrom(options: Page, flowName: string): Promise<FlowBundle> {
  const downloadPromise = options.waitForEvent('download');
  await options.locator('nav div', { hasText: flowName }).getByRole('button', { name: 'Export flow' }).first().click();
  return JSON.parse(await readDownload(await downloadPromise)) as FlowBundle;
}

async function importBundle(options: Page, bundle: unknown): Promise<void> {
  await options.getByRole('button', { name: 'Import' }).click();
  await options.locator('input[type="file"]').setInputFiles({
    name: 'flow.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
}

const publisher = script({
  id: 's-a',
  flowId: FLOW,
  name: 'Page A — name',
  steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value: 'Ada Lovelace' }, saveAs: 'fullName' })],
});

const documentScript = script({
  id: 's-b',
  flowId: FLOW,
  name: 'Page B — document',
  steps: [field({ id: 'f-doc', selector: 'document', elementType: 'file', generator: { kind: 'file', templateId: 'tpl' } })],
});

const docTemplate = pngTemplate({
  id: 'tpl',
  name: 'Document',
  outputFilename: 'doc-{{fullName}}.png',
  layers: [{ source: { kind: 'flowVariable', key: 'fullName' } }],
});

test('a flow exports with every script and template, and the reimported flow still fills both pages', async ({
  context,
  staticServer,
  extensionId,
  serviceWorker,
}) => {
  await seed(serviceWorker, {
    flows: [flow(FLOW, 'Document flow')],
    scripts: [publisher, documentScript],
    templates: [docTemplate],
  });

  const options = await openOptions(context, extensionId);
  const bundle = await exportFlowFrom(options, 'Document flow');

  expect(bundle.kind).toBe('formaster-flow');
  expect(bundle.flow.name).toBe('Document flow');
  expect(bundle.scripts.map((entry) => entry.id).sort()).toEqual(['s-a', 's-b']);
  // Only the referenced template travels — and it must travel.
  expect(bundle.fileTemplates.map((entry) => entry.id)).toEqual(['tpl']);

  // Wipe everything: what comes back has to come back from the file alone.
  await clearStorage(serviceWorker);
  const fresh = await openOptions(context, extensionId);
  await importBundle(fresh, bundle);
  await expect(fresh.locator('text=/Valid — flow "Document flow" \\(2 scripts, 1 file template\\)/')).toBeVisible();
  await fresh.getByRole('button', { name: 'Import', exact: true }).last().click();

  await expect(fresh.locator('nav button[aria-expanded]', { hasText: 'Document flow' })).toBeVisible();
  await expect(fresh.locator('nav [role="group"] button', { hasText: 'Page A — name' })).toBeVisible();
  await expect(fresh.locator('nav [role="group"] button', { hasText: 'Page B — document' })).toBeVisible();

  // The real proof: run both restored scripts and check the generated file.
  const restoredA = await getStored<FormScript>(serviceWorker, 'formaster:script:s-a');
  const restoredB = await getStored<FormScript>(serviceWorker, 'formaster:script:s-b');
  const pageA = await context.newPage();
  const urlA = staticServer.url('flow-page-a.html');
  await pageA.goto(urlA);
  const pageB = await context.newPage();
  const urlB = staticServer.url('flow-page-b.html');
  await pageB.goto(urlB);

  await runOn(serviceWorker, restoredA!, urlA);
  expect(await runOn(serviceWorker, restoredB!, urlB)).toEqual([{ fieldId: 'f-doc', status: 'filled' }]);

  const info = JSON.parse((await pageB.locator('#file-info').textContent()) || '{}');
  expect(info.name).toBe('doc-Ada Lovelace.png');
  expect(info.inkPixels).toBeGreaterThan(100);
});

test('importing a flow never overwrites a file template another flow already uses', async ({
  context,
  staticServer,
  extensionId,
  serviceWorker,
}) => {
  // A template id that is already taken locally, by a different flow, with
  // different content.
  const localTemplate = pngTemplate({
    id: 'tpl',
    name: 'Document',
    outputFilename: 'existing.png',
    layers: [{ source: { kind: 'literal', value: 'local' } }],
  });
  const localScript = script({
    id: 's-local',
    flowId: 'flow-local',
    name: 'Local document',
    steps: [field({ id: 'f-doc', selector: 'document', elementType: 'file', generator: { kind: 'file', templateId: 'tpl' } })],
  });
  await seed(serviceWorker, { flows: [flow('flow-local', 'Local flow')], scripts: [localScript], templates: [localTemplate] });

  const incoming: FlowBundle = {
    kind: 'formaster-flow',
    schemaVersion: 1,
    flow: flow('flow-incoming', 'Incoming flow'),
    scripts: [
      script({
        id: 's-incoming',
        flowId: 'flow-incoming',
        name: 'Incoming document',
        steps: [field({ id: 'f-doc', selector: 'document', elementType: 'file', generator: { kind: 'file', templateId: 'tpl' } })],
      }),
    ],
    fileTemplates: [
      pngTemplate({ id: 'tpl', name: 'Document', outputFilename: 'imported.png', layers: [{ source: { kind: 'literal', value: 'incoming' } }] }),
    ],
  };

  const options = await openOptions(context, extensionId);
  await importBundle(options, incoming);
  // Warned before committing, not after.
  await expect(options.locator('text=/already uses the id of "Document"/')).toBeVisible();
  await options.getByRole('button', { name: 'Import', exact: true }).last().click();
  await expect(options.locator('nav button[aria-expanded]', { hasText: 'Incoming flow' })).toBeVisible();

  // The local template is byte-for-byte untouched…
  const stored = await getStored<FileTemplate>(serviceWorker, 'formaster:file-template:tpl');
  expect(stored!.outputFilename).toBe('existing.png');
  // …and the import came in alongside it, not over it.
  expect(await storageKeys(serviceWorker, 'formaster:file-template:')).toHaveLength(2);

  const importedScript = await getStored<FormScript>(serviceWorker, 'formaster:script:s-incoming');
  const generator = importedScript!.steps[0].type === 'field' ? importedScript!.steps[0].field.generator : null;
  expect(generator).toMatchObject({ kind: 'file' });
  expect(generator && 'templateId' in generator ? generator.templateId : '').not.toBe('tpl');

  // Both flows still generate their own document.
  const page = await context.newPage();
  const url = staticServer.url('flow-page-b.html');
  await page.goto(url);
  await runOn(serviceWorker, (await getStored<FormScript>(serviceWorker, 'formaster:script:s-local'))!, url);
  expect(JSON.parse((await page.locator('#file-info').textContent()) || '{}').name).toBe('existing.png');
  await runOn(serviceWorker, importedScript!, url);
  expect(JSON.parse((await page.locator('#file-info').textContent()) || '{}').name).toBe('imported.png');
});

test('re-importing the same flow replaces it in place instead of duplicating', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, {
    flows: [flow(FLOW, 'Document flow')],
    scripts: [publisher, documentScript],
    templates: [docTemplate],
  });

  const options = await openOptions(context, extensionId);
  const bundle = await exportFlowFrom(options, 'Document flow');

  await importBundle(options, bundle);
  await options.getByRole('button', { name: 'Import', exact: true }).last().click();

  // The collision dialog names exactly what gets overwritten.
  await expect(options.locator('text=Flow already exists')).toBeVisible();
  await expect(options.locator('text=/2 scripts will be overwritten/')).toBeVisible();
  await options.getByRole('button', { name: 'Replace', exact: true }).click();

  expect(await storageKeys(serviceWorker, 'formaster:script:')).toHaveLength(2);
  expect(await storageKeys(serviceWorker, 'formaster:flow:')).toHaveLength(1);
  // The template is unchanged content, so it's reused rather than duplicated.
  expect(await storageKeys(serviceWorker, 'formaster:file-template:')).toHaveLength(1);
  await expect(options.locator('nav button[aria-expanded]', { hasText: 'Document flow' })).toContainText('2');
});

test('a bundle whose script claims a different flow is rejected', async ({ context, extensionId }) => {
  const options = await openOptions(context, extensionId);
  await importBundle(options, {
    kind: 'formaster-flow',
    schemaVersion: 1,
    flow: flow('flow-a', 'Flow A'),
    scripts: [script({ id: 's1', flowId: 'some-other-flow', name: 'Mismatched', steps: [] })],
    fileTemplates: [],
  });

  await expect(options.getByRole('button', { name: 'Import', exact: true }).last()).toBeDisabled();
  await expect(options.locator('text=/scripts.0.flowId/')).toBeVisible();
});

test('a bundle missing a template it references still imports, and the field fails loudly', async ({
  context,
  staticServer,
  extensionId,
  serviceWorker,
}) => {
  const options = await openOptions(context, extensionId);
  await importBundle(options, {
    kind: 'formaster-flow',
    schemaVersion: 1,
    flow: flow(FLOW, 'Document flow'),
    scripts: [documentScript],
    fileTemplates: [],
  });

  await expect(options.locator("text=/points at a file template .* this bundle doesn't include/")).toBeVisible();
  // Advisory, not a blocker — the bundle is still importable.
  await expect(options.getByRole('button', { name: 'Import', exact: true }).last()).toBeEnabled();
  await options.getByRole('button', { name: 'Import', exact: true }).last().click();
  await expect(options.locator('nav [role="group"] button', { hasText: 'Page B — document' })).toBeVisible();

  const page = await context.newPage();
  const url = staticServer.url('flow-page-b.html');
  await page.goto(url);
  const results = await runOn(serviceWorker, (await getStored<FormScript>(serviceWorker, 'formaster:script:s-b'))!, url);
  expect(results[0].status).toBe('error');
  expect(results[0].message).toContain('File template not found');
});

test('a flow with no file templates exports and imports as a plain bundle', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow(FLOW, 'Plain flow')], scripts: [publisher] });

  const options = await openOptions(context, extensionId);
  const bundle = await exportFlowFrom(options, 'Plain flow');
  expect(bundle.fileTemplates).toEqual([]);

  await clearStorage(serviceWorker);
  const fresh = await openOptions(context, extensionId);
  await importBundle(fresh, bundle);
  await expect(fresh.locator('text=/Valid — flow "Plain flow" \\(1 script, 0 file templates\\)/')).toBeVisible();
  await fresh.getByRole('button', { name: 'Import', exact: true }).last().click();
  await expect(fresh.locator('nav [role="group"] button', { hasText: 'Page A — name' })).toBeVisible();
});
