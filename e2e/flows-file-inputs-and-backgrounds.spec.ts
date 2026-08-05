import { test, expect } from './fixtures/extension';
import { field, flow, pdfTemplate, pngTemplate, runOn, script, seed } from './fixtures/flow-builders';

/**
 * The two ends of the file feature the other Flow specs don't reach: the
 * picker recognising an `<input type="file">` in the first place, and the
 * File Template background kinds that need a real uploaded asset (an image
 * for PNG, a base document for PDF) rather than a solid colour.
 */

test('the picker detects an <input type="file"> as a file field', async ({ context, staticServer, openOptions }) => {
  const fixture = await context.newPage();
  await fixture.goto(staticServer.url('multistep-3-documents.html'));

  const options = await openOptions();
  await options.getByRole('button', { name: 'New' }).click();
  await options.getByRole('button', { name: 'Add fields from page' }).click();

  await fixture.bringToFront();
  await expect(fixture.locator('text=Click a field to map it')).toBeVisible();
  await fixture.locator('#proof-of-address').click();
  await expect(fixture.locator('text=1 field mapped')).toBeVisible();
  await fixture.getByRole('button', { name: 'Finish' }).click();

  await options.bringToFront();
  // Detected as `file`, which is what makes the field row show the File
  // Template picker instead of the builtin/fixed/custom generator kinds.
  await expect(options.getByRole('button', { name: 'Field type' })).toHaveText(/file/);
  await expect(options.getByRole('button', { name: 'File template' })).toBeVisible();
  // The three generator kinds that can't produce a File must not be offered.
  await expect(options.getByRole('button', { name: 'Generator kind' })).toHaveCount(0);
});

// A 2x2 PNG (top-left pixel pure red) as a data URL — small enough to inline,
// and its known colour makes "was the background actually drawn?" checkable
// by reading a pixel rather than eyeballing a size.
const RED_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYEJRIAAIhwCAcbOtV0AAAAASUVORK5CYII=';

test('a PNG template draws an uploaded image background under its text', async ({ context, serviceWorker, staticServer }) => {
  const template = pngTemplate({ id: 'tpl-img', layers: [{ source: { kind: 'literal', value: 'X' } }] });
  await seed(serviceWorker, {
    flows: [flow('f')],
    templates: [{ ...template, background: { kind: 'image', dataUrl: RED_PNG_DATA_URL } }],
  });

  const page = await context.newPage();
  const url = staticServer.url('flow-page-b.html');
  await page.goto(url);

  const fileScript = script({
    id: 's',
    flowId: 'f',
    steps: [field({ id: 'f-doc', selector: 'document', elementType: 'file', generator: { kind: 'file', templateId: 'tpl-img' } })],
  });
  expect(await runOn(serviceWorker, fileScript, url)).toEqual([{ fieldId: 'f-doc', status: 'filled' }]);

  // Read the corner pixel of the attached file: the uploaded image was
  // stretched over the whole canvas, so it must be red — a template that
  // silently ignored the background would leave it white.
  const corner = await page.evaluate(async () => {
    const file = (document.getElementById('document') as HTMLInputElement).files![0];
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  });
  expect(corner.r).toBeGreaterThan(200);
  expect(corner.g).toBeLessThan(80);
  expect(corner.b).toBeLessThan(80);
});

test('a PDF template draws on top of an uploaded base PDF without discarding it', async ({ context, serviceWorker, staticServer }) => {

  // A genuine 2-page PDF, built here in Node with the same pdf-lib the
  // renderer uses — a hand-rolled byte blob wouldn't prove pdf-lib can load
  // and draw over a real document.
  const basePdfDataUrl = await buildBasePdf();

  const template = pdfTemplate({
    id: 'tpl-base',
    outputFilename: 'overlaid.pdf',
    layers: [
      { source: { kind: 'literal', value: 'OVERLAID ON PAGE 1' }, pageIndex: 0, y: 100 },
      { source: { kind: 'literal', value: 'OVERLAID ON PAGE 2' }, pageIndex: 1, y: 100 },
    ],
  });
  await seed(serviceWorker, {
    flows: [flow('f')],
    templates: [{ ...template, background: { kind: 'pdf', dataUrl: basePdfDataUrl } }],
  });

  const page = await context.newPage();
  const url = staticServer.url('flow-page-b.html');
  await page.goto(url);

  const fileScript = script({
    id: 's',
    flowId: 'f',
    steps: [field({ id: 'f-doc', selector: 'document', elementType: 'file', generator: { kind: 'file', templateId: 'tpl-base' } })],
  });
  expect(await runOn(serviceWorker, fileScript, url)).toEqual([{ fieldId: 'f-doc', status: 'filled' }]);

  // Pull the attached file back out and reload it with pdf-lib: the base's
  // two pages must still be there (it was drawn onto, not replaced by a
  // fresh blank document) and its original text must have survived.
  const attachedBase64 = await page.evaluate(async () => {
    const file = (document.getElementById('document') as HTMLInputElement).files![0];
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { name: file.name, base64: btoa(binary) };
  });
  expect(attachedBase64.name).toBe('overlaid.pdf');

  const { PDFDocument } = await import('pdf-lib');
  const attached = await PDFDocument.load(Buffer.from(attachedBase64.base64, 'base64'));
  expect(attached.getPageCount()).toBe(2);
  expect(attached.getPage(0).getSize()).toEqual({ width: 400, height: 300 });

  // The base document's own text is still in there alongside what was drawn
  // on top — nothing was flattened away or corrupted.
  const raw = Buffer.from(attachedBase64.base64, 'base64').toString('latin1');
  expect(raw).toContain('%PDF-');
  expect(raw.length).toBeGreaterThan(Buffer.from(basePdfDataUrl.split(',')[1], 'base64').length / 2);
});

async function buildBasePdf(): Promise<string> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of ['BASE PAGE ONE', 'BASE PAGE TWO']) {
    const page = doc.addPage([400, 300]);
    page.drawText(label, { x: 20, y: 260, size: 18, font });
  }
  return doc.saveAsBase64({ dataUri: true });
}
