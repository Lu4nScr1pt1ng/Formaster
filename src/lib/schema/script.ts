import { z } from 'zod';

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
  'addressCity',
  'addressState',
  'company',
  'uuid',
  'integer',
  'decimal',
  'boolean',
  'lorem',
]);
export type BuiltinGeneratorId = z.infer<typeof builtinGeneratorIdSchema>;

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

/** One item in a script's ordered fill sequence — either a field to fill or a pause. */
export const scriptStepSchema = z.discriminatedUnion('type', [fieldStepSchema, delayStepSchema]);
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
    if (step.type === 'delay') return { ...step, id: crypto.randomUUID() };
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
