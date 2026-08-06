import { browser } from 'wxt/browser';
import { downloadJson, slugify } from '../export/download-json';
import type { RuntimeMessage } from '../messaging/types';
import type { FileTemplate } from '../schema/file-template';
import type { Flow } from '../schema/flow';
import { FLOW_BUNDLE_KIND, collectReferencedTemplateIds, remapTemplateIds, type FlowBundle } from '../schema/flow-bundle';
import type { FormScript } from '../schema/script';
import { deepEqualIgnoring } from '../stable-stringify';
import { listFileTemplates } from './file-templates-store';
import { getFlow } from './flows-store';
import { listScripts } from './scripts-store';

const FLOW_KEY_PREFIX = 'formaster:flow:';
const SCRIPT_KEY_PREFIX = 'formaster:script:';
const FILE_TEMPLATE_KEY_PREFIX = 'formaster:file-template:';

export interface FlowBundleBuildResult {
  bundle: FlowBundle;
  /** Templates a field points at that no longer exist — worth telling the user before they ship the file. */
  missingTemplateIds: string[];
}

/**
 * Collects a Flow and everything it needs into one serializable object.
 *
 * Reads stored state only: the Flow folder in the sidebar lists what's saved,
 * so exporting from it exports what's saved. Unsaved editor edits are not
 * included, and the caller says so in its toast.
 */
export async function buildFlowBundle(flowId: string): Promise<FlowBundleBuildResult> {
  const [flow, allScripts, allTemplates] = await Promise.all([getFlow(flowId), listScripts(), listFileTemplates()]);
  const scripts = allScripts.filter((script) => script.flowId === flowId);
  if (scripts.length === 0) throw new Error('This flow has no scripts to export.');

  const referenced = collectReferencedTemplateIds(scripts);
  const byId = new Map(allTemplates.map((template) => [template.id, template]));
  const fileTemplates: FileTemplate[] = [];
  const missingTemplateIds: string[] = [];
  for (const id of referenced) {
    const template = byId.get(id);
    if (template) fileTemplates.push(template);
    else missingTemplateIds.push(id);
  }

  return {
    bundle: {
      kind: FLOW_BUNDLE_KIND,
      schemaVersion: 1,
      // A Flow record may not exist yet for a never-saved Flow; fall back to
      // one named after its first script, matching what the sidebar shows.
      flow: flow ?? { schemaVersion: 1, id: flowId, name: scripts[0].name, createdAt: scripts[0].createdAt, updatedAt: scripts[0].updatedAt },
      scripts,
      fileTemplates,
    },
    missingTemplateIds,
  };
}

export function downloadFlowBundle(bundle: FlowBundle): void {
  downloadJson(bundle, `${slugify(bundle.flow.name, 'flow')}.flow.json`);
}

/** What importing a bundled template will do to local storage. */
export type TemplateDisposition = 'new' | 'reused' | 'remapped';

export interface PlannedTemplate {
  template: FileTemplate;
  disposition: TemplateDisposition;
  /** The id the bundle used, which differs from `template.id` when remapped. */
  sourceId: string;
}

export interface FlowBundlePlan {
  flow: Flow;
  /** Already normalized: `flowId` filled and any remapped `templateId` rewritten. */
  scripts: FormScript[];
  templates: PlannedTemplate[];
  collisions: { flow: Flow | null; scripts: Array<{ id: string; name: string }> };
  /** Non-blocking notes to show before the user commits to the import. */
  warnings: string[];
}

/**
 * Works out exactly what an import would write, without writing anything.
 *
 * Split from `applyFlowBundlePlan` so the confirmation dialog and the write
 * can't disagree: the dialog renders this plan, and applying it writes
 * precisely what was rendered.
 *
 * `extraScripts` is the caller's in-memory list, which includes unsaved
 * drafts storage has never seen — without it, a collision against a draft
 * the user is still editing would go unreported.
 */
export async function planFlowBundleImport(bundle: FlowBundle, extraScripts: FormScript[] = []): Promise<FlowBundlePlan> {
  const [storedFlow, storedScripts, storedTemplates] = await Promise.all([getFlow(bundle.flow.id), listScripts(), listFileTemplates()]);

  const knownScripts = new Map<string, FormScript>();
  for (const script of [...storedScripts, ...extraScripts]) knownScripts.set(script.id, script);
  const storedTemplatesById = new Map(storedTemplates.map((template) => [template.id, template]));

  const templates: PlannedTemplate[] = [];
  const remap = new Map<string, string>();
  const warnings: string[] = [];

  for (const incoming of bundle.fileTemplates) {
    const existing = storedTemplatesById.get(incoming.id);
    if (!existing) {
      templates.push({ template: incoming, disposition: 'new', sourceId: incoming.id });
      continue;
    }
    if (isSameTemplate(existing, incoming)) {
      // Byte-identical to what's already here — re-importing your own
      // unchanged flow should not duplicate anything.
      templates.push({ template: existing, disposition: 'reused', sourceId: incoming.id });
      continue;
    }
    // A File Template is global: other Flows may render documents from this
    // exact id. Overwriting it would silently change their output, and they
    // aren't mentioned anywhere in this bundle. Import a copy instead.
    const replacementId = crypto.randomUUID();
    remap.set(incoming.id, replacementId);
    templates.push({
      template: { ...incoming, id: replacementId, name: `${incoming.name} (imported)` },
      disposition: 'remapped',
      sourceId: incoming.id,
    });
    warnings.push(
      `A different file template already uses the id of "${incoming.name}", so it was imported as "${incoming.name} (imported)" — the existing one is untouched.`,
    );
  }

  const scripts = bundle.scripts.map((script) => remapTemplateIds(script, remap));

  const bundledTemplateIds = new Set(bundle.fileTemplates.map((template) => template.id));
  for (const id of collectReferencedTemplateIds(bundle.scripts)) {
    if (!bundledTemplateIds.has(id) && !storedTemplatesById.has(id)) {
      warnings.push(`A field points at a file template ("${id}") this bundle doesn't include — that field will fail until you pick a template.`);
    }
  }

  return {
    flow: bundle.flow,
    scripts,
    templates,
    collisions: {
      flow: storedFlow ?? null,
      scripts: scripts.filter((script) => knownScripts.has(script.id)).map((script) => ({ id: script.id, name: knownScripts.get(script.id)!.name })),
    },
    warnings,
  };
}

export function planHasCollisions(plan: FlowBundlePlan): boolean {
  return plan.collisions.flow !== null || plan.collisions.scripts.length > 0;
}

/**
 * Writes the plan in a single `storage.local.set`.
 *
 * One call rather than one per entity for two reasons: it's applied
 * atomically, so a quota failure can't leave a half-imported Flow whose
 * scripts point at templates that never landed; and each individual write
 * would broadcast a refresh, making every open extension page re-read *all*
 * of storage — including multi-MB base64 template backgrounds — N+M+1 times.
 */
export async function applyFlowBundlePlan(plan: FlowBundlePlan): Promise<void> {
  const now = new Date().toISOString();
  const entries: Record<string, unknown> = {
    [`${FLOW_KEY_PREFIX}${plan.flow.id}`]: { ...plan.flow, updatedAt: now },
  };
  for (const script of plan.scripts) entries[`${SCRIPT_KEY_PREFIX}${script.id}`] = { ...script, updatedAt: now };
  for (const planned of plan.templates) {
    // A reused template is already in storage, unchanged — writing it back
    // would only bump its timestamp.
    if (planned.disposition === 'reused') continue;
    entries[`${FILE_TEMPLATE_KEY_PREFIX}${planned.template.id}`] = { ...planned.template, updatedAt: now };
  }

  try {
    await browser.storage.local.set(entries);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/quota/i.test(message)) {
      throw new Error('Browser storage is full — this flow could not be imported. Delete an unused flow or file template and try again.');
    }
    throw error;
  }

  // One broadcast per store rather than one per record: every listener
  // either ignores the id or uses it only to decide what to select.
  await broadcast({ type: 'flows/refresh', flowId: plan.flow.id });
  await broadcast({ type: 'scripts/refresh', scriptId: plan.scripts[0].id });
  if (plan.templates.some((planned) => planned.disposition !== 'reused')) {
    await broadcast({ type: 'fileTemplates/refresh', templateId: plan.templates[0].template.id });
  }
}

async function broadcast(message: RuntimeMessage): Promise<void> {
  try {
    await browser.runtime.sendMessage(message);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (!text.includes('Receiving end does not exist')) console.error('formaster: failed to broadcast after flow import', error);
  }
}

/** Content equality ignoring timestamps — see `stable-stringify.ts` for why a plain `JSON.stringify` compare isn't enough. */
function isSameTemplate(a: FileTemplate, b: FileTemplate): boolean {
  return deepEqualIgnoring(a, b, ['createdAt', 'updatedAt']);
}
