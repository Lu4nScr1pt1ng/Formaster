import { test, expect } from './fixtures/extension';

test('popup loads with no uncaught errors', async ({ openPopup, pageErrors }) => {
  const popup = await openPopup();
  await expect(popup.locator('text=Map fields on this page')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('options page loads with no uncaught errors', async ({ openOptions, pageErrors }) => {
  const options = await openOptions();
  await expect(options.locator('button:has-text("New")')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('playground loads, seeds its example script, with no uncaught errors', async ({ openPlayground, pageErrors }) => {
  const playground = await openPlayground();
  await expect(playground.locator('input[placeholder="Script name"]')).toHaveValue('Playground example');
  await expect(playground.locator('text=Fields (26)')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
