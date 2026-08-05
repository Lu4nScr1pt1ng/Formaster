import type { FormScript } from './schema/script';

/**
 * Every key currently published by some field's `saveAsFlowVariable`, across
 * `scripts` — optionally narrowed to one Flow. Shared by the "Flow
 * variables" panel/autocomplete in `ScriptEditor` (scoped to one Flow) and
 * `FileTemplateEditor`'s orphan-key warning (unscoped — a template is global
 * and can be used from any Flow).
 */
export function collectSavedFlowVariableKeys(scripts: FormScript[], flowId?: string): string[] {
  const keys = new Set<string>();
  for (const script of scripts) {
    if (flowId !== undefined && script.flowId !== flowId) continue;
    for (const step of script.steps) {
      if (step.type === 'field' && step.field.options?.saveAsFlowVariable) {
        keys.add(step.field.options.saveAsFlowVariable.key);
      }
    }
  }
  return [...keys].sort();
}
