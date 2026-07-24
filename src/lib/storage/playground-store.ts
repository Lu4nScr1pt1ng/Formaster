import { browser } from 'wxt/browser';

const PLAYGROUND_SCRIPT_ID_KEY = 'formaster:playground-script-id';

/**
 * Tracks the id of the seeded example script bound to the playground page, so
 * re-opening it loads the same (possibly since-edited) script instead of
 * reseeding a duplicate on every visit. Cleared when that script is deleted.
 */
export async function getPlaygroundScriptId(): Promise<string | undefined> {
  const result = await browser.storage.local.get(PLAYGROUND_SCRIPT_ID_KEY);
  return result[PLAYGROUND_SCRIPT_ID_KEY] as string | undefined;
}

export async function setPlaygroundScriptId(scriptId: string): Promise<void> {
  await browser.storage.local.set({ [PLAYGROUND_SCRIPT_ID_KEY]: scriptId });
}

export async function clearPlaygroundScriptId(): Promise<void> {
  await browser.storage.local.remove(PLAYGROUND_SCRIPT_ID_KEY);
}
