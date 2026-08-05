import type { Worker } from '@playwright/test';
import type { FileTemplate, TextLayer } from '../../src/lib/schema/file-template';
import type { Flow } from '../../src/lib/schema/flow';
import type { FieldMapping, FormScript, GeneratorRef, ScriptStep } from '../../src/lib/schema/script';
import type { FillResult } from '../../src/lib/filler/fill-script';

/**
 * Builders + storage/run helpers shared by the Flow specs. These tests are
 * about *cross-script, cross-page* behavior, so almost every one of them
 * needs several scripts wired to the same Flow — spelling out a full
 * `FormScript` literal each time would bury the one line that differs.
 *
 * Scripts are seeded straight into `browser.storage.local` and run by
 * sending `fill/run` to the content script — the exact message the popup's
 * Run button sends. A real browser-action popup isn't drivable by
 * Playwright at all (see playwright.config.ts), so this is both the closest
 * thing to that path and the mechanism actually under test.
 */

export interface FieldSpec {
  id: string;
  /** Targeted by `#id` on the fixture pages. */
  selector: string;
  generator: GeneratorRef;
  elementType?: FieldMapping['elementType'];
  label?: string;
  saveAs?: string;
  skip?: boolean;
}

export function field(spec: FieldSpec): ScriptStep {
  const options: FieldMapping['options'] = {};
  if (spec.saveAs !== undefined) options.saveAsFlowVariable = { key: spec.saveAs };
  if (spec.skip !== undefined) options.skip = spec.skip;

  return {
    type: 'field',
    field: {
      id: spec.id,
      label: spec.label,
      selectors: [{ id: `sel-${spec.id}`, strategy: 'id', value: spec.selector, enabled: true }],
      elementType: spec.elementType ?? 'text',
      generator: spec.generator,
      ...(Object.keys(options).length > 0 ? { options } : {}),
    },
  };
}

export function script(spec: {
  id: string;
  flowId: string;
  steps: ScriptStep[];
  name?: string;
  customGenerators?: FormScript['customGenerators'];
}): FormScript {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: spec.id,
    name: spec.name ?? spec.id,
    flowId: spec.flowId,
    urlPatterns: ['*://*/*'],
    steps: spec.steps,
    customGenerators: spec.customGenerators ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export function flow(id: string, name = id): Flow {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id, name, createdAt: now, updatedAt: now };
}

export function pngTemplate(spec: {
  id: string;
  layers: Array<Pick<TextLayer, 'source'> & Partial<TextLayer>>;
  outputFilename?: string;
  name?: string;
}): FileTemplate {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: spec.id,
    name: spec.name ?? spec.id,
    format: 'png',
    canvas: { width: 320, height: 120 },
    background: { kind: 'blank', color: '#ffffff' },
    textLayers: spec.layers.map((layer, index) => ({
      id: `${spec.id}-layer-${index}`,
      pageIndex: 0,
      x: 10,
      y: 40 + index * 30,
      fontSizePx: 20,
      fontWeight: 'normal',
      color: '#000000',
      align: 'left',
      ...layer,
    })),
    outputFilename: spec.outputFilename ?? 'doc.png',
    createdAt: now,
    updatedAt: now,
  };
}

export function pdfTemplate(spec: { id: string; layers: Array<Pick<TextLayer, 'source'> & Partial<TextLayer>>; outputFilename?: string }): FileTemplate {
  return { ...pngTemplate(spec), format: 'pdf', canvas: undefined, outputFilename: spec.outputFilename ?? 'doc.pdf' };
}

type Seedable = { flows?: Flow[]; scripts?: FormScript[]; templates?: FileTemplate[] };

export async function seed(serviceWorker: Worker, entries: Seedable): Promise<void> {
  await serviceWorker.evaluate(async ({ flows, scripts, templates }) => {
    const record: Record<string, unknown> = {};
    for (const entry of flows ?? []) record[`formaster:flow:${entry.id}`] = entry;
    for (const entry of scripts ?? []) record[`formaster:script:${entry.id}`] = entry;
    for (const entry of templates ?? []) record[`formaster:file-template:${entry.id}`] = entry;
    await chrome.storage.local.set(record);
  }, entries);
}

/** Runs `script` against whichever open tab is at `url` — one page of a multi-page flow. */
export async function runOn(serviceWorker: Worker, script: FormScript, url: string): Promise<FillResult[]> {
  return serviceWorker.evaluate(
    async ({ script, url }) => {
      const [tab] = await chrome.tabs.query({ url });
      return chrome.tabs.sendMessage(tab.id!, { type: 'fill/run', script }) as Promise<unknown>;
    },
    { script, url },
  ) as Promise<FillResult[]>;
}

/** The Flow's published named variables, flattened to `key -> value`. */
export async function flowValues(serviceWorker: Worker, flowId: string): Promise<Record<string, string>> {
  return serviceWorker.evaluate(async (flowId) => {
    const key = `formaster:flow-values:${flowId}`;
    const stored = (await chrome.storage.local.get(key))[key] as Record<string, { value: string }> | undefined;
    return Object.fromEntries(Object.entries(stored ?? {}).map(([k, entry]) => [k, entry.value]));
  }, flowId);
}

/** The Flow's persisted correlated-identity blob (see `flow-identity-store.ts`). */
export async function flowIdentity(serviceWorker: Worker, flowId: string): Promise<Record<string, unknown> | undefined> {
  return serviceWorker.evaluate(async (flowId) => {
    const key = `formaster:flow-identity:${flowId}`;
    return (await chrome.storage.local.get(key))[key] as Record<string, unknown> | undefined;
  }, flowId);
}

/**
 * Pins a Flow's identity to a person whose names can't occur naturally —
 * neither string is in `person.ts`'s name tables. That turns "did the
 * persisted identity actually get loaded?" into an exact string assertion
 * instead of a probabilistic "the two runs happened to match", and makes
 * the isolation check ("a *different* Flow must not see this person")
 * deterministic rather than a 1-in-N coin flip.
 */
export async function seedIdentity(serviceWorker: Worker, flowId: string, person: { firstName: string; lastName: string }): Promise<void> {
  await serviceWorker.evaluate(
    async ({ flowId, person }) => {
      await chrome.storage.local.set({
        [`formaster:flow-identity:${flowId}`]: { 'person:br': { ...person, gender: 'female' } },
      });
    },
    { flowId, person },
  );
}

/** Reads a Playwright download into a string — exports are only assertable once the stream is drained. */
export async function readDownload(download: { createReadStream(): Promise<NodeJS.ReadableStream> }): Promise<string> {
  const stream = await download.createReadStream();
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk as Buffer));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

export async function getStored<T>(serviceWorker: Worker, key: string): Promise<T | undefined> {
  return serviceWorker.evaluate(async (key) => (await chrome.storage.local.get(key))[key], key) as Promise<T | undefined>;
}

/** Wipes everything, so an import can be proven to restore a Flow from nothing. */
export async function clearStorage(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async () => chrome.storage.local.clear());
}

export async function storageKeys(serviceWorker: Worker, prefix: string): Promise<string[]> {
  return serviceWorker.evaluate(async (prefix) => {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all).filter((key) => key.startsWith(prefix));
  }, prefix);
}
