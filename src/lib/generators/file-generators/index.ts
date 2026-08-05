import { browser } from 'wxt/browser';
import type { RuntimeMessage } from '../../messaging/types';
import { getFileTemplate } from '../../storage/file-templates-store';
import { fromTransferableFile, type TransferableFile } from './file-transfer';
import { renderPng } from './render-png';

/**
 * Renders `templateId` to a real `File`, dispatched by format. Only ever
 * called from the filler (`fill-script.ts`'s `resolveValue`), never from the
 * QuickJS sandbox — Canvas and pdf-lib both need a real DOM/WASM environment
 * custom generators don't have.
 *
 * `png` renders right here, in the content script — it needs this context's
 * real DOM/Canvas. `pdf` is delegated to the background script instead of
 * calling `renderPdf()` directly (see `RuntimeMessage`'s `fileTemplate/renderPdf`
 * doc comment for why: content scripts can't code-split, so importing
 * pdf-lib here would bloat every single page's content script).
 */
export async function renderFile(templateId: string, flowId: string): Promise<File> {
  const template = await getFileTemplate(templateId);
  if (!template) throw new Error('File template not found — it may have been deleted.');
  if (template.format === 'png') return renderPng(template, flowId);
  // Comes back as raw bytes, not a `File` — see `TransferableFile`.
  const transfer = (await browser.runtime.sendMessage({
    type: 'fileTemplate/renderPdf',
    templateId,
    flowId,
  } satisfies RuntimeMessage)) as TransferableFile;
  return fromTransferableFile(transfer);
}
