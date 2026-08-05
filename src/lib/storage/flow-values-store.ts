import { createKeyedStore } from './keyed-store';

/** One named value a field published via `FieldMapping.options.saveAsFlowVariable`, plus when it was last written (surfaced in the "Flow variables" panel). */
interface FlowValueEntry {
  value: string;
  updatedAt: string;
}

type FlowValues = Record<string, FlowValueEntry>;

function store(flowId: string) {
  return createKeyedStore<FlowValues>(`formaster:flow-values:${flowId}`);
}

export async function getFlowValue(flowId: string, key: string): Promise<string | undefined> {
  const values = await store(flowId).get();
  return values?.[key]?.value;
}

export async function setFlowValue(flowId: string, key: string, value: string): Promise<void> {
  const values = (await store(flowId).get()) ?? {};
  values[key] = { value, updatedAt: new Date().toISOString() };
  await store(flowId).set(values);
}

/** All named values currently published in this Flow, for the "Flow variables" panel. */
export async function listFlowValues(flowId: string): Promise<FlowValues> {
  return (await store(flowId).get()) ?? {};
}

/**
 * Same values, flattened to plain `key -> value` — the shape handed to a
 * `fixed` generator's `{{key}}` interpolation and to a custom generator's
 * `flowVars` global, neither of which has any use for the timestamps.
 */
export async function getFlowVariables(flowId: string): Promise<Record<string, string>> {
  const values = await listFlowValues(flowId);
  return Object.fromEntries(Object.entries(values).map(([key, entry]) => [key, entry.value]));
}

export async function resetFlowValues(flowId: string): Promise<void> {
  await store(flowId).clear();
}
