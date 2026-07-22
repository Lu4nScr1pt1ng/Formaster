import { browser } from 'wxt/browser';
import { formScriptSchema, type FormScript } from '../schema/script';

const STORAGE_KEY = 'formaster:scripts';

async function readAll(): Promise<FormScript[]> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = formScriptSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

async function writeAll(scripts: FormScript[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: scripts });
}

export async function listScripts(): Promise<FormScript[]> {
  return readAll();
}

export async function getScript(id: string): Promise<FormScript | undefined> {
  const scripts = await readAll();
  return scripts.find((script) => script.id === id);
}

export async function saveScript(script: FormScript): Promise<FormScript> {
  const scripts = await readAll();
  const index = scripts.findIndex((existing) => existing.id === script.id);
  const updated = { ...script, updatedAt: new Date().toISOString() };
  if (index === -1) {
    scripts.push(updated);
  } else {
    scripts[index] = updated;
  }
  await writeAll(scripts);
  return updated;
}

export async function deleteScript(id: string): Promise<void> {
  const scripts = await readAll();
  await writeAll(scripts.filter((script) => script.id !== id));
}

export function exportScript(script: FormScript): string {
  return JSON.stringify(script, null, 2);
}
