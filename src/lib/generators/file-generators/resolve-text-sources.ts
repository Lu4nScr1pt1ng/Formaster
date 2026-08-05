import { extractFlowVariableKeys, flowVariableMissingMessage, interpolateFlowVariables } from '../../flow-variables';
import { getFlowValue } from '../../storage/flow-values-store';
import type { TextSource } from '../../schema/file-template';

/**
 * Resolves a text layer's source against `flowId` — throws (never returns
 * empty text silently) when a variable hasn't been published yet.
 *
 * A `flowVariable` source is the whole layer: one key, one value. A
 * `literal` may still splice variables in with `{{key}}`, the same syntax
 * `outputFilename` uses — that's the only way to get more than one value
 * onto a single line ("Nome: {{nome}} {{sobrenome}}"), which a one-key
 * source can't express.
 */
export async function resolveTextSource(source: TextSource, flowId: string): Promise<string> {
  if (source.kind === 'literal') return interpolate(source.value, flowId);
  const value = await getFlowValue(flowId, source.key);
  if (value === undefined) throw new Error(flowVariableMissingMessage(source.key));
  return value;
}

/** Resolves `{{key}}` placeholders in `FileTemplate.outputFilename` against the same Flow variables a `flowVariable` text layer reads. */
export async function resolveOutputFilename(template: string, flowId: string): Promise<string> {
  return interpolate(template, flowId);
}

async function interpolate(text: string, flowId: string): Promise<string> {
  const keys = extractFlowVariableKeys(text);
  if (keys.length === 0) return text;
  const values: Record<string, string | undefined> = {};
  for (const key of keys) values[key] = await getFlowValue(flowId, key);
  return interpolateFlowVariables(text, values);
}
