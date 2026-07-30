import { createKeyedStore } from './keyed-store';

/**
 * Tracks the id of the seeded example script bound to the playground page, so
 * re-opening it loads the same (possibly since-edited) script instead of
 * reseeding a duplicate on every visit. Cleared when that script is deleted.
 */
const store = createKeyedStore<string>('formaster:playground-script-id');

export const getPlaygroundScriptId = store.get;
export const setPlaygroundScriptId = store.set;
export const clearPlaygroundScriptId = store.clear;
