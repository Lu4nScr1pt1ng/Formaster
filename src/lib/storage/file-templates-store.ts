import { browser } from 'wxt/browser';
import type { RuntimeMessage } from '../messaging/types';
import { fileTemplateSchema, type FileTemplate } from '../schema/file-template';

// One `browser.storage.local` key per template (`formaster:file-template:<id>`) — same rationale as `scripts-store.ts`.
const FILE_TEMPLATE_KEY_PREFIX = 'formaster:file-template:';

function fileTemplateKey(id: string): string {
  return `${FILE_TEMPLATE_KEY_PREFIX}${id}`;
}

export async function listFileTemplates(): Promise<FileTemplate[]> {
  const all = await browser.storage.local.get(null);
  const templates: FileTemplate[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(FILE_TEMPLATE_KEY_PREFIX)) continue;
    const parsed = fileTemplateSchema.safeParse(value);
    if (parsed.success) templates.push(parsed.data);
  }
  return templates;
}

export async function getFileTemplate(id: string): Promise<FileTemplate | undefined> {
  const raw = await browser.storage.local.get(fileTemplateKey(id));
  const parsed = fileTemplateSchema.safeParse(raw[fileTemplateKey(id)]);
  return parsed.success ? parsed.data : undefined;
}

export async function saveFileTemplate(template: FileTemplate): Promise<FileTemplate> {
  const updated = { ...template, updatedAt: new Date().toISOString() };
  await browser.storage.local.set({ [fileTemplateKey(updated.id)]: updated });
  await broadcastRefresh(updated.id);
  return updated;
}

export async function deleteFileTemplate(id: string): Promise<void> {
  await browser.storage.local.remove(fileTemplateKey(id));
  await broadcastRefresh(id);
}

async function broadcastRefresh(templateId: string): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'fileTemplates/refresh', templateId } satisfies RuntimeMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Receiving end does not exist')) {
      console.error('formaster: failed to broadcast fileTemplates/refresh', error);
    }
  }
}
