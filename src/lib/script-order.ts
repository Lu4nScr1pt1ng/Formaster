import type { FormScript } from './schema/script';

/**
 * Pure ordering logic for the scripts inside one Flow.
 *
 * Order is stored as a sidecar list of ids per Flow (see
 * `storage/script-order-store.ts`), never as a field on the script — the
 * editor holds a full copy of the script it has open, so a field would be
 * written back stale and silently undo whatever the sidebar just did.
 */

/**
 * Total order for scripts an explicit list doesn't mention. It has to be
 * *total*: seeded fixtures routinely share a `createdAt` millisecond, and a
 * comparator that returns 0 for them leaves the result at whatever order
 * `storage.local` happened to enumerate — i.e. unspecified.
 */
export function compareScripts(a: FormScript, b: FormScript): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Orders `scripts` by `ids`. Anything not listed — a script just created,
 * one that arrived by import, one moved in from another Flow — goes after
 * the listed ones, which is also where a user would expect a new arrival.
 */
export function applyScriptOrder(scripts: FormScript[], ids: string[] | undefined): FormScript[] {
  if (!ids || ids.length === 0) return [...scripts].sort(compareScripts);
  const position = new Map(ids.map((id, index) => [id, index]));
  const listed: FormScript[] = [];
  const unlisted: FormScript[] = [];
  for (const script of scripts) (position.has(script.id) ? listed : unlisted).push(script);
  listed.sort((a, b) => position.get(a.id)! - position.get(b.id)!);
  unlisted.sort(compareScripts);
  return [...listed, ...unlisted];
}

/** The full id list for a Flow after ordering — what gets persisted once the user rearranges anything. */
export function orderedIds(scripts: FormScript[], ids: string[] | undefined): string[] {
  return applyScriptOrder(scripts, ids).map((script) => script.id);
}

/** Moves `id` to sit immediately before or after `targetId`. Returns the list unchanged if either is missing. */
export function moveWithin(ids: string[], id: string, targetId: string, position: 'before' | 'after'): string[] {
  if (id === targetId) return ids;
  const without = ids.filter((entry) => entry !== id);
  const targetIndex = without.indexOf(targetId);
  if (targetIndex === -1 || !ids.includes(id)) return ids;
  const insertAt = position === 'before' ? targetIndex : targetIndex + 1;
  return [...without.slice(0, insertAt), id, ...without.slice(insertAt)];
}

/** Moves `id` one slot up or down, for the keyboard equivalent of dragging. */
export function moveByOffset(ids: string[], id: string, offset: -1 | 1): string[] {
  const index = ids.indexOf(id);
  if (index === -1) return ids;
  const target = index + offset;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
