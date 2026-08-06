import { browser } from 'wxt/browser';
import type { RuntimeMessage } from '../../messaging/types';
import type { FileTemplate } from '../../schema/file-template';
import { getFileTemplate } from '../../storage/file-templates-store';
import { fromTransferableFile, type TransferableFile } from './file-transfer';
import { renderPng } from './render-png';
import { resolveTemplateTexts, type ResolvedTemplateTexts } from './resolve-template-texts';
import type { TextResolutionDeps } from './resolve-text-sources';

/** What a caller has to supply to render a template — all of it from the script doing the filling, since the template itself holds no runtime state. */
export type TemplateRenderDeps = TextResolutionDeps;

/**
 * The whole path from "a field points at this template id" to a real `File`:
 * load it, turn every layer into a finished string, then draw.
 *
 * Shared by the filler and the editor's preview so the two can't drift —
 * a preview that resolved its layers differently from a real run would be
 * worse than no preview at all.
 */
export async function renderTemplateById(templateId: string, deps: TemplateRenderDeps): Promise<File> {
  const template = await getFileTemplate(templateId);
  if (!template) throw new Error('File template not found — it may have been deleted.');
  return renderFile(template, await resolveTemplateTexts(template, deps));
}

/**
 * Renders an already-resolved template to a real `File`, dispatched by
 * format.
 *
 * `png` renders right here, in the content script — it needs this context's
 * real DOM/Canvas. `pdf` is delegated to the background rather than calling
 * `renderPdf()` directly: content scripts can't code-split, so importing
 * pdf-lib here would bloat every visited page's content script.
 *
 * Text is resolved by the caller, not here — a layer can use a generator
 * that only runs in the background, which no renderer could do on its own.
 */
export async function renderFile(template: FileTemplate, texts: ResolvedTemplateTexts): Promise<File> {
  if (template.format === 'png') return renderPng(template, texts);
  // Comes back as raw bytes, not a `File` — see `TransferableFile`.
  const transfer = (await browser.runtime.sendMessage({
    type: 'fileTemplate/renderPdf',
    templateId: template.id,
    texts,
  } satisfies RuntimeMessage)) as TransferableFile;
  return fromTransferableFile(transfer);
}
