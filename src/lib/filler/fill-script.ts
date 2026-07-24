import type { FieldMapping, FormScript, WaitForStep } from '../schema/script';
import { runBuiltinGenerator, type GeneratorRunContext } from '../generators';
import { resolveSelectorCandidates } from '../selector/resolve-selector';
import { setCheckbox, setNativeInputValue, setRadioGroup, setSelectValue, simulateTyping } from './set-value';

export type FieldValueContext = Record<string, string | number | boolean>;

export type CustomGeneratorRunner = (
  generatorId: string,
  options: Record<string, unknown> | undefined,
  script: FormScript,
  context: FieldValueContext,
  generatorRunContext: GeneratorRunContext,
) => Promise<string | number | boolean>;

export interface FillResult {
  fieldId: string;
  status: 'filled' | 'not-found' | 'error';
  message?: string;
}

/** camelCase key derived from a field's label, so generator code can read `fields.firstName`. */
export function fieldContextKey(field: Pick<FieldMapping, 'label' | 'elementType' | 'id'>): string {
  return toCamelKey(field.label ?? '') || toCamelKey(field.elementType) || field.id;
}

function toCamelKey(text: string): string {
  const words = text
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  return words.map((word, index) => (index === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase())).join('');
}

export async function fillScript(script: FormScript, runCustomGenerator: CustomGeneratorRunner): Promise<FillResult[]> {
  const results: FillResult[] = [];
  const context: FieldValueContext = {};
  // Created once per run and shared by every builtin generator call below,
  // so related fields (e.g. cep + city + state + neighborhood) resolve to
  // the same underlying record instead of each picking independently.
  const generatorRunContext: GeneratorRunContext = {};

  for (const step of script.steps) {
    if (step.type === 'delay') {
      await sleep(step.delayMs);
      continue;
    }
    if (step.type === 'waitFor') {
      await waitForCondition(step);
      continue;
    }
    const field = step.field;
    if (field.options?.skip) continue;
    const { result, value } = await fillField(field, script, runCustomGenerator, context, generatorRunContext);
    results.push(result);
    if (value !== undefined) {
      context[fieldContextKey(field)] = value;
    }
  }
  return results;
}

async function fillField(
  field: FieldMapping,
  script: FormScript,
  runCustomGenerator: CustomGeneratorRunner,
  context: FieldValueContext,
  generatorRunContext: GeneratorRunContext,
): Promise<{ result: FillResult; value?: string | number | boolean }> {
  const element = resolveSelectorCandidates(field.selectors);
  if (!element) {
    return { result: { fieldId: field.id, status: 'not-found' } };
  }

  try {
    const value = await resolveValue(field, script, runCustomGenerator, context, generatorRunContext);
    await applyValue(element, field, value);
    return { result: { fieldId: field.id, status: 'filled' }, value };
  } catch (error) {
    return {
      result: { fieldId: field.id, status: 'error', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

async function resolveValue(
  field: FieldMapping,
  script: FormScript,
  runCustomGenerator: CustomGeneratorRunner,
  context: FieldValueContext,
  generatorRunContext: GeneratorRunContext,
): Promise<string | number | boolean> {
  switch (field.generator.kind) {
    case 'builtin':
      return runBuiltinGenerator(field.generator.id, field.generator.options, generatorRunContext);
    case 'fixed':
      return field.generator.value;
    case 'custom':
      return runCustomGenerator(field.generator.generatorId, field.generator.options, script, context, generatorRunContext);
  }
}

/** Exported for reuse by the single-field "Fill this field" context-menu action — it has no full FieldMapping, just an elementType. */
export async function applyValue(
  element: Element,
  field: Pick<FieldMapping, 'elementType' | 'options'>,
  value: string | number | boolean,
): Promise<void> {
  switch (field.elementType) {
    case 'checkbox':
      setCheckbox(element as HTMLInputElement, Boolean(value));
      return;
    case 'radio':
      setRadioGroup(element as HTMLInputElement, field.options?.radioValue ?? String(value));
      return;
    case 'select':
      setSelectValue(element as HTMLSelectElement, String(value));
      return;
    case 'custom':
      await simulateTyping(element as HTMLElement, String(value));
      return;
    default:
      setNativeInputValue(element as HTMLInputElement | HTMLTextAreaElement, String(value));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls for the target element to satisfy `condition`, up to `timeoutMs`.
 * Best-effort: on timeout it just falls through, same as a field the
 * selector can't resolve — a page that never unlocks the field shouldn't
 * abort every step after it.
 */
async function waitForCondition(step: WaitForStep): Promise<void> {
  const deadline = Date.now() + step.timeoutMs;
  do {
    const element = resolveSelectorCandidates(step.selectors);
    if (element && conditionMet(element, step.condition)) return;
    await sleep(step.pollIntervalMs);
  } while (Date.now() < deadline);
}

function conditionMet(element: Element, condition: WaitForStep['condition']): boolean {
  switch (condition) {
    case 'exists':
      return true;
    case 'enabled':
      return !('disabled' in element && (element as HTMLInputElement).disabled);
    case 'checked':
      return Boolean('checked' in element && (element as HTMLInputElement).checked);
    case 'visible':
      return isVisible(element);
  }
}

function isVisible(element: Element): boolean {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
