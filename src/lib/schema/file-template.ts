import { z } from 'zod';

/** Where a text layer's rendered text comes from. `flowVariable` resolves against `script.flowId` of whichever script is running the fill. */
export const textSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: z.string() }),
  z.object({ kind: z.literal('flowVariable'), key: z.string().min(1) }),
]);
export type TextSource = z.infer<typeof textSourceSchema>;

export const textLayerSchema = z.object({
  id: z.string().min(1).default(() => crypto.randomUUID()),
  /** Only meaningful for `format: 'pdf'` templates with more than one page; ignored for `png`. */
  pageIndex: z.number().int().nonnegative().default(0),
  x: z.number(),
  y: z.number(),
  maxWidthPx: z.number().positive().optional(),
  fontSizePx: z.number().positive().default(24),
  fontWeight: z.enum(['normal', 'bold']).default('normal'),
  color: z.string().default('#000000'),
  align: z.enum(['left', 'center', 'right']).default('left'),
  source: textSourceSchema,
});
export type TextLayer = z.infer<typeof textLayerSchema>;

export const fileTemplateBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('blank'), color: z.string().default('#ffffff') }),
  z.object({ kind: z.literal('image'), dataUrl: z.string().min(1) }),
  z.object({ kind: z.literal('pdf'), dataUrl: z.string().min(1) }),
]);
export type FileTemplateBackground = z.infer<typeof fileTemplateBackgroundSchema>;

/**
 * A reusable, global template (not scoped to a Flow) that renders to a real
 * `File` at fill time — see `src/lib/generators/file-generators/`. `png`
 * templates render on a real `<canvas>`; `pdf` templates render via `pdf-lib`
 * over an optional base PDF. `outputFilename` accepts `{{key}}` placeholders
 * resolved the same way as a `flowVariable` text layer.
 */
export const fileTemplateSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    name: z.string().min(1),
    format: z.enum(['png', 'pdf']),
    canvas: z.object({ width: z.number().positive(), height: z.number().positive() }).optional(),
    background: fileTemplateBackgroundSchema,
    textLayers: z.array(textLayerSchema).default([]),
    outputFilename: z.string().min(1),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine((template, ctx) => {
    if (template.format === 'png' && !template.canvas) {
      ctx.addIssue({ code: 'custom', message: "canvas is required when format is 'png'", path: ['canvas'] });
    }
    if (template.format === 'png' && template.background.kind === 'pdf') {
      ctx.addIssue({ code: 'custom', message: "background 'pdf' invalid when format is 'png'", path: ['background'] });
    }
    if (template.format === 'pdf' && template.background.kind === 'image') {
      ctx.addIssue({ code: 'custom', message: "background 'image' invalid when format is 'pdf'", path: ['background'] });
    }
  });
export type FileTemplate = z.infer<typeof fileTemplateSchema>;

export function createEmptyFileTemplate(name: string, format: FileTemplate['format']): FileTemplate {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    format,
    canvas: format === 'png' ? { width: 800, height: 600 } : undefined,
    background: { kind: 'blank', color: '#ffffff' },
    textLayers: [],
    outputFilename: format === 'png' ? 'document.png' : 'document.pdf',
    createdAt: now,
    updatedAt: now,
  };
}
