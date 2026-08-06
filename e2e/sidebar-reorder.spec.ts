import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/extension';
import { field, flow, getStored, script, seed, storageKeys } from './fixtures/flow-builders';
import type { FormScript } from '../src/lib/schema/script';

/**
 * Reordering scripts and moving them between Flow folders.
 *
 * Driven through the keyboard path (Alt+arrows) rather than `dragTo`:
 * Playwright's HTML5 drag support is its flakiest primitive and this repo
 * runs `retries: 0` on principle. The keyboard path is not a test-only
 * shim — native drag-and-drop is unusable without a mouse, so it has to
 * exist anyway, and it exercises exactly the same ordering code.
 */

const textScript = (id: string, flowId: string, name: string) =>
  script({ id, flowId, name, steps: [field({ id: `${id}-f`, selector: 'full-name', generator: { kind: 'fixed', value: 'x' } })] });

async function openOptionsAt(context: import('@playwright/test').BrowserContext, extensionId: string, query = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html${query}`);
  await page.locator('text=Formaster').first().waitFor({ state: 'visible' });
  return page;
}

/** The rendered order of script names inside one folder. */
async function namesIn(page: Page, flowName: string): Promise<string[]> {
  return page.locator(`nav [role="group"][aria-label="${flowName}"] button`).allInnerTexts();
}

async function seedThree(serviceWorker: import('@playwright/test').Worker): Promise<void> {
  await seed(serviceWorker, {
    flows: [flow('f1', 'Main flow'), flow('f2', 'Other flow')],
    scripts: [
      textScript('s1', 'f1', 'Step one'),
      textScript('s2', 'f1', 'Step two'),
      textScript('s3', 'f1', 'Step three'),
      textScript('s9', 'f2', 'Elsewhere'),
    ],
  });
}

test('Alt+ArrowDown reorders a script and the new order survives a reload', async ({ context, extensionId, serviceWorker }) => {
  await seedThree(serviceWorker);
  const options = await openOptionsAt(context, extensionId);

  const before = await namesIn(options, 'Main flow');
  expect(before).toEqual(['Step one', 'Step two', 'Step three']);

  await options.locator('nav [role="group"] button', { hasText: 'Step one' }).focus();
  await options.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => namesIn(options, 'Main flow')).toEqual(['Step two', 'Step one', 'Step three']);

  // Persisted as a sidecar list of ids, not as a field on any script.
  expect(await getStored<string[]>(serviceWorker, 'formaster:flow-order:f1')).toEqual(['s2', 's1', 's3']);

  const reopened = await openOptionsAt(context, extensionId);
  expect(await namesIn(reopened, 'Main flow')).toEqual(['Step two', 'Step one', 'Step three']);
});

test('reordering rewrites no script record, so an open editor keeps its unsaved edits', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await seedThree(serviceWorker);
  const options = await openOptionsAt(context, extensionId, '?script=s2');

  const beforeUpdatedAt = (await getStored<FormScript>(serviceWorker, 'formaster:script:s1'))!.updatedAt;
  await options.locator('input[placeholder="Script name"]').fill('Edited but not saved');

  await options.locator('nav [role="group"] button', { hasText: 'Step one' }).focus();
  await options.keyboard.press('Alt+ArrowDown');
  // The open script (s2) shows its unsaved name in the list, so that's what
  // its entry reads while the reorder happens around it.
  await expect.poll(() => namesIn(options, 'Main flow')).toEqual(['Edited but not saved', 'Step one', 'Step three']);

  // The whole point of the sidecar: no `updatedAt` churn, so nothing
  // resyncs the editor out from under the draft.
  expect((await getStored<FormScript>(serviceWorker, 'formaster:script:s1'))!.updatedAt).toBe(beforeUpdatedAt);
  await expect(options.locator('input[placeholder="Script name"]')).toHaveValue('Edited but not saved');
});

test('Alt+ArrowRight moves a script into the next folder and updates its flowId', async ({ context, extensionId, serviceWorker }) => {
  await seedThree(serviceWorker);
  const options = await openOptionsAt(context, extensionId);

  await options.locator('nav [role="group"] button', { hasText: 'Step three' }).focus();
  await options.keyboard.press('Alt+ArrowRight');

  await expect.poll(() => namesIn(options, 'Other flow')).toEqual(['Elsewhere', 'Step three']);
  expect(await namesIn(options, 'Main flow')).toEqual(['Step one', 'Step two']);

  const moved = await getStored<FormScript>(serviceWorker, 'formaster:script:s3');
  expect(moved!.flowId).toBe('f2');
});

test('moving the last script out of a flow removes the now-empty flow', async ({ context, extensionId, serviceWorker }) => {
  await seed(serviceWorker, {
    flows: [flow('f1', 'Keeper'), flow('f2', 'Doomed')],
    scripts: [textScript('s1', 'f1', 'Stays'), textScript('s2', 'f2', 'Leaving')],
  });
  const options = await openOptionsAt(context, extensionId);
  expect(await storageKeys(serviceWorker, 'formaster:flow:')).toHaveLength(2);

  // Folders sort by the Flow's creation time, then name — both were seeded
  // together, so "Doomed" sits before "Keeper" and the move is rightwards.
  await options.locator('nav [role="group"] button', { hasText: 'Leaving' }).focus();
  await options.keyboard.press('Alt+ArrowRight');

  await expect.poll(() => namesIn(options, 'Keeper')).toEqual(['Stays', 'Leaving']);
  // A flow with no scripts can't be rendered anywhere, so it's cleaned up
  // rather than lingering in the "switch flow" picker.
  await expect.poll(() => storageKeys(serviceWorker, 'formaster:flow:')).toEqual(['formaster:flow:f1']);
  await expect(options.locator('nav button[aria-expanded]', { hasText: 'Doomed' })).toHaveCount(0);
});

test('a reorder in one tab updates another tab list without moving its selection', async ({ context, extensionId, serviceWorker }) => {
  await seedThree(serviceWorker);
  const tabA = await openOptionsAt(context, extensionId);
  const tabB = await openOptionsAt(context, extensionId, '?script=s3');
  await expect(tabB.locator('input[placeholder="Script name"]')).toHaveValue('Step three');

  await tabA.bringToFront();
  await tabA.locator('nav [role="group"] button', { hasText: 'Step one' }).focus();
  await tabA.keyboard.press('Alt+ArrowDown');

  await tabB.bringToFront();
  await expect.poll(() => namesIn(tabB, 'Main flow')).toEqual(['Step two', 'Step one', 'Step three']);
  // The list followed along; the editor did not jump to another script.
  await expect(tabB.locator('input[placeholder="Script name"]')).toHaveValue('Step three');
});

test('a script dragged onto another folder lands in it', async ({ context, extensionId, serviceWorker }) => {
  await seedThree(serviceWorker);
  const options = await openOptionsAt(context, extensionId);

  // The one test covering the drag wiring itself. The events are dispatched
  // directly rather than through `dragTo`: Playwright's HTML5 drag emulation
  // is its flakiest primitive, and what's worth pinning here is that *our*
  // dragstart/dragover/drop handlers move the script — the ordering logic
  // behind them is already covered through the keyboard path above.
  await options.evaluate(() => {
    const source = document.querySelector<HTMLElement>('[data-script-id="s1"]')!;
    const target = document.querySelector<HTMLElement>('[data-flow-id="f2"]')!;
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  });

  await expect.poll(() => namesIn(options, 'Other flow')).toContain('Step one');
  expect((await getStored<FormScript>(serviceWorker, 'formaster:script:s1'))!.flowId).toBe('f2');
});
