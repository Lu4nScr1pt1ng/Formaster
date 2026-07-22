import { browser } from 'wxt/browser';
import type { PickedField } from '../messaging/types';

const DRAFT_KEY = 'formaster:draft';

export interface ScriptDraft {
  pageUrl: string;
  fields: PickedField[];
}

export async function setDraft(draft: ScriptDraft): Promise<void> {
  await browser.storage.local.set({ [DRAFT_KEY]: draft });
}

export async function getDraft(): Promise<ScriptDraft | undefined> {
  const result = await browser.storage.local.get(DRAFT_KEY);
  return result[DRAFT_KEY] as ScriptDraft | undefined;
}

export async function clearDraft(): Promise<void> {
  await browser.storage.local.remove(DRAFT_KEY);
}
