import { z } from 'zod';
import { fileTemplateSchema, type FileTemplate } from './file-template';
import { flowSchema } from './flow';
import { formScriptSchema, type FormScript } from './script';

/**
 * A whole Flow, serialized to one file: the Flow record, every script in it,
 * and the File Templates those scripts actually reference.
 *
 * A single exported `FormScript` is no longer self-contained — it carries a
 * `flowId` and its file fields carry a `templateId`, both pointing at records
 * in other stores. Imported somewhere else, those references dangle. This
 * bundle is what makes a Flow movable.
 */
export const FLOW_BUNDLE_KIND = 'formaster-flow';

/**
 * `flowId` is optional here, unlike on a stored script: the bundle already
 * names its Flow once, so repeating it on every script is noise a
 * hand-written file shouldn't have to get right. When present it must agree
 * (see the refinement below) — silently reassigning a script to a different
 * Flow would be a far worse outcome than rejecting the file.
 */
const bundleScriptSchema = formScriptSchema.omit({ flowId: true }).extend({ flowId: z.string().min(1).optional() });

export const flowBundleSchema = z
  .object({
    kind: z.literal(FLOW_BUNDLE_KIND),
    schemaVersion: z.literal(1),
    flow: flowSchema,
    scripts: z.array(bundleScriptSchema).min(1, 'a flow bundle must contain at least one script'),
    fileTemplates: z.array(fileTemplateSchema).default([]),
  })
  .superRefine((bundle, ctx) => {
    bundle.scripts.forEach((script, index) => {
      if (script.flowId !== undefined && script.flowId !== bundle.flow.id) {
        ctx.addIssue({
          code: 'custom',
          message: `belongs to flow "${script.flowId}", but this bundle is for flow "${bundle.flow.id}"`,
          path: ['scripts', index, 'flowId'],
        });
      }
    });
  });

/** The bundle after normalization — every script's `flowId` filled in, so it's a plain `FormScript`. */
export interface FlowBundle {
  kind: typeof FLOW_BUNDLE_KIND;
  schemaVersion: 1;
  flow: z.infer<typeof flowSchema>;
  scripts: FormScript[];
  fileTemplates: FileTemplate[];
}

/** Throws a ZodError on invalid input, same contract as `parseFormScript`. */
export function parseFlowBundle(data: unknown): FlowBundle {
  const parsed = flowBundleSchema.parse(data);
  return {
    ...parsed,
    scripts: parsed.scripts.map((script) => ({ ...script, flowId: script.flowId ?? parsed.flow.id })),
  };
}

/**
 * Cheap shape test used to pick a parser *before* parsing. The import dialog
 * can't discriminate with a zod union: a union failure reports a single
 * `invalid_union` issue with an empty path, which would turn every "this
 * isn't a valid script" message into a useless generic one.
 */
export function isFlowBundleShape(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { kind?: unknown }).kind === FLOW_BUNDLE_KIND;
}

/** Every File Template id referenced by a `file` generator across `scripts`. */
export function collectReferencedTemplateIds(scripts: FormScript[]): Set<string> {
  const ids = new Set<string>();
  for (const script of scripts) {
    for (const step of script.steps) {
      if (step.type === 'field' && step.field.generator.kind === 'file') ids.add(step.field.generator.templateId);
    }
  }
  return ids;
}

/** Rewrites every `file` generator whose template was remapped on import (see `flow-bundle-store.ts`). */
export function remapTemplateIds(script: FormScript, remap: Map<string, string>): FormScript {
  if (remap.size === 0) return script;
  return {
    ...script,
    steps: script.steps.map((step) => {
      if (step.type !== 'field' || step.field.generator.kind !== 'file') return step;
      const replacement = remap.get(step.field.generator.templateId);
      if (!replacement) return step;
      return { ...step, field: { ...step.field, generator: { kind: 'file', templateId: replacement } } };
    }),
  };
}
