import { z } from 'zod';

// Without this, Zod probes for `new Function` support on first use to pick a
// faster validation codepath — harmless (wrapped in try/catch) but our CSP
// has no 'unsafe-eval', so the probe always throws and gets reported as a
// CSP violation in the console. `jitless` skips the probe entirely.
z.config({ jitless: true });

/**
 * A single selector candidate. Fields store several of these, ordered by
 * reliability, and the filler tries them in cascade until one resolves.
 */
export const selectorCandidateSchema = z.object({
  strategy: z.enum(['id', 'name', 'data-testid', 'aria-label', 'css', 'xpath']),
  value: z.string().min(1),
  /** Off by default only when the user explicitly disables it (e.g. a dynamically-generated id). */
  enabled: z.boolean().default(true),
});
export type SelectorCandidate = z.infer<typeof selectorCandidateSchema>;

export const fieldElementTypeSchema = z.enum([
  'text',
  'number',
  'email',
  'tel',
  'password',
  'url',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'checkbox',
  'radio',
  'select',
  'textarea',
  'range',
  'color',
  'custom',
]);
export type FieldElementType = z.infer<typeof fieldElementTypeSchema>;

export const builtinGeneratorIdSchema = z.enum([
  'cpf',
  'cnpj',
  'rg',
  'passport',
  'phoneBr',
  'cep',
  'fullName',
  'firstName',
  'lastName',
  'email',
  'birthdate',
  'addressStreet',
  'addressNumber',
  'addressComplement',
  'addressCity',
  'addressState',
  'addressNeighborhood',
  'fullAddress',
  'company',
  'uuid',
  'password',
  'integer',
  'decimal',
  'boolean',
  'lorem',
  'creditCardNumber',
  'creditCardExpiry',
  'creditCardCvc',
]);
export type BuiltinGeneratorId = z.infer<typeof builtinGeneratorIdSchema>;

/**
 * Declares one configurable knob a generator (built-in or custom) exposes —
 * rendered as a matching control (checkbox/number/select) next to the
 * generator picker in `FieldRow`. For custom generators, the author defines
 * this list themselves (see `customGeneratorSchema.optionsSchema` below);
 * for built-ins it's a static table in `src/lib/generators/option-fields.ts`.
 */
export const generatorOptionFieldSchema = z.discriminatedUnion('type', [
  z.object({ key: z.string().min(1), type: z.literal('boolean'), label: z.string().min(1), default: z.boolean() }),
  z.object({
    key: z.string().min(1),
    type: z.literal('number'),
    label: z.string().min(1),
    default: z.number(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
  }),
  z.object({
    key: z.string().min(1),
    type: z.literal('select'),
    label: z.string().min(1),
    default: z.string(),
    choices: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
  }),
]);
export type GeneratorOptionField = z.infer<typeof generatorOptionFieldSchema>;

/** How a field's value is produced at fill time. */
export const generatorRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('builtin'),
    id: builtinGeneratorIdSchema,
    options: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal('fixed'),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
  z.object({
    kind: z.literal('custom'),
    generatorId: z.string().min(1),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
]);
export type GeneratorRef = z.infer<typeof generatorRefSchema>;

export const fieldMappingSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  selectors: z.array(selectorCandidateSchema).min(1),
  elementType: fieldElementTypeSchema,
  generator: generatorRefSchema,
  options: z
    .object({
      radioValue: z.string().optional(),
      skip: z.boolean().optional(),
    })
    .optional(),
});
export type FieldMapping = z.infer<typeof fieldMappingSchema>;

/** A pause step in the fill sequence, reorderable alongside fields (e.g. to wait before the first field). */
export const delayStepSchema = z.object({
  type: z.literal('delay'),
  id: z.string().min(1),
  delayMs: z.number().nonnegative(),
});
export type DelayStep = z.infer<typeof delayStepSchema>;

export const fieldStepSchema = z.object({
  type: z.literal('field'),
  field: fieldMappingSchema,
});
export type FieldStep = z.infer<typeof fieldStepSchema>;

export const waitConditionSchema = z.enum(['enabled', 'visible', 'exists', 'checked']);
export type WaitCondition = z.infer<typeof waitConditionSchema>;

/**
 * A conditional pause: unlike `delay` (a fixed wait), this blocks the fill
 * sequence until an element matching `selectors` satisfies `condition` (or
 * `timeoutMs` elapses, in which case the fill just moves on) — for pages
 * where one field only unlocks once an earlier one is filled in (e.g. a
 * neighborhood `<select>` disabled until a CEP lookup resolves).
 */
export const waitForStepSchema = z.object({
  type: z.literal('waitFor'),
  id: z.string().min(1),
  selectors: z.array(selectorCandidateSchema).min(1),
  condition: waitConditionSchema.default('enabled'),
  timeoutMs: z.number().positive().default(5000),
  pollIntervalMs: z.number().positive().default(150),
});
export type WaitForStep = z.infer<typeof waitForStepSchema>;

/** One item in a script's ordered fill sequence — a field, a fixed pause, or a conditional wait. */
export const scriptStepSchema = z.discriminatedUnion('type', [fieldStepSchema, delayStepSchema, waitForStepSchema]);
export type ScriptStep = z.infer<typeof scriptStepSchema>;

/**
 * A user-authored generator function. `code` is the body of a function
 * `(helpers, options, fields) => value`, executed inside a QuickJS WASM VM
 * (see `src/lib/generators/quickjs-runner.ts`) — a real interpreted sandbox
 * with no access to the page, the extension, or any browser API.
 */
export const customGeneratorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string(),
  /** Optional knobs the generator's own code can read off `options.*`; see `generatorOptionFieldSchema`. */
  optionsSchema: z.array(generatorOptionFieldSchema).default([]),
});
export type CustomGenerator = z.infer<typeof customGeneratorSchema>;

export const formScriptSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  /** Match patterns, e.g. "*://example.com/signup*" */
  urlPatterns: z.array(z.string().min(1)).min(1),
  steps: z.array(scriptStepSchema),
  customGenerators: z.array(customGeneratorSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FormScript = z.infer<typeof formScriptSchema>;

export function parseFormScript(data: unknown): FormScript {
  return formScriptSchema.parse(data);
}

/** Turns a ZodError (or any error) into a short, human-readable message instead of a raw issues dump. */
export function formatValidationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'value';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}

export function createEmptyScript(name: string, urlPattern: string): FormScript {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    urlPatterns: [urlPattern],
    steps: [],
    customGenerators: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Deep-clones a script with a fresh id, "(Copy)" name, and fresh ids for
 * every nested field/generator/delay step — including remapping `custom`
 * generator references so they still point at the right (re-id'd) generator.
 */
export function duplicateScript(script: FormScript): FormScript {
  const generatorIdMap = new Map(script.customGenerators.map((generator) => [generator.id, crypto.randomUUID()]));
  const customGenerators = script.customGenerators.map((generator) => ({
    ...generator,
    id: generatorIdMap.get(generator.id)!,
  }));

  const steps: ScriptStep[] = script.steps.map((step) => {
    if (step.type === 'delay' || step.type === 'waitFor') return { ...step, id: crypto.randomUUID() };
    const generator: GeneratorRef =
      step.field.generator.kind === 'custom'
        ? { ...step.field.generator, generatorId: generatorIdMap.get(step.field.generator.generatorId) ?? step.field.generator.generatorId }
        : step.field.generator;
    return { type: 'field', field: { ...step.field, id: crypto.randomUUID(), generator } };
  });

  const now = new Date().toISOString();
  return {
    ...script,
    id: crypto.randomUUID(),
    name: `${script.name} (Copy)`,
    steps,
    customGenerators,
    createdAt: now,
    updatedAt: now,
  };
}
