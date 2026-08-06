import type { FieldMapping, FormScript, WaitForStep } from '../schema/script';
import { runBuiltinGenerator, type GeneratorRunContext } from '../generators';
import { renderTemplateById } from '../generators/file-generators';
import { interpolateFlowVariables } from '../flow-variables';
import { resolveSelectorCandidates } from '../selector/resolve-selector';
import { getFlowVariables, setFlowValue } from '../storage/flow-values-store';
import { setCheckbox, setFileInputValue, setNativeInputValue, setRadioGroup, setSelectValue, simulateTyping } from './set-value';

export type FieldValueContext = Record<string, string | number | boolean>;
export type FieldValue = string | number | boolean | File;
/** Named flow variables visible to the running script — see `flow-variables.ts`. */
export type FlowVariables = Record<string, string>;

const FILE_RENDER_TIMEOUT_MS = 8000;

/**
 * Runs generator code wherever QuickJS is available — the background, in a
 * real fill. Takes the **code**, not a generator id: generators live on a
 * script *and* on a File Template now, so resolving the id is this module's
 * job rather than something each caller repeats against `script.customGenerators`.
 */
export type CustomGeneratorRunner = (
  code: string,
  options: Record<string, unknown> | undefined,
  context: FieldValueContext,
  generatorRunContext: GeneratorRunContext,
  flowVars: FlowVariables,
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
  // Scoped to this one run and deliberately not persisted anywhere: it's what
  // lets related builtins inside a single fill agree with each other (cep +
  // city + state + neighborhood, or fullName + email), and nothing more.
  //
  // Carrying it across scripts would mean a Flow quietly holding a person and
  // an address nobody asked it to hold. Anything that *should* outlive a
  // single run is published explicitly as a named flow variable instead — so
  // what crosses a page boundary is exactly what a field opted into
  // publishing, visible in the Flow variables panel and nowhere else.
  const generatorRunContext: GeneratorRunContext = {};
  // Seeded from what earlier scripts in this Flow already published, then
  // kept up to date in place as this run publishes more (see `fillField`) —
  // so a `{{key}}` or `flowVars.key` can read either a value from a previous
  // page or one a field a few steps above just produced, with no reload.
  const flowVars: FlowVariables = await getFlowVariables(script.flowId);

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
    const { result, value } = await fillField(field, script, runCustomGenerator, context, generatorRunContext, flowVars);
    results.push(result);
    if (value !== undefined && !(value instanceof File)) {
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
  flowVars: FlowVariables,
): Promise<{ result: FillResult; value?: FieldValue }> {
  const element = resolveSelectorCandidates(field.selectors);
  if (!element) {
    return { result: { fieldId: field.id, status: 'not-found' } };
  }

  try {
    const value = await resolveValue(field, script, runCustomGenerator, context, generatorRunContext, flowVars);
    await applyValue(element, field, value);
    if (field.options?.saveAsFlowVariable && !(value instanceof File)) {
      const key = field.options.saveAsFlowVariable.key;
      await setFlowValue(script.flowId, key, String(value));
      // Also into this run's live map, not just storage — a `{{key}}` or
      // `flowVars.key` a few steps below must see it without re-reading.
      flowVars[key] = String(value);
    }
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
  flowVars: FlowVariables,
): Promise<FieldValue> {
  // Bound to a local first: narrowing a property of a parameter doesn't
  // survive into the `find` closure below.
  const ref = field.generator;
  switch (ref.kind) {
    case 'builtin':
      return runBuiltinGenerator(ref.id, ref.options, generatorRunContext);
    case 'fixed':
      // Only strings can carry a `{{key}}` placeholder; a numeric/boolean
      // fixed value passes through untouched rather than being stringified.
      return typeof ref.value === 'string' ? interpolateFlowVariables(ref.value, flowVars) : ref.value;
    case 'custom': {
      // Resolved here rather than by the runner, which now takes code: a
      // template's generators live on the template, so the runner can't know
      // which list an id belongs to.
      const generator = script.customGenerators.find((entry) => entry.id === ref.generatorId);
      if (!generator) throw new Error(`Custom generator "${ref.generatorId}" not found`);
      return runCustomGenerator(generator.code, ref.options, context, generatorRunContext, flowVars);
    }
    case 'file':
      return renderFileWithTimeout(ref.templateId, script, runCustomGenerator, context, generatorRunContext, flowVars);
  }
}

// The QuickJS watchdog (execution timeout + interrupt handler) has no reach
// here — file rendering runs as real DOM/WASM code (Canvas, pdf-lib), not
// inside that sandbox — so it gets its own, simpler wall-clock timeout. It
// covers the whole render, generator-backed text layers included: a slow
// layer and a slow canvas are the same wait from the user's side.
function renderFileWithTimeout(
  templateId: string,
  script: FormScript,
  runCustomGenerator: CustomGeneratorRunner,
  context: FieldValueContext,
  generatorRunContext: GeneratorRunContext,
  flowVars: FlowVariables,
): Promise<File> {
  return Promise.race([
    renderTemplateById(templateId, {
      flowVars,
      runContext: generatorRunContext,
      // The document's text layers draw on exactly what this script's fields
      // draw on: its own generators, the values filled so far, this Flow's
      // variables, and the run's identity.
      customGenerators: script.customGenerators,
      runCustom: (code, options) => runCustomGenerator(code, options, context, generatorRunContext, flowVars),
    }),
    new Promise<File>((_, reject) => setTimeout(() => reject(new Error('Generating the file timed out')), FILE_RENDER_TIMEOUT_MS)),
  ]);
}

/** Exported for reuse by the single-field "Fill this field" context-menu action — it has no full FieldMapping, just an elementType. */
export async function applyValue(element: Element, field: Pick<FieldMapping, 'elementType' | 'options'>, value: FieldValue): Promise<void> {
  switch (field.elementType) {
    case 'file':
      setFileInputValue(element as HTMLInputElement, value as File);
      return;
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
