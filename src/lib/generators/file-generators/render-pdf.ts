import type { FileTemplate } from '../../schema/file-template';
import type { ResolvedTemplateTexts } from './resolve-template-texts';

// Imported dynamically, same lazy-load spirit as the QuickJS WASM engine in
// `quickjs-runner.ts` — only paid for when a template with `format: 'pdf'`
// actually runs, not bundled eagerly into every content script.
//
// Deliberately the prebuilt standalone ESM bundle rather than the package
// entry point (`pdf-lib` -> `es/index.js`): that build is compiled with
// TypeScript's `importHelpers`, so it does `import ... from 'tslib'`, and
// bundling it here produced a module whose tslib interop resolved to
// `undefined` at runtime — every render died with "Cannot destructure
// property '__extends' of 'md.default' as it is undefined". `dist/
// pdf-lib.esm.min.js` has no external imports at all (helpers inlined), so
// there's no interop to get wrong. Verified by the PDF e2e test.
export async function renderPdf(template: FileTemplate, texts: ResolvedTemplateTexts): Promise<File> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib/dist/pdf-lib.esm.min.js');

  const pdfDoc =
    template.background.kind === 'pdf' ? await PDFDocument.load(await dataUrlToArrayBuffer(template.background.dataUrl)) : await PDFDocument.create();

  if (pdfDoc.getPageCount() === 0) pdfDoc.addPage();

  if (template.background.kind === 'blank') {
    const [r, g, b] = hexToRgb(template.background.color);
    for (const page of pdfDoc.getPages()) {
      const { width, height } = page.getSize();
      page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(r, g, b) });
    }
  }

  const [helvetica, helveticaBold] = await Promise.all([pdfDoc.embedFont(StandardFonts.Helvetica), pdfDoc.embedFont(StandardFonts.HelveticaBold)]);
  const pages = pdfDoc.getPages();

  for (const layer of template.textLayers) {
    const page = pages[layer.pageIndex] ?? pages[0];
    if (!page) continue;
    const text = texts.layers[layer.id] ?? '';
    const font = layer.fontWeight === 'bold' ? helveticaBold : helvetica;
    const [r, g, b] = hexToRgb(layer.color);

    // pdf-lib has no built-in text alignment — offset x by the rendered
    // width ourselves. PDF's origin is bottom-left, so y is flipped against
    // the page height to match the top-left origin used everywhere else
    // (the canvas preview, the png renderer, the editor's live preview).
    const textWidth = font.widthOfTextAtSize(text, layer.fontSizePx);
    const x = layer.align === 'center' ? layer.x - textWidth / 2 : layer.align === 'right' ? layer.x - textWidth : layer.x;

    page.drawText(text, {
      x,
      y: page.getSize().height - layer.y,
      size: layer.fontSizePx,
      font,
      color: rgb(r, g, b),
      maxWidth: layer.maxWidthPx,
    });
  }

  const bytes = await pdfDoc.save();
  // `pdfDoc.save()`'s TS return type is generic over `ArrayBufferLike`
  // (which technically also covers `SharedArrayBuffer`), but pdf-lib only
  // ever hands back a real `ArrayBuffer`-backed `Uint8Array` — `File`'s
  // constructor type just isn't as loose.
  return new File([bytes.buffer as ArrayBuffer], texts.filename, { type: 'application/pdf' });
}

async function dataUrlToArrayBuffer(dataUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(dataUrl);
  return response.arrayBuffer();
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
  const value = parseInt(expanded, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
