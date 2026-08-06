import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures/extension';
import type { FormScript } from '../src/lib/schema/script';

function buildScript(name: string): FormScript {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: randomUUID(),
    name,
    flowId: randomUUID(),
    urlPatterns: ['*://example.com/*'],
    steps: [
      {
        type: 'field',
        field: {
          id: randomUUID(),
          label: 'Email',
          selectors: [{ id: randomUUID(), strategy: 'id', value: 'email', enabled: true }],
          elementType: 'email',
          generator: { kind: 'builtin', id: 'email' },
        },
      },
    ],
    customGenerators: [],
    createdAt: now,
    updatedAt: now,
  };
}

test('import → export → re-import round-trips a script exactly', async ({ openOptions }) => {
  const options = await openOptions();
  const original = buildScript('E2E round-trip script');

  // Import via file upload rather than typing into the CodeMirror pane —
  // CodeMirror's JSON mode auto-closes brackets/quotes, which corrupts hand-
  // typed JSON; a real file upload sidesteps that and is what a user
  // actually does with an exported script anyway.
  await options.getByRole('button', { name: 'Import' }).click();
  await options.locator('input[type="file"]').setInputFiles({
    name: 'script.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(options.locator('text=/Valid — "E2E round-trip script"/')).toBeVisible();
  // The dialog also accepts whole-flow bundles now; a plain script must not
  // be mistaken for one (see flow-import-export.spec.ts for that shape).
  await expect(options.locator('text=/Valid — flow/')).toHaveCount(0);
  await options.getByRole('button', { name: 'Import', exact: true }).last().click();

  // Scoped to the entries nested inside a Flow folder: a single-script
  // Flow's folder carries the script's own name, so a plain `nav button`
  // would match the folder too (and the Flow picker in the editor besides).
  await expect(options.locator('nav [role="group"] button', { hasText: original.name })).toBeVisible();
  await expect(options.locator('input[placeholder="Script name"]')).toHaveValue(original.name);

  const downloadPromise = options.waitForEvent('download');
  // `exact` because the sidebar's folder rows also carry an "Export flow"
  // button. The editor's own Export is a menu now — the script-only choice
  // is the one this round-trip is about.
  await options.getByRole('button', { name: 'Export', exact: true }).click();
  await options.getByRole('menuitem', { name: /This script only/ }).click();
  const download = await downloadPromise;
  const exportedText = await download.createReadStream().then(
    (stream) =>
      new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', reject);
      }),
  );
  const exported = JSON.parse(exportedText) as FormScript;

  // The export is exactly what got saved — same id, same shape — proving
  // export doesn't silently drop or mutate anything on the way out.
  expect(exported.id).toBe(original.id);
  expect(exported.name).toBe(original.name);
  expect(exported.urlPatterns).toEqual(original.urlPatterns);
  expect(exported.steps).toEqual(original.steps);

  // Delete it, then re-import the exported file — if this doesn't collide
  // (the id is gone now) and produces the same content, the round trip is
  // proven both directions, not just export.
  await options.getByRole('button', { name: 'Delete' }).click();
  await options.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await expect(options.locator('nav [role="group"] button', { hasText: original.name })).toHaveCount(0);

  await options.getByRole('button', { name: 'Import' }).click();
  await options.locator('input[type="file"]').setInputFiles({
    name: 'script.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportedText),
  });
  await expect(options.locator('text=/Valid — "E2E round-trip script"/')).toBeVisible();
  await options.getByRole('button', { name: 'Import', exact: true }).last().click();

  await expect(options.locator('input[placeholder="Script name"]')).toHaveValue(original.name);
  await expect(options.locator('text=Fields (1)')).toBeVisible();
});

/**
 * The Replace branch parks the pending script in `$state` before writing it,
 * and `$state` deep-proxies arrays — Chrome turns a proxied array into
 * `{"0": …}` inside `storage.local`, so the record fails `safeParse` on the
 * next read and vanishes. The round-trip test above deletes before
 * re-importing, so it never takes this branch; this does.
 */
test('replacing a colliding script keeps its fields intact', async ({ openOptions, serviceWorker }) => {
  const options = await openOptions();
  const original = buildScript('E2E replace target');
  const upload = async () => {
    await options.getByRole('button', { name: 'Import' }).click();
    await options.locator('input[type="file"]').setInputFiles({
      name: 'script.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(original)),
    });
    await options.getByRole('button', { name: 'Import', exact: true }).last().click();
  };

  await upload();
  await expect(options.locator('text=Fields (1)')).toBeVisible();

  // Same id again → the collision path.
  await upload();
  await options.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(options.locator('text=Fields (1)')).toBeVisible();

  // Still a real array in storage, so the script survives the next read.
  const stored = await serviceWorker.evaluate(
    async (key) => (await chrome.storage.local.get(key))[key],
    `formaster:script:${original.id}`,
  );
  expect(Array.isArray((stored as { steps: unknown }).steps)).toBe(true);
  expect(Array.isArray((stored as { urlPatterns: unknown }).urlPatterns)).toBe(true);
  await options.reload();
  await expect(options.locator('nav [role="group"] button', { hasText: original.name })).toBeVisible();
});

test('importing invalid JSON is rejected with a clear error, not silently accepted', async ({ openOptions }) => {
  const options = await openOptions();
  await options.getByRole('button', { name: 'Import' }).click();
  await options.locator('input[type="file"]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ "not": "a valid script" }'),
  });

  const importButton = options.getByRole('button', { name: 'Import', exact: true }).last();
  await expect(importButton).toBeDisabled();
  await expect(options.locator('text=/name:|Invalid JSON/')).toBeVisible();
});
