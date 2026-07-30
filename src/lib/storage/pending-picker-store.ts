import { createKeyedStore } from './keyed-store';

/**
 * Tracks which script (if any) a picker session started from "Add fields" in
 * the editor should append its results to, instead of creating a new draft
 * script. Persisted (not just in-memory) because MV3 service workers can be
 * killed and restarted between "picker/start-for-script" and "picker/finished".
 *
 * Scoped to the tab the session was started on: without `tabId`, a session
 * that ends without sending any "picker/finished" (e.g. Escape pressed with
 * nothing picked) left this pointing at a stale script forever, and a later,
 * completely unrelated plain "pick fields" session (in any tab) would then
 * silently append its results onto that stale script instead of creating a
 * fresh one.
 */
export interface PendingPickerSession {
  scriptId: string;
  tabId: number;
}

const store = createKeyedStore<PendingPickerSession>('formaster:pending-picker-script-id');

export const setPendingPickerSession = store.set;
export const getPendingPickerSession = store.get;
export const clearPendingPickerSession = store.clear;
