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

test('docs page loads and search finds a known section, with no uncaught errors', async ({ openDocs, pageErrors }) => {
  const docs = await openDocs();
  await expect(docs.locator('h2', { hasText: 'What a script is' })).toBeVisible();

  await docs.getByPlaceholder('Search the docs… (/)').fill('waitFor');
  const result = docs.locator('button', { hasText: 'Conditional wait steps' });
  await expect(result).toBeVisible();
  await result.click();
  await expect(docs.locator('h2', { hasText: 'Conditional wait steps' })).toBeInViewport();

  expect(pageErrors).toEqual([]);
});
