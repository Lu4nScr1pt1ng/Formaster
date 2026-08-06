import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/extension';
import { field, flow, getStored, script, seed } from './fixtures/flow-builders';
import type { FormScript } from '../src/lib/schema/script';

/**
 * Selecting another script destroys the editor (the `{#key}` in
 * options/App.svelte), which used to take any unsaved edits with it
 * silently. These cover the three ways out — switching, the Close button,
 * and closing the tab — and, just as importantly, that a clean editor never
 * gets in the way.
 */

const textScript = (id: string, flowId: string, name: string) =>
  script({ id, flowId, name, steps: [field({ id: `${id}-f`, selector: 'full-name', generator: { kind: 'fixed', value: 'x' } })] });

async function openOptionsAt(context: import('@playwright/test').BrowserContext, extensionId: string, query = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html${query}`);
  await page.locator('text=Formaster').first().waitFor({ state: 'visible' });
  return page;
}

async function seedTwo(serviceWorker: import('@playwright/test').Worker): Promise<void> {
  await seed(serviceWorker, {
    flows: [flow('f1', 'Flow')],
    scripts: [textScript('s1', 'f1', 'First'), textScript('s2', 'f1', 'Second')],
  });
}

const nameInput = 'input[placeholder="Script name"]';
const entry = (page: Page, name: string) => page.locator('nav [role="group"] button', { hasText: name });

test('switching scripts with a clean editor never prompts', async ({ context, extensionId, serviceWorker }) => {
  await seedTwo(serviceWorker);
  const options = await openOptionsAt(context, extensionId, '?script=s1');

  await entry(options, 'Second').click();
  await expect(options.locator(nameInput)).toHaveValue('Second');
  await expect(options.locator('text=Unsaved changes')).toHaveCount(0);
});

test('clicking the already-selected script never prompts', async ({ context, extensionId, serviceWorker }) => {
  await seedTwo(serviceWorker);
  const options = await openOptionsAt(context, extensionId, '?script=s1');
  await options.locator(nameInput).fill('Edited');

  await entry(options, 'Edited').click();
  await expect(options.locator('text=Unsaved changes')).toHaveCount(0);
});

test('Cancel keeps both the edits and the current selection', async ({ context, extensionId, serviceWorker }) => {
  await seedTwo(serviceWorker);
  const options = await openOptionsAt(context, extensionId, '?script=s1');
  await options.locator(nameInput).fill('Still editing');

  await entry(options, 'Second').click();
  await options.getByRole('button', { name: 'Cancel' }).click();

  await expect(options.locator(nameInput)).toHaveValue('Still editing');
  await expect(options.locator('text=Unsaved changes')).toHaveCount(0);
});

test('Save & continue persists the edits and then switches', async ({ context, extensionId, serviceWorker }) => {
  await seedTwo(serviceWorker);
  const options = await openOptionsAt(context, extensionId, '?script=s1');
  await options.locator(nameInput).fill('Saved by the guard');

  await entry(options, 'Second').click();
  await options.getByRole('button', { name: 'Save & continue' }).click();

  // Landed on the target script, not back on the one being saved — the
  // save's own `selectedId = saved.id` must not win over the pending action.
  await expect(options.locator(nameInput)).toHaveValue('Second');
  const stored = await getStored<FormScript>(serviceWorker, 'formaster:script:s1');
  expect(stored!.name).toBe('Saved by the guard');
});

test('a save that fails validation keeps you on the broken script', async ({ context, extensionId, serviceWorker }) => {
  await seedTwo(serviceWorker);
  const options = await openOptionsAt(context, extensionId, '?script=s1');

  // A blank URL pattern can't satisfy `urlPatterns: z.array(...).min(1)`,
  // so the save is refused — and refusing must abort the navigation too,
  // or the toast explaining why would be hidden behind a different script.
  await options.locator('#url-patterns').fill('');
  await entry(options, 'Second').click();
  await options.getByRole('button', { name: 'Save & continue' }).click();

  await expect(options.locator('text=/Could not save/')).toBeVisible();
  await expect(options.locator(nameInput)).toHaveValue('First');
});

test('the Close button asks before discarding, since closing the tab is programmatic', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await seedTwo(serviceWorker);
  const options = await openOptionsAt(context, extensionId, '?script=s1');
  await options.locator(nameInput).fill('Unsaved on close');

  await options.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(options.locator('text=Unsaved changes')).toBeVisible();

  // Cancelling leaves the tab open with the draft intact.
  await options.getByRole('button', { name: 'Cancel' }).click();
  await expect(options.locator(nameInput)).toHaveValue('Unsaved on close');
  expect(options.isClosed()).toBe(false);
});

test('creating a new script asks before abandoning unsaved edits', async ({ context, extensionId, serviceWorker }) => {
  await seedTwo(serviceWorker);
  const options = await openOptionsAt(context, extensionId, '?script=s1');
  await options.locator(nameInput).fill('In progress');

  await options.getByRole('button', { name: 'New', exact: true }).click();
  await expect(options.locator('text=Unsaved changes')).toBeVisible();
  await options.getByRole('button', { name: 'Cancel' }).click();
  await expect(options.locator(nameInput)).toHaveValue('In progress');
});

test('typing and undoing leaves the editor clean, so it does not prompt', async ({ context, extensionId, serviceWorker }) => {
  await seedTwo(serviceWorker);
  const options = await openOptionsAt(context, extensionId, '?script=s1');

  // The cheap `touched` flag flips on any keystroke; the real comparison is
  // what decides, so returning to the original value must count as clean.
  await options.locator(nameInput).fill('First edited');
  await options.locator(nameInput).fill('First');

  await entry(options, 'Second').click();
  await expect(options.locator('text=Unsaved changes')).toHaveCount(0);
  await expect(options.locator(nameInput)).toHaveValue('Second');
});
