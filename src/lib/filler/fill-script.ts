import type { FieldMapping, FormScript } from '../schema/script';
import { runBuiltinGenerator } from '../generators';
import { resolveSelectorCandidates } from '../selector/resolve-selector';
import { setCheckbox, setNativeInputValue, setRadioGroup, setSelectValue, simulateTyping } from './set-value';

export type FieldValueContext = Record<string, string | number | boolean>;

export type CustomGeneratorRunner = (
  generatorId: string,
  script: FormScript,
  context: FieldValueContext,
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

  for (const step of script.steps) {
    if (step.type === 'delay') {
      await sleep(step.delayMs);
      continue;
    }
    const field = step.field;
    if (field.options?.skip) continue;
    const { result, value } = await fillField(field, script, runCustomGenerator, context);
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
): Promise<{ result: FillResult; value?: string | number | boolean }> {
  const element = resolveSelectorCandidates(field.selectors);
  if (!element) {
    return { result: { fieldId: field.id, status: 'not-found' } };
  }

  try {
    const value = await resolveValue(field, script, runCustomGenerator, context);
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
): Promise<string | number | boolean> {
  switch (field.generator.kind) {
    case 'builtin':
      return runBuiltinGenerator(field.generator.id, field.generator.options);
    case 'fixed':
      return field.generator.value;
    case 'custom':
      return runCustomGenerator(field.generator.generatorId, script, context);
  }
}

async function applyValue(element: Element, field: FieldMapping, value: string | number | boolean): Promise<void> {
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
