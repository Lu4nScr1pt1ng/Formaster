import { test, expect } from './fixtures/extension';
import { field, flow, script, seed } from './fixtures/flow-builders';

/**
 * The sidebar treats a Flow as a folder holding its scripts, and follows the
 * open editor's *unsaved* edits: renaming a script, or moving it to another
 * Flow, has to be visible in the list as it's typed — not only after Save.
 */

const textScript = (id: string, flowId: string, name: string) =>
  script({ id, flowId, name, steps: [field({ id: `${id}-f`, selector: 'full-name', generator: { kind: 'fixed', value: 'x' } })] });

async function openOptionsPage(context: import('@playwright/test').BrowserContext, extensionId: string, query = '') {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html${query}`);
  await page.locator('text=Formaster').first().waitFor({ state: 'visible' });
  return page;
}

function folder(page: import('@playwright/test').Page, name: string) {
  return page.locator('nav button[aria-expanded]', { hasText: name });
}

test('every script sits inside its Flow folder, including a Flow with a single script', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, {
    flows: [flow('f-solo', 'Solo flow'), flow('f-dupla', 'Two-script flow')],
    scripts: [textScript('s1', 'f-solo', 'Alone'), textScript('s2', 'f-dupla', 'First'), textScript('s3', 'f-dupla', 'Second')],
  });

  const options = await openOptionsPage(context, extensionId);

  // Two folders, and the single-script Flow is a folder too — a new script
  // must always land somewhere visible rather than floating at top level.
  await expect(folder(options, 'Solo flow')).toBeVisible();
  await expect(folder(options, 'Two-script flow')).toBeVisible();
  await expect(options.locator('nav [role="group"] button', { hasText: 'Alone' })).toBeVisible();
  await expect(options.locator('nav [role="group"] button', { hasText: 'First' })).toBeVisible();
});

test('a brand-new script appears inside a folder right away, before it is ever saved', async ({ context, extensionId }) => {
  const options = await openOptionsPage(context, extensionId);
  await options.getByRole('button', { name: 'New' }).click();

  // "New script" is both the script name and its fresh Flow's name, so the
  // folder and the entry inside it read the same — the point is that the
  // entry is *nested*, not sitting loose at the top level.
  const newFolder = folder(options, 'New script');
  await expect(newFolder).toBeVisible();
  await expect(newFolder).toHaveAttribute('aria-expanded', 'true');
  await expect(options.locator('nav [role="group"] button', { hasText: 'New script' })).toBeVisible();
});

test('renaming a script updates the sidebar as you type, without saving', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'My flow')], scripts: [textScript('s1', 'f1', 'Old name')] });

  const options = await openOptionsPage(context, extensionId, '?script=s1');
  await expect(options.locator('nav [role="group"] button', { hasText: 'Old name' })).toBeVisible();

  await options.locator('input[placeholder="Script name"]').fill('New name');

  await expect(options.locator('nav [role="group"] button', { hasText: 'New name' })).toBeVisible();
  await expect(options.locator('nav [role="group"] button', { hasText: 'Old name' })).toHaveCount(0);
});

test('renaming the Flow updates its folder label as you type', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, { flows: [flow('f1', 'Old flow')], scripts: [textScript('s1', 'f1', 'Script')] });

  const options = await openOptionsPage(context, extensionId, '?script=s1');
  await expect(folder(options, 'Old flow')).toBeVisible();

  await options.locator('input[placeholder="Flow name"]').fill('Renamed flow');

  await expect(folder(options, 'Renamed flow')).toBeVisible();
  await expect(folder(options, 'Old flow')).toHaveCount(0);
});

test('moving a script to another Flow moves it between folders immediately', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, {
    flows: [flow('f-source', 'Source'), flow('f-target', 'Target')],
    scripts: [textScript('s1', 'f-source', 'Traveller'), textScript('s2', 'f-target', 'Resident')],
  });

  const options = await openOptionsPage(context, extensionId, '?script=s1');

  // Starts under "Origem": its folder holds 2 entries (itself + the header
  // count), "Destino" holds 1.
  await expect(folder(options, 'Source')).toContainText('1');
  await expect(folder(options, 'Target')).toContainText('1');

  await options.getByRole('button', { name: 'Flow', exact: true }).click();
  await options.getByRole('option', { name: 'Target' }).click();

  // The whole Flow "Origem" is gone from the list — it had only this script —
  // and "Destino" now holds both.
  await expect(folder(options, 'Target')).toContainText('2');
  await expect(folder(options, 'Source')).toHaveCount(0);
  await expect(options.locator('nav [role="group"] button', { hasText: 'Traveller' })).toBeVisible();
});

test('discarding an unsaved rename restores the stored name in the sidebar', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, {
    flows: [flow('f1', 'Flow')],
    scripts: [textScript('s1', 'f1', 'Original'), textScript('s2', 'f1', 'Other')],
  });

  const options = await openOptionsPage(context, extensionId, '?script=s1');
  await options.locator('input[placeholder="Script name"]').fill('Discarded draft');
  await expect(options.locator('nav [role="group"] button', { hasText: 'Discarded draft' })).toBeVisible();

  // Switching scripts would throw the draft away, so it asks first.
  await options.locator('nav [role="group"] button', { hasText: 'Other' }).click();
  await expect(options.locator('text=Unsaved changes')).toBeVisible();
  await options.getByRole('button', { name: 'Discard changes' }).click();

  // Discarded for real: the sidebar stops showing a name that no longer
  // exists anywhere, and the switch goes through.
  await expect(options.locator('nav [role="group"] button', { hasText: 'Original' })).toBeVisible();
  await expect(options.locator('nav [role="group"] button', { hasText: 'Discarded draft' })).toHaveCount(0);
  await expect(options.locator('input[placeholder="Script name"]')).toHaveValue('Other');
});
