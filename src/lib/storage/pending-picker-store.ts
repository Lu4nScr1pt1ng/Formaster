import { createKeyedStore } from './keyed-store';

/**
 * Tracks which script (if any) a picker session started from "Add fields" in
 * the editor should append its results to, instead of creating a new draft
 * script. Persisted (not just in-memory) because MV3 service workers can be
 * killed and restarted between "picker/start-for-script" and "picker/finished".
 */
const store = createKeyedStore<string>('formaster:pending-picker-script-id');

export const setPendingPickerScriptId = store.set;
export const getPendingPickerScriptId = store.get;
export const clearPendingPickerScriptId = store.clear;
