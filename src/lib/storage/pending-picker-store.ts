import { browser } from 'wxt/browser';

const PENDING_KEY = 'formaster:pending-picker-script-id';

/**
 * Tracks which script (if any) a picker session started from "Add fields" in
 * the editor should append its results to, instead of creating a new draft
 * script. Persisted (not just in-memory) because MV3 service workers can be
 * killed and restarted between "picker/start-for-script" and "picker/finished".
 */
export async function setPendingPickerScriptId(scriptId: string): Promise<void> {
  await browser.storage.local.set({ [PENDING_KEY]: scriptId });
}

export async function getPendingPickerScriptId(): Promise<string | undefined> {
  const result = await browser.storage.local.get(PENDING_KEY);
  return result[PENDING_KEY] as string | undefined;
}

export async function clearPendingPickerScriptId(): Promise<void> {
  await browser.storage.local.remove(PENDING_KEY);
}
