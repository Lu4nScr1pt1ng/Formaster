import type { Page } from '@playwright/test';
import type { ScriptStep } from '../src/lib/schema/script';
import { test, expect } from './fixtures/extension';
import { field, flow, pdfTemplate, pngTemplate, runOn, script, seed, storageKeys } from './fixtures/flow-builders';

/**
 * A text layer can draw a value it generates itself — a built-in generator or
 * a custom script — not only a literal or something another field happened to
 * publish.
 *
 * A `custom` layer names a generator on the **script running the fill** —
 * the same list its fields pick from — not one the template owns, so a
 * generator written once serves a field and a document alike.
 *
 * Most of these assert against a **PDF**, because a PDF keeps its text as
 * real strings: the fixture reads them back (see flow-page-b.html's
 * `extractPdfText`), so "the generator ran and produced exactly this" is an
 * exact assertion rather than a pixel count. The PNG path gets its own test,
 * since it renders in a completely different place (the content script's
 * canvas, not the background worker).
 */

const FLOW = 'flow-gen';

async function openBothPages(context: import('@playwright/test').BrowserContext, staticServer: { url(name: string): string }) {
  const urlA = staticServer.url('flow-page-a.html');
  const urlB = staticServer.url('flow-page-b.html');
  const pageA = await context.newPage();
  await pageA.goto(urlA);
  const pageB = await context.newPage();
  await pageB.goto(urlB);
  return { pageA, pageB, urlA, urlB };
}

/**
 * The fixture decodes the attached file asynchronously in its `change`
 * handler (see flow-page-b.html), so its report can land a tick *after* the
 * fill's own result comes back. Waiting for non-empty rather than reading
 * straight away is what keeps this from flaking under load — and pairing it
 * with `clearFileInfo` is what stops a second run in the same test from
 * reading the first run's report and passing for the wrong reason.
 */
async function fileInfo(pageB: Page) {
  await expect(pageB.locator('#file-info')).not.toBeEmpty();
  return JSON.parse((await pageB.locator('#file-info').textContent()) || '{}');
}

async function clearFileInfo(pageB: Page): Promise<void> {
  await pageB.locator('#file-info').evaluate((el) => (el.textContent = ''));
}

/** The one string the template's single text layer drew. */
async function drawnText(pageB: Page): Promise<string> {
  const info = await fileInfo(pageB);
  expect(info.attached, `nothing was attached: ${JSON.stringify(info)}`).toBe(true);
  expect(info.text, `no text found in the PDF: ${JSON.stringify(info)}`).toHaveLength(1);
  return info.text[0];
}

const publishName = (value: string) =>
  script({
    id: 's-a',
    flowId: FLOW,
    name: 'Page A — name',
    steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value }, saveAs: 'fullName' })],
  });

const uploadDoc = (templateId: string, extra: { steps?: ScriptStep[]; code?: string } = {}) =>
  script({
    id: 's-b',
    flowId: FLOW,
    name: 'Page B — document',
    steps: [
      ...(extra.steps ?? []),
      field({ id: 'f-doc', selector: 'document', elementType: 'file', generator: { kind: 'file', templateId } }),
    ],
    // On the script, not the template: a `custom` layer reaches into the
    // running script's generators.
    customGenerators: extra.code === undefined ? [] : [{ id: 'g1', name: 'Doc code', code: extra.code, optionsSchema: [] }],
  });

test('a built-in layer draws the same person the fields around it did', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [pdfTemplate({ id: 'tpl', layers: [{ source: { kind: 'builtin', id: 'firstName' } }] })],
  });

  // Whoever the run generates first decides, and the document has to follow:
  // the layer resolves against the same run context the fields do. That
  // context lives and dies inside this one fill — nothing is persisted, so
  // this is the only scope in which the two can be expected to agree.
  const steps = [field({ id: 'f-first', selector: 'first-name', generator: { kind: 'builtin', id: 'firstName' } })];
  await runOn(serviceWorker, uploadDoc('tpl', { steps }), urlB);

  const typed = await pageB.locator('#first-name').inputValue();
  expect(typed).not.toBe('');
  expect(await drawnText(pageB)).toBe(typed);
  expect(await storageKeys(serviceWorker, 'formaster:flow-identity:')).toEqual([]);
});

test("a built-in layer honors its own options", async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [
      pdfTemplate({ id: 'tpl-masked', layers: [{ source: { kind: 'builtin', id: 'cpf' } }] }),
      pdfTemplate({ id: 'tpl-plain', layers: [{ source: { kind: 'builtin', id: 'cpf', options: { masked: false } } }] }),
    ],
  });

  await runOn(serviceWorker, uploadDoc('tpl-masked'), urlB);
  expect(await drawnText(pageB)).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);

  await clearFileInfo(pageB);
  await runOn(serviceWorker, uploadDoc('tpl-plain'), urlB);
  expect(await drawnText(pageB)).toMatch(/^\d{11}$/);
});

test("a custom layer runs the running script's generator, with flow variables in scope", async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [pdfTemplate({ id: 'tpl', layers: [{ source: { kind: 'custom', generatorId: 'g1' } }] })],
  });

  await runOn(serviceWorker, publishName('ada'), urlA);
  const uploader = uploadDoc('tpl', { code: 'return "DOC-" + flowVars.fullName.toUpperCase();' });
  expect(await runOn(serviceWorker, uploader, urlB)).toEqual([{ fieldId: 'f-doc', status: 'filled' }]);
  expect(await drawnText(pageB)).toBe('DOC-ADA');
});

test('a custom layer sees the fields filled above it, its own options, and helpers', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [
      pdfTemplate({ id: 'tpl', layers: [{ source: { kind: 'custom', generatorId: 'g1', options: { prefix: 'INV' } } }] }),
    ],
  });

  // `refCode` is filled by the same script one step above the file field — a
  // layer's generator gets exactly the `fields` bag a field's generator would.
  const steps = [
    field({ id: 'f-ref', selector: 'ref-code', label: 'Ref code', generator: { kind: 'fixed', value: 'A17' } }),
  ];
  const code = 'return options.prefix + "/" + fields.refCode + "/" + helpers.cpf({ masked: false });';
  expect(await runOn(serviceWorker, uploadDoc('tpl', { steps, code }), urlB)).toEqual([
    { fieldId: 'f-ref', status: 'filled' },
    { fieldId: 'f-doc', status: 'filled' },
  ]);

  expect(await drawnText(pageB)).toMatch(/^INV\/A17\/\d{11}$/);
});

test('generator layers work on the PNG path too, which renders somewhere else entirely', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [
      // `integer` pinned to a single value by its own options: a canvas gives
      // no text to read back, so the assertion has to be against something
      // whose output is knowable in advance.
      pngTemplate({ id: 'tpl-builtin', layers: [{ source: { kind: 'builtin', id: 'integer', options: { min: 4242, max: 4242 } } }] }),
      pngTemplate({ id: 'tpl-custom', layers: [{ source: { kind: 'custom', generatorId: 'g1' } }] }),
      // Identical template, identical layer geometry, the value spelled out —
      // so equal ink means the generated string was character-for-character
      // what the literal one is.
      pngTemplate({ id: 'tpl-literal', layers: [{ source: { kind: 'literal', value: '4242' } }] }),
    ],
  });

  await runOn(serviceWorker, uploadDoc('tpl-literal'), urlB);
  const literal = await fileInfo(pageB);
  expect(literal.inkPixels).toBeGreaterThan(100);

  await clearFileInfo(pageB);
  await runOn(serviceWorker, uploadDoc('tpl-builtin'), urlB);
  expect((await fileInfo(pageB)).inkPixels).toBe(literal.inkPixels);

  await clearFileInfo(pageB);
  await runOn(serviceWorker, uploadDoc('tpl-custom', { code: 'return 4242;' }), urlB);
  expect((await fileInfo(pageB)).inkPixels).toBe(literal.inkPixels);
});

test('a layer naming a generator the running script does not have fails loudly', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [pdfTemplate({ id: 'tpl', layers: [{ source: { kind: 'custom', generatorId: 'deleted' } }] })],
  });

  // The cross-record hazard of pointing a global template at a script's
  // generator: this script simply has no `deleted`. It has to say which
  // generator is missing, not fail vaguely.
  const results = await runOn(serviceWorker, uploadDoc('tpl'), urlB);
  expect(results[0].status).toBe('error');
  expect(results[0].message).toContain('no custom generator "deleted"');
  // A document with a hole where the value should be is worse than no
  // document, so nothing is attached at all.
  expect(await pageB.locator('#file-info').textContent()).toBe('');
});

test('a throwing custom layer surfaces the sandbox error instead of drawing blank', async ({ context, serviceWorker, staticServer }) => {
  const { urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [pdfTemplate({ id: 'tpl', layers: [{ source: { kind: 'custom', generatorId: 'g1' } }] })],
  });

  const results = await runOn(serviceWorker, uploadDoc('tpl', { code: 'throw new Error("nope");' }), urlB);
  expect(results[0].status).toBe('error');
  expect(results[0].message).toContain('nope');
});

test('a generator layer needs no published variable, so a lone script can still make its document', async ({
  context,
  serviceWorker,
  staticServer,
}) => {
  const { pageB, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [pdfTemplate({ id: 'tpl', layers: [{ source: { kind: 'builtin', id: 'uuid' } }], outputFilename: 'lone.pdf' })],
  });

  // Nothing ran before this — the equivalent flowVariable layer errors here
  // (see flows-file-generator.spec.ts), which is precisely the gap a
  // generator-backed layer closes.
  expect(await runOn(serviceWorker, uploadDoc('tpl'), urlB)).toEqual([{ fieldId: 'f-doc', status: 'filled' }]);
  expect((await fileInfo(pageB)).name).toBe('lone.pdf');
  expect(await drawnText(pageB)).toMatch(/^[0-9a-f-]{36}$/);
});

test('one template renders differently for two scripts defining the same generator id', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [pdfTemplate({ id: 'tpl', layers: [{ source: { kind: 'custom', generatorId: 'g1' } }] })],
  });

  // The upside of the layer naming the *script's* generator rather than one
  // the template owns: a shared template is a layout, and each script decides
  // what goes in it.
  await runOn(serviceWorker, uploadDoc('tpl', { code: 'return "FROM-A";' }), urlB);
  expect(await drawnText(pageB)).toBe('FROM-A');

  await clearFileInfo(pageB);
  await runOn(serviceWorker, uploadDoc('tpl', { code: 'return "FROM-B";' }), urlB);
  expect(await drawnText(pageB)).toBe('FROM-B');
});

// --- Authoring the same thing through the UI --------------------------------

async function openTemplateEditor(context: import('@playwright/test').BrowserContext, extensionId: string): Promise<Page> {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html?script=s-b`);
  await options.locator('text=Formaster').first().waitFor({ state: 'visible' });
  await options.getByRole('button', { name: 'Edit template' }).click();
  return options;
}

test('a built-in layer can be authored and previewed in the template editor', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [pngTemplate({ id: 'tpl', name: 'Doc', layers: [{ source: { kind: 'literal', value: 'x' } }] })],
    scripts: [uploadDoc('tpl')],
  });
  const options = await openTemplateEditor(context, extensionId);

  await options.getByRole('button', { name: 'Text source' }).click();
  await options.getByRole('option', { name: 'Built-in generator' }).click();
  await options.getByRole('button', { name: 'Built-in generator' }).click();
  await options.getByRole('option', { name: 'CPF', exact: true }).click();

  // The layer's own Preview resolves it for real — the only way to see what a
  // generator produces without saving, wiring it to a field and filling.
  // `exact`, since the field row behind the modal has its own "Preview value".
  await options.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(options.locator('text=/^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$/')).toBeVisible();

  await options.getByRole('button', { name: 'Save template' }).click();
  const stored = await serviceWorker.evaluate(
    async () => (await chrome.storage.local.get('formaster:file-template:tpl'))['formaster:file-template:tpl'],
  );
  expect((stored as { textLayers: Array<{ source: unknown }> }).textLayers[0].source).toEqual({ kind: 'builtin', id: 'cpf' });
});

test('choosing "Custom script" with no generators yet creates one on the template', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, {
    flows: [flow(FLOW)],
    templates: [pngTemplate({ id: 'tpl', name: 'Doc', layers: [{ source: { kind: 'literal', value: 'x' } }] })],
    scripts: [uploadDoc('tpl')],
  });
  const options = await openTemplateEditor(context, extensionId);

  await options.getByRole('button', { name: 'Text source' }).click();
  await options.getByRole('option', { name: 'Custom script' }).click();

  // Picking it with an empty list must not be a dead end — a generator is
  // created and assigned in one move, the same way a field's picker does it.
  // Everything is scoped to the modal: the generator lands on the *script*, so
  // the editor behind it grows a matching card at the same moment.
  const modal = options.locator('[role="presentation"]');
  await expect(modal.locator('text=Custom generators (1)')).toBeVisible();
  await expect(options.getByRole('button', { name: 'Custom generator', exact: true })).toHaveText(/Generator 1/);

  await modal.locator('.cm-content').first().click();
  await options.keyboard.press('ControlOrMeta+a');
  await options.keyboard.type('return "AUTHORED";');

  await options.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(modal.locator('text=AUTHORED').first()).toBeVisible();

  await options.getByRole('button', { name: 'Save template' }).click();
  // The template keeps only the reference…
  const storedTemplate = (await serviceWorker.evaluate(
    async () => (await chrome.storage.local.get('formaster:file-template:tpl'))['formaster:file-template:tpl'],
  )) as { customGenerators?: unknown; textLayers: Array<{ source: { kind: string; generatorId: string } }> };
  expect(storedTemplate.customGenerators).toBeUndefined();
  expect(storedTemplate.textLayers[0].source).toMatchObject({ kind: 'custom' });

  // …and the generator itself belongs to the script, so it saves with it.
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  const storedScript = (await serviceWorker.evaluate(
    async () => (await chrome.storage.local.get('formaster:script:s-b'))['formaster:script:s-b'],
  )) as { customGenerators: Array<{ id: string; code: string }> };

  expect(storedScript.customGenerators).toHaveLength(1);
  expect(storedScript.customGenerators[0].code).toContain('AUTHORED');
  expect(storedTemplate.textLayers[0].source.generatorId).toBe(storedScript.customGenerators[0].id);
});
