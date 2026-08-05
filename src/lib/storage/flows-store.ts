import { browser } from 'wxt/browser';
import type { RuntimeMessage } from '../messaging/types';
import { flowSchema, type Flow } from '../schema/flow';

// One `browser.storage.local` key per Flow (`formaster:flow:<id>`) — same
// rationale as `scripts-store.ts`: independent keys mean two extension
// contexts touching different Flows never race over a shared array.
const FLOW_KEY_PREFIX = 'formaster:flow:';

function flowKey(id: string): string {
  return `${FLOW_KEY_PREFIX}${id}`;
}

export async function listFlows(): Promise<Flow[]> {
  const all = await browser.storage.local.get(null);
  const flows: Flow[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(FLOW_KEY_PREFIX)) continue;
    const parsed = flowSchema.safeParse(value);
    if (parsed.success) flows.push(parsed.data);
  }
  return flows;
}

export async function getFlow(id: string): Promise<Flow | undefined> {
  const raw = await browser.storage.local.get(flowKey(id));
  const parsed = flowSchema.safeParse(raw[flowKey(id)]);
  return parsed.success ? parsed.data : undefined;
}

export async function saveFlow(flow: Flow): Promise<Flow> {
  const updated = { ...flow, updatedAt: new Date().toISOString() };
  await browser.storage.local.set({ [flowKey(updated.id)]: updated });
  await broadcastRefresh(updated.id);
  return updated;
}

export async function deleteFlow(id: string): Promise<void> {
  await browser.storage.local.remove(flowKey(id));
  await broadcastRefresh(id);
}

async function broadcastRefresh(flowId: string): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'flows/refresh', flowId } satisfies RuntimeMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Receiving end does not exist')) {
      console.error('formaster: failed to broadcast flows/refresh', error);
    }
  }
}
