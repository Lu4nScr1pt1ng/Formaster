import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/extension';
import { field, flow, flowValues, script, seed } from './fixtures/flow-builders';

/**
 * The popup's Flow-related UI: the conditional "Reset flow" action, and the
 * run-result badge that expands into a per-field error list.
 *
 * Playwright can't open a real browser-action popup bubble, but popup.html
 * is an ordinary extension page — the catch is that it reads
 * `tabs.query({ active: true, currentWindow: true })` on mount, so opened as
 * a tab it would just see *itself*. `openPopupFor` works around that by
 * opening the target page after the popup and then reloading the popup:
 * on that second mount the target is the active tab, so the popup behaves
 * exactly as it does when opened over a real page.
 */
async function openPopupFor(
  context: import('@playwright/test').BrowserContext,
  extensionId: string,
  targetUrl: string,
): Promise<{ popup: Page; target: Page }> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('text=Formaster').first().waitFor({ state: 'visible' });

  const target = await context.newPage();
  await target.goto(targetUrl);

  await popup.reload();
  await popup.locator('text=Formaster').first().waitFor({ state: 'visible' });
  return { popup, target };
}

const FLOW = 'flow-popup';

test('a failed run expands into a per-field reason, and stays on screen to be read', async ({
  context,
  staticServer,
  extensionId,
  serviceWorker,
}) => {
  const partial = script({
    id: 's-partial',
    flowId: FLOW,
    name: 'Partial fill',
    steps: [
      field({ id: 'f-ok', selector: 'full-name', label: 'Name', generator: { kind: 'fixed', value: 'ok' } }),
      field({ id: 'f-missing', selector: 'does-not-exist', label: 'Missing', generator: { kind: 'fixed', value: 'x' } }),
      field({ id: 'f-var', selector: 'email', label: 'Email', generator: { kind: 'fixed', value: '{{neverPublished}}' } }),
    ],
  });
  await seed(serviceWorker, { flows: [flow(FLOW, 'Popup flow')], scripts: [partial] });

  const { popup } = await openPopupFor(context, extensionId, staticServer.url('flow-page-a.html'));
  await expect(popup.locator('text=Partial fill')).toBeVisible();

  await popup.getByRole('button', { name: 'Run' }).click();

  const badge = popup.getByRole('button', { name: /1 of 3 filled/ });
  await expect(badge).toBeVisible();

  // Deliberately past the 2.2s success-flash window: a failed run must not
  // clear itself, or the detail would vanish while it's being read.
  await popup.waitForTimeout(3000);
  await expect(badge).toBeVisible();

  await badge.click();
  await expect(popup.locator('text=Missing:')).toBeVisible();
  await expect(popup.locator('text=element not found on this page')).toBeVisible();
  await expect(popup.locator('text=/Email:.*"neverPublished" is not set yet/')).toBeVisible();

  // Clicking again collapses it.
  await badge.click();
  await expect(popup.locator('text=element not found on this page')).toHaveCount(0);
});

test('a fully successful run shows no expandable detail', async ({ context, staticServer, extensionId, serviceWorker }) => {
  const good = script({
    id: 's-ok',
    flowId: FLOW,
    name: 'Fills everything',
    steps: [field({ id: 'f-ok', selector: 'full-name', generator: { kind: 'fixed', value: 'ok' } })],
  });
  await seed(serviceWorker, { flows: [flow(FLOW, 'Popup flow')], scripts: [good] });

  const { popup, target } = await openPopupFor(context, extensionId, staticServer.url('flow-page-a.html'));
  await popup.getByRole('button', { name: 'Run' }).click();

  await expect(popup.locator('text=1 of 1 filled')).toBeVisible();
  await expect(target.locator('#full-name')).toHaveValue('ok');
  // Nothing failed, so the summary is plain text — there is no button to expand.
  await expect(popup.getByRole('button', { name: /1 of 1 filled/ })).toHaveCount(0);
});

test('Reset flow in the popup clears the flow variables the run published', async ({
  context,
  staticServer,
  extensionId,
  serviceWorker,
}) => {
  const publisher = script({
    id: 's-pub',
    flowId: FLOW,
    name: 'Publishes a variable',
    steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value: 'Ada' }, saveAs: 'name' })],
  });
  await seed(serviceWorker, { flows: [flow(FLOW, 'Popup flow')], scripts: [publisher] });

  const { popup } = await openPopupFor(context, extensionId, staticServer.url('flow-page-a.html'));
  await popup.getByRole('button', { name: 'Run' }).click();
  await expect(popup.locator('text=1 of 1 filled')).toBeVisible();
  expect(await flowValues(serviceWorker, FLOW)).toEqual({ name: 'Ada' });

  await popup.getByRole('button', { name: 'Reset flow' }).click();
  await expect.poll(() => flowValues(serviceWorker, FLOW)).toEqual({});
});

test('Reset flow is offered for a single-script Flow that publishes, and hidden for one that does not', async ({
  context,
  staticServer,
  extensionId,
  serviceWorker,
}) => {
  await seed(serviceWorker, {
    flows: [flow('f-pub', 'With variable'), flow('f-plain', 'Without variable')],
    scripts: [
      script({
        id: 's-pub',
        flowId: 'f-pub',
        name: 'Publishes something',
        steps: [field({ id: 'a', selector: 'full-name', generator: { kind: 'fixed', value: 'x' }, saveAs: 'name' })],
      }),
      script({
        id: 's-plain',
        flowId: 'f-plain',
        name: 'Publishes nothing',
        steps: [field({ id: 'b', selector: 'email', generator: { kind: 'fixed', value: 'y' } })],
      }),
    ],
  });

  const { popup } = await openPopupFor(context, extensionId, staticServer.url('flow-page-a.html'));

  // Both scripts match the page; only the publishing one has Flow state
  // worth resetting, so only its row offers the action.
  const rows = popup.locator('li');
  await expect(rows.filter({ hasText: 'Publishes something' }).getByRole('button', { name: 'Reset flow' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Publishes nothing' }).getByRole('button', { name: 'Reset flow' })).toHaveCount(0);
});
