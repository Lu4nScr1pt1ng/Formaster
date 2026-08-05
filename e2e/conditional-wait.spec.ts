import { test, expect } from './fixtures/extension';
import type { FormScript } from '../src/lib/schema/script';

/**
 * test-fixtures/conditional-address-form.html is purpose-built to make this
 * self-verifying without a human watching the screen (see its header
 * comment): the Neighborhood <select> stays disabled and empty for a fixed,
 * jitter-free 350ms after a CEP is entered, then gets populated and enabled.
 * A script that doesn't wait for it fills the wrong (or no) option; the
 * fixture's own submit handler computes and reports whether the submitted
 * neighborhood actually matches the resolved CEP.
 *
 * This sends `fill/run` straight to the content script (the same message
 * the popup's Run button sends) rather than driving the popup UI — a real
 * browser-action popup isn't something Playwright can drive at all (see
 * playwright.config.ts), so this is the closest thing to that path that's
 * actually testable, and it's the exact mechanism being verified either way.
 */
test('a waitFor step blocks the dependent field until it unlocks', async ({ context, serviceWorker, staticServer }) => {
  const page = await context.newPage();
  const url = staticServer.url('conditional-address-form.html');
  await page.goto(url);

  const now = new Date().toISOString();
  const script: FormScript = {
    schemaVersion: 1,
    id: 'e2e-conditional-wait',
    name: 'e2e conditional wait',
    flowId: 'e2e-conditional-wait-flow',
    urlPatterns: ['*://*/*'],
    steps: [
      {
        type: 'field',
        field: {
          id: 'f-cep',
          selectors: [{ id: 'sel-cep', strategy: 'id', value: 'cep', enabled: true }],
          elementType: 'text',
          generator: { kind: 'builtin', id: 'cep' },
        },
      },
      {
        type: 'waitFor',
        id: 'w-neighborhood',
        selectors: [{ id: 'sel-neighborhood-wait', strategy: 'id', value: 'neighborhood', enabled: true }],
        condition: 'enabled',
        timeoutMs: 4000,
        pollIntervalMs: 100,
      },
      {
        type: 'field',
        field: {
          id: 'f-neighborhood',
          selectors: [{ id: 'sel-neighborhood-field', strategy: 'id', value: 'neighborhood', enabled: true }],
          elementType: 'select',
          generator: { kind: 'builtin', id: 'addressNeighborhood' },
        },
      },
    ],
    customGenerators: [],
    createdAt: now,
    updatedAt: now,
  };

  const results = await serviceWorker.evaluate(
    async ({ script, url }) => {
      const [tab] = await chrome.tabs.query({ url });
      return chrome.tabs.sendMessage(tab.id!, { type: 'fill/run', script });
    },
    { script, url },
  );

  expect(results).toEqual([
    { fieldId: 'f-cep', status: 'filled' },
    { fieldId: 'f-neighborhood', status: 'filled' },
  ]);

  await page.getByRole('button', { name: 'Submit' }).click();
  const resultJson = await page.locator('#result').textContent();
  expect(resultJson, 'the fixture itself must confirm the neighborhood matches the resolved CEP').toContain(
    '"waitedCorrectly": true',
  );
});

/**
 * Same fixture, but with the waitFor step removed — the neighborhood field
 * is filled immediately while the <select> still only has its disabled
 * placeholder option, so Formaster's setSelectValue() falls back to a
 * different enabled option once the lookup does resolve, and the fixture's
 * own check reports the mismatch. This is the control case: it proves the
 * wait in the test above is actually load-bearing, not incidental.
 */
test('without the waitFor step, the same script racing the lookup can pick the wrong option', async ({ context, serviceWorker, staticServer }) => {
  const page = await context.newPage();
  const url = staticServer.url('conditional-address-form.html');
  await page.goto(url);

  const now = new Date().toISOString();
  const script: FormScript = {
    schemaVersion: 1,
    id: 'e2e-no-wait',
    name: 'e2e no wait',
    flowId: 'e2e-no-wait-flow',
    urlPatterns: ['*://*/*'],
    steps: [
      {
        type: 'field',
        field: {
          id: 'f-cep',
          selectors: [{ id: 'sel-cep', strategy: 'id', value: 'cep', enabled: true }],
          elementType: 'text',
          generator: { kind: 'builtin', id: 'cep' },
        },
      },
      {
        type: 'field',
        field: {
          id: 'f-neighborhood',
          selectors: [{ id: 'sel-neighborhood-field', strategy: 'id', value: 'neighborhood', enabled: true }],
          elementType: 'select',
          generator: { kind: 'builtin', id: 'addressNeighborhood' },
        },
      },
    ],
    customGenerators: [],
    createdAt: now,
    updatedAt: now,
  };

  await serviceWorker.evaluate(
    async ({ script, url }) => {
      const [tab] = await chrome.tabs.query({ url });
      return chrome.tabs.sendMessage(tab.id!, { type: 'fill/run', script });
    },
    { script, url },
  );

  await page.getByRole('button', { name: 'Submit' }).click();
  const resultJson = await page.locator('#result').textContent();
  expect(resultJson).toContain('"waitedCorrectly": false');
});
