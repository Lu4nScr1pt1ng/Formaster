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

test('searching a section title containing common words still ranks that section first', async ({ openDocs }) => {
  const docs = await openDocs();
  const search = docs.getByPlaceholder('Search the docs… (/)');

  // Scoring used to count raw substrings, so the "a" in this title matched
  // inside every word containing one — thousands of points, spread across
  // every section, burying the one actually named after the query. Titles
  // made of common words were unfindable; a distinctive term like "waitFor"
  // (the case the other test covers) hid it.
  for (const title of ['Previewing a value', 'What a script is', 'Fill a single field without a script']) {
    await search.fill(title);
    const first = docs.locator('input ~ div button').first();
    await expect(first, `"${title}" should be its own top hit`).toContainText(title);
  }

  await search.fill('Previewing a value');
  await docs.locator('input ~ div button').first().click();
  await expect(docs.locator('h2', { hasText: 'Previewing a value' })).toBeInViewport();
});

test('docs render nested inline markup instead of printing it literally', async ({ openDocs }) => {
  const docs = await openDocs();

  // "**`urlPatterns`**" has to come out as bold *and* code. It used to render
  // the backticks as text, because bold kept its content as a raw string —
  // a silent, easy-to-reintroduce regression, hence a test rather than a look.
  // Scoped to the article body — the sidebar's table of contents links to the
  // same anchors with plain, unmarked-up titles.
  const main = docs.locator('main');
  const strong = main.locator('strong', { hasText: 'urlPatterns' }).first();
  await expect(strong.locator('code')).toHaveText('urlPatterns');

  // Same for a link whose label names a symbol — several links point at this
  // anchor, so target the one whose label actually carries markup.
  await expect(main.locator('a[href="#fields-object"]', { hasText: 'object' }).locator('code')).toHaveText('fields');
  // …a table header, which used to be the one cell rendered without parsing…
  await expect(main.locator('th', { hasText: 'kind' }).first().locator('code')).toHaveText('kind');
  // …and italics, which the parser didn't handle at all.
  await expect(main.locator('em', { hasText: 'this run of this script' })).toBeVisible();

  // Finally, sweep the whole page for markup that never got rendered. Code is
  // stripped out first — a sample or an inline `*://*/*` is supposed to show
  // its own punctuation, so only prose can testify here.
  const prose = await main.evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('pre, code').forEach((node) => node.remove());
    return clone.innerText;
  });
  expect(prose, 'a stray backtick means some inline markup did not render').not.toMatch(/`/);
  expect(prose, 'a stray * means some bold or italic did not render').not.toMatch(/\*/);
});
