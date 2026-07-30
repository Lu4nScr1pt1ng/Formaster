import { createKeyedStore } from './keyed-store';

/**
 * Tracks which tab was active when the options page was opened, so a
 * "Close" button there can jump back to it instead of just closing blind.
 * Persisted (not in-memory) for the same reason as the other handoff
 * stores in this folder: MV3 service workers can be killed and restarted
 * between the tab opening and the user clicking Close.
 */
const store = createKeyedStore<number>('formaster:return-tab-id');

export const setReturnTabId = store.set;
export const getReturnTabId = store.get;
export const clearReturnTabId = store.clear;
