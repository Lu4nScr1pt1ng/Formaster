import { browser } from 'wxt/browser';
import type { RuntimeMessage } from '../messaging/types';
import { applyScriptOrder } from '../script-order';
import type { FormScript } from '../schema/script';
import { deleteFlow } from './flows-store';
import { getScript, listScripts, saveScript } from './scripts-store';

/**
 * Where a Flow's scripts sit relative to each other: one `storage.local` key
 * per Flow holding an array of script ids.
 *
 * A sidecar rather than an `order` field on the script, because the editor
 * keeps a full draft of whatever script is open — a field would ride along
 * in that draft and get written back stale on the next Save, silently
 * undoing a reorder. It also means rearranging writes no script record at
 * all: no `updatedAt` churn (which would blow away an open draft) and no
 * chance of clobbering a save another tab is making to the same script.
 */
const FLOW_ORDER_KEY_PREFIX = 'formaster:flow-order:';

function orderKey(flowId: string): string {
  return `${FLOW_ORDER_KEY_PREFIX}${flowId}`;
}

/**
 * Reads several Flows' orders in one targeted `get`. Deliberately not a
 * `get(null)` sweep — `listScripts()` and `listFlows()` already do one each
 * on mount, and `scripts-store.ts` warns that every extra round trip there
 * widens a real race window in the options page's draft merge.
 */
export async function listFlowOrders(flowIds: string[]): Promise<Record<string, string[]>> {
  if (flowIds.length === 0) return {};
  const raw = await browser.storage.local.get(flowIds.map(orderKey));
  const orders: Record<string, string[]> = {};
  for (const flowId of flowIds) {
    const value = raw[orderKey(flowId)];
    if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) orders[flowId] = value;
  }
  return orders;
}

export async function setFlowOrder(flowId: string, ids: string[]): Promise<void> {
  await browser.storage.local.set({ [orderKey(flowId)]: ids });
  await broadcast(flowId);
}

export async function deleteFlowOrder(flowId: string): Promise<void> {
  await browser.storage.local.remove(orderKey(flowId));
}

/**
 * Moves a script into another Flow at a given position, and cleans up behind
 * it: a Flow with no scripts left can't be shown anywhere (the sidebar
 * renders folders from the scripts in them), so it's removed rather than
 * left as an invisible record that still shows up in the "switch flow"
 * picker. Same rule `deleteScript` already applies.
 */
export async function moveScriptToFlow(
  scriptId: string,
  fromFlowId: string,
  toFlowId: string,
  index: number,
): Promise<{ removedEmptyFlow: boolean }> {
  const script = await getScript(scriptId);
  if (!script) throw new Error('That script no longer exists.');

  // Re-read rather than trusting the caller's copy: the sidebar's list can
  // be a render or two behind an edit made in the editor next to it.
  await saveScript({ ...script, flowId: toFlowId });

  const all = await listScripts();
  const remaining = all.filter((entry) => entry.flowId === fromFlowId && entry.id !== scriptId);
  const orders = await listFlowOrders([fromFlowId, toFlowId]);

  // Normalize against the Flow's actual members first. A Flow that has
  // never been rearranged has no stored list, and treating that as an empty
  // one would make "append" mean "insert at 0", dropping the arrival above
  // scripts that were already there.
  const target = applyScriptOrder(
    all.filter((entry) => entry.flowId === toFlowId && entry.id !== scriptId),
    orders[toFlowId],
  ).map((entry) => entry.id);
  const clamped = Math.max(0, Math.min(index, target.length));
  await setFlowOrder(toFlowId, [...target.slice(0, clamped), scriptId, ...target.slice(clamped)]);

  if (fromFlowId !== toFlowId) {
    if (remaining.length === 0) {
      await deleteFlowOrder(fromFlowId);
      await deleteFlow(fromFlowId);
      return { removedEmptyFlow: true };
    }
    await setFlowOrder(fromFlowId, applyScriptOrder(remaining, orders[fromFlowId]).map((entry) => entry.id));
  }
  return { removedEmptyFlow: false };
}

/** Appends `script` to its Flow's order if it isn't placed yet — used after an import or a picker-created script. */
export async function ensurePlacedInFlow(script: FormScript): Promise<void> {
  const orders = await listFlowOrders([script.flowId]);
  const existing = orders[script.flowId] ?? [];
  if (existing.includes(script.id)) return;
  await setFlowOrder(script.flowId, [...existing, script.id]);
}

/**
 * Its own message type rather than reusing `scripts/refresh`: that one makes
 * every other open Options tab call `refreshAndSelect`, which *changes their
 * selection*. Reordering in one tab must not yank another tab's editor to a
 * different script.
 */
async function broadcast(flowId: string): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'scriptOrder/refresh', flowId } satisfies RuntimeMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Receiving end does not exist')) console.error('formaster: failed to broadcast scriptOrder/refresh', error);
  }
}
