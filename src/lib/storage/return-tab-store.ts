import { browser } from 'wxt/browser';

const RETURN_TAB_KEY = 'formaster:return-tab-id';

/**
 * Tracks which tab was active when the options page was opened, so a
 * "Close" button there can jump back to it instead of just closing blind.
 * Persisted (not in-memory) for the same reason as the other handoff
 * stores in this folder: MV3 service workers can be killed and restarted
 * between the tab opening and the user clicking Close.
 */
export async function setReturnTabId(tabId: number): Promise<void> {
  await browser.storage.local.set({ [RETURN_TAB_KEY]: tabId });
}

export async function getReturnTabId(): Promise<number | undefined> {
  const result = await browser.storage.local.get(RETURN_TAB_KEY);
  return result[RETURN_TAB_KEY] as number | undefined;
}
