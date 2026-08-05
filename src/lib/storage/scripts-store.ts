import { browser } from 'wxt/browser';
import { downloadJson, slugify } from '../export/download-json';
import type { RuntimeMessage } from '../messaging/types';
import { formScriptSchema, type FormScript } from '../schema/script';
import { deleteFlow } from './flows-store';

// One `browser.storage.local` key per script (`formaster:script:<id>`)
// instead of one big array under a single key. Saving/deleting a script used
// to be a read-the-whole-array, modify, write-the-whole-array-back cycle —
// with no locking, two different extension contexts (e.g. the background
// service worker saving a script the picker just finished, and an already-open
// Options tab saving edits to a *different* script) could both read the same
// array before either had written back, and whichever write landed second
// silently discarded the other's change. Giving each script its own key turns
// a save/delete into a single-key `set`/`remove` — two contexts touching
// different scripts no longer share any mutable state to race over. (Two
// contexts saving the *same* script at the same instant still just has the
// later write win, same as any app without real collaborative merging — that
// part isn't a bug.)
const SCRIPT_KEY_PREFIX = 'formaster:script:';
const LEGACY_ALL_SCRIPTS_KEY = 'formaster:scripts';

function scriptKey(id: string): string {
  return `${SCRIPT_KEY_PREFIX}${id}`;
}

// Runs at most once per JS context lifetime (background service worker,
// Options tab, Playground tab each check independently) — cheap to re-check,
// but pointless to re-check on every single store call once this context has
// already confirmed there's nothing left to migrate.
let migrated = false;

async function migrateLegacyScriptsIfNeeded(): Promise<void> {
  if (migrated) return;
  migrated = true;
  const raw = await browser.storage.local.get(LEGACY_ALL_SCRIPTS_KEY);
  const legacy = raw[LEGACY_ALL_SCRIPTS_KEY];
  if (legacy === undefined) return; // Already migrated (by this or another context) or a fresh install.
  await migrateLegacyEntries(legacy);
}

async function migrateLegacyEntries(legacy: unknown): Promise<Record<string, unknown>> {
  const entries: Record<string, unknown> = {};
  if (Array.isArray(legacy)) {
    for (const entry of legacy) {
      const parsed = formScriptSchema.safeParse(entry);
      if (parsed.success) entries[scriptKey(parsed.data.id)] = parsed.data;
    }
    if (Object.keys(entries).length > 0) await browser.storage.local.set(entries);
  }
  await browser.storage.local.remove(LEGACY_ALL_SCRIPTS_KEY);
  return entries;
}

// `listScripts()` runs on every Options/Playground mount, right as the user
// can already interact with the page — every extra `storage.local` round
// trip here directly widens a real race window elsewhere (see
// options/App.svelte's `mergeWithLocalDrafts`), so this folds the
// legacy-migration check into the same `get(null)` call instead of a
// separate one beforehand.
async function readAllScriptEntries(): Promise<Record<string, unknown>> {
  const all = await browser.storage.local.get(null);
  if (migrated) return all;
  migrated = true;
  if (!(LEGACY_ALL_SCRIPTS_KEY in all)) return all;
  const migratedEntries = await migrateLegacyEntries(all[LEGACY_ALL_SCRIPTS_KEY]);
  delete all[LEGACY_ALL_SCRIPTS_KEY];
  return { ...all, ...migratedEntries };
}

export async function listScripts(): Promise<FormScript[]> {
  const all = await readAllScriptEntries();
  const scripts: FormScript[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(SCRIPT_KEY_PREFIX)) continue;
    const parsed = formScriptSchema.safeParse(value);
    if (parsed.success) scripts.push(parsed.data);
  }
  return scripts;
}

export async function getScript(id: string): Promise<FormScript | undefined> {
  await migrateLegacyScriptsIfNeeded();
  const raw = await browser.storage.local.get(scriptKey(id));
  const parsed = formScriptSchema.safeParse(raw[scriptKey(id)]);
  return parsed.success ? parsed.data : undefined;
}

export async function saveScript(script: FormScript): Promise<FormScript> {
  await migrateLegacyScriptsIfNeeded();
  const updated = { ...script, updatedAt: new Date().toISOString() };
  await browser.storage.local.set({ [scriptKey(updated.id)]: updated });
  await broadcastRefresh(updated.id);
  return updated;
}

export async function deleteScript(id: string): Promise<void> {
  await migrateLegacyScriptsIfNeeded();
  const script = await getScript(id);
  await browser.storage.local.remove(scriptKey(id));
  if (script) {
    const remaining = await listScripts();
    const flowStillUsed = remaining.some((other) => other.flowId === script.flowId);
    if (!flowStillUsed) await deleteFlow(script.flowId);
  }
  await broadcastRefresh(id);
}

// Every save/delete goes through here regardless of which page (Options,
// Playground, or the background service worker's own picker-finish flow)
// called it, so an already-open Options tab always picks up a change made
// elsewhere — this used to only fire from the picker-finish flow, so saving
// from the Playground (or a second Options tab) silently didn't show up in
// an already-open Options tab until it was manually reloaded.
async function broadcastRefresh(scriptId: string): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'scripts/refresh', scriptId } satisfies RuntimeMessage);
  } catch (error) {
    // Both Chrome and Firefox reject with this message when no other
    // extension page is listening — expected in the common case (only one
    // tab open), not an error. Anything else is a real failure worth surfacing.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Receiving end does not exist')) {
      console.error('formaster: failed to broadcast scripts/refresh', error);
    }
  }
}

export function exportScript(script: FormScript): string {
  return JSON.stringify(script, null, 2);
}

/**
 * Triggers a browser download of `script` as a `.json` file — shared by the
 * Options and Playground export buttons. Exports the script alone: to move a
 * script that belongs to a multi-script Flow (or whose fields generate files
 * from a template), export the whole Flow instead — see `flow-bundle-store.ts`.
 */
export function downloadScriptAsJson(script: FormScript): void {
  downloadJson(script, `${slugify(script.name, 'script')}.json`);
}
