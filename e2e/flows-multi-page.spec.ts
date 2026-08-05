import { test, expect } from './fixtures/extension';
import { field, flow, flowIdentity, flowValues, runOn, script, seed, seedIdentity } from './fixtures/flow-builders';

/**
 * Cross-page Flow behavior: a script on page A publishes named variables
 * and a correlated identity, a script on page B (same Flow) reads them
 * back. Every test here opens both fixture pages as real, separate tabs and
 * drives them in sequence, because "survives a navigation between two
 * unrelated forms" is the entire claim — a single-page setup would pass
 * even if nothing were persisted at all.
 */

const FLOW = 'flow-main';
const OTHER_FLOW = 'flow-other';

async function openBothPages(
  context: import('@playwright/test').BrowserContext,
  staticServer: { url(name: string): string },
) {
  const urlA = staticServer.url('flow-page-a.html');
  const urlB = staticServer.url('flow-page-b.html');
  const pageA = await context.newPage();
  await pageA.goto(urlA);
  const pageB = await context.newPage();
  await pageB.goto(urlB);
  return { pageA, pageB, urlA, urlB };
}

test('a fixed value on page B reads a {{key}} published on page A', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });

  const scriptA = script({
    id: 's-a',
    flowId: FLOW,
    steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value: 'Ada Lovelace' }, saveAs: 'fullName' })],
  });
  const scriptB = script({
    id: 's-b',
    flowId: FLOW,
    steps: [field({ id: 'f-greeting', selector: 'greeting', generator: { kind: 'fixed', value: 'Welcome, {{fullName}}!' } })],
  });

  expect(await runOn(serviceWorker, scriptA, urlA)).toEqual([{ fieldId: 'f-name', status: 'filled' }]);
  expect(await flowValues(serviceWorker, FLOW)).toEqual({ fullName: 'Ada Lovelace' });

  expect(await runOn(serviceWorker, scriptB, urlB)).toEqual([{ fieldId: 'f-greeting', status: 'filled' }]);
  await expect(pageB.locator('#greeting')).toHaveValue('Welcome, Ada Lovelace!');
});

test('a custom generator on page B reads flowVars published on page A', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });

  const scriptA = script({
    id: 's-a',
    flowId: FLOW,
    steps: [field({ id: 'f-email', selector: 'email', generator: { kind: 'fixed', value: 'ada@example.com' }, saveAs: 'email' })],
  });
  const scriptB = script({
    id: 's-b',
    flowId: FLOW,
    customGenerators: [
      { id: 'g-ref', name: 'Ref from email', code: 'return "REF-" + flowVars.email.split("@")[0].toUpperCase();', optionsSchema: [] },
    ],
    steps: [field({ id: 'f-ref', selector: 'ref-code', generator: { kind: 'custom', generatorId: 'g-ref' } })],
  });

  await runOn(serviceWorker, scriptA, urlA);
  expect(await runOn(serviceWorker, scriptB, urlB)).toEqual([{ fieldId: 'f-ref', status: 'filled' }]);
  await expect(pageB.locator('#ref-code')).toHaveValue('REF-ADA');
});

test('a three-script chain passes a derived value forward across pages', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });

  // A publishes a raw name; B derives a slug from it and republishes that;
  // C consumes only the slug — so C passing proves the middle link, not
  // just a single hop, actually persisted.
  const scriptA = script({
    id: 's-a',
    flowId: FLOW,
    steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value: 'Ada Lovelace' }, saveAs: 'fullName' })],
  });
  const scriptB = script({
    id: 's-b',
    flowId: FLOW,
    customGenerators: [{ id: 'g-slug', name: 'Slug', code: 'return flowVars.fullName.toLowerCase().replace(" ", "-");', optionsSchema: [] }],
    steps: [field({ id: 'f-slug', selector: 'ref-code', generator: { kind: 'custom', generatorId: 'g-slug' }, saveAs: 'slug' })],
  });
  const scriptC = script({
    id: 's-c',
    flowId: FLOW,
    steps: [field({ id: 'f-greeting', selector: 'greeting', generator: { kind: 'fixed', value: 'id:{{slug}}' } })],
  });

  await runOn(serviceWorker, scriptA, urlA);
  await runOn(serviceWorker, scriptB, urlB);
  expect(await runOn(serviceWorker, scriptC, urlB)).toEqual([{ fieldId: 'f-greeting', status: 'filled' }]);

  await expect(pageB.locator('#greeting')).toHaveValue('id:ada-lovelace');
  expect(await flowValues(serviceWorker, FLOW)).toEqual({ fullName: 'Ada Lovelace', slug: 'ada-lovelace' });
});

test('a field reads a variable published by an earlier field in the same run', async ({ context, serviceWorker, staticServer }) => {
  const { pageA, urlA } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });

  const scriptA = script({
    id: 's-a',
    flowId: FLOW,
    steps: [
      field({ id: 'f-first', selector: 'first-name', generator: { kind: 'fixed', value: 'Ada' }, saveAs: 'first' }),
      field({ id: 'f-full', selector: 'full-name', generator: { kind: 'fixed', value: '{{first}} Lovelace' } }),
    ],
  });

  expect(await runOn(serviceWorker, scriptA, urlA)).toEqual([
    { fieldId: 'f-first', status: 'filled' },
    { fieldId: 'f-full', status: 'filled' },
  ]);
  await expect(pageA.locator('#full-name')).toHaveValue('Ada Lovelace');
});

test('reading a variable before the field that publishes it errors instead of filling blank', async ({ context, serviceWorker, staticServer }) => {
  const { pageA, urlA } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });

  // Same two fields as the test above, in the opposite order — the reader
  // now runs first, so nothing has published `first` yet.
  const scriptA = script({
    id: 's-a',
    flowId: FLOW,
    steps: [
      field({ id: 'f-full', selector: 'full-name', generator: { kind: 'fixed', value: '{{first}} Lovelace' } }),
      field({ id: 'f-first', selector: 'first-name', generator: { kind: 'fixed', value: 'Ada' }, saveAs: 'first' }),
    ],
  });

  const results = await runOn(serviceWorker, scriptA, urlA);
  expect(results[0].status).toBe('error');
  expect(results[0].message).toContain('"first" is not set yet');
  expect(results[1].status).toBe('filled');
  // The critical part: the field was left untouched, not filled with " Lovelace".
  await expect(pageA.locator('#full-name')).toHaveValue('');
});

test('a missing flowVars key is undefined in a custom generator, so it can fall back', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });

  const scriptB = script({
    id: 's-b',
    flowId: FLOW,
    customGenerators: [{ id: 'g', name: 'Guarded', code: 'return flowVars.neverPublished || "fallback";', optionsSchema: [] }],
    steps: [field({ id: 'f-ref', selector: 'ref-code', generator: { kind: 'custom', generatorId: 'g' } })],
  });

  expect(await runOn(serviceWorker, scriptB, urlB)).toEqual([{ fieldId: 'f-ref', status: 'filled' }]);
  await expect(pageB.locator('#ref-code')).toHaveValue('fallback');
});

test('two Flows using the same variable name do not see each other', async ({ context, serviceWorker, staticServer }) => {
  const { pageA, pageB, urlA, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW), flow(OTHER_FLOW)] });

  const publishMain = script({
    id: 's-main',
    flowId: FLOW,
    steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value: 'Main Person' }, saveAs: 'fullName' })],
  });
  const publishOther = script({
    id: 's-other',
    flowId: OTHER_FLOW,
    steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value: 'Other Person' }, saveAs: 'fullName' })],
  });
  const readOther = script({
    id: 's-other-read',
    flowId: OTHER_FLOW,
    steps: [field({ id: 'f-greeting', selector: 'greeting', generator: { kind: 'fixed', value: 'Hi {{fullName}}' } })],
  });

  await runOn(serviceWorker, publishMain, urlA);
  await runOn(serviceWorker, publishOther, urlA);
  await runOn(serviceWorker, readOther, urlB);

  await expect(pageA.locator('#full-name')).toHaveValue('Other Person');
  await expect(pageB.locator('#greeting')).toHaveValue('Hi Other Person');
  expect(await flowValues(serviceWorker, FLOW)).toEqual({ fullName: 'Main Person' });
  expect(await flowValues(serviceWorker, OTHER_FLOW)).toEqual({ fullName: 'Other Person' });
});

test('re-running the publishing script overwrites the value the next page reads', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });

  const publish = (value: string) =>
    script({
      id: 's-a',
      flowId: FLOW,
      steps: [field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value }, saveAs: 'fullName' })],
    });
  const read = script({
    id: 's-b',
    flowId: FLOW,
    steps: [field({ id: 'f-greeting', selector: 'greeting', generator: { kind: 'fixed', value: '{{fullName}}' } })],
  });

  await runOn(serviceWorker, publish('First Value'), urlA);
  await runOn(serviceWorker, read, urlB);
  await expect(pageB.locator('#greeting')).toHaveValue('First Value');

  await runOn(serviceWorker, publish('Second Value'), urlA);
  await runOn(serviceWorker, read, urlB);
  await expect(pageB.locator('#greeting')).toHaveValue('Second Value');
});

test('a skipped field publishes nothing, and a failing field publishes nothing', async ({ context, serviceWorker, staticServer }) => {
  const { urlA } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });

  const scriptA = script({
    id: 's-a',
    flowId: FLOW,
    customGenerators: [{ id: 'g-boom', name: 'Throws', code: 'throw new Error("boom");', optionsSchema: [] }],
    steps: [
      field({ id: 'f-skipped', selector: 'first-name', generator: { kind: 'fixed', value: 'nope' }, saveAs: 'skipped', skip: true }),
      field({ id: 'f-broken', selector: 'last-name', generator: { kind: 'custom', generatorId: 'g-boom' }, saveAs: 'broken' }),
      field({ id: 'f-ok', selector: 'full-name', generator: { kind: 'fixed', value: 'fine' }, saveAs: 'ok' }),
    ],
  });

  const results = await runOn(serviceWorker, scriptA, urlA);
  // The skipped field isn't reported at all; the broken one is, as an error.
  expect(results.map((r) => r.fieldId)).toEqual(['f-broken', 'f-ok']);
  expect(results[0].status).toBe('error');
  expect(await flowValues(serviceWorker, FLOW)).toEqual({ ok: 'fine' });
});

test('the correlated identity persists across pages in one Flow and stays out of another', async ({ context, serviceWorker, staticServer }) => {
  const { pageA, pageB, urlA, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW), flow(OTHER_FLOW)] });
  // Neither name exists in person.ts's tables, so "the persisted identity
  // was loaded" is an exact assertion rather than a lucky match.
  await seedIdentity(serviceWorker, FLOW, { firstName: 'Zzztest', lastName: 'Qqqcheck' });

  const nameFields = (ids: { first: string; last: string }) => [
    field({ id: ids.first, selector: 'first-name', generator: { kind: 'builtin', id: 'firstName' } }),
    field({ id: ids.last, selector: 'last-name', generator: { kind: 'builtin', id: 'lastName' } }),
  ];

  await runOn(serviceWorker, script({ id: 's-a', flowId: FLOW, steps: nameFields({ first: 'f1', last: 'f2' }) }), urlA);
  await expect(pageA.locator('#first-name')).toHaveValue('Zzztest');
  await expect(pageA.locator('#last-name')).toHaveValue('Qqqcheck');

  // Same Flow, different page, a script that never generated a name before:
  // it must still land on the same person.
  await runOn(serviceWorker, script({ id: 's-b', flowId: FLOW, steps: nameFields({ first: 'f3', last: 'f4' }) }), urlB);
  await expect(pageB.locator('#first-name')).toHaveValue('Zzztest');
  await expect(pageB.locator('#last-name')).toHaveValue('Qqqcheck');

  // A different Flow must generate its own person — it can never be this one.
  await runOn(serviceWorker, script({ id: 's-other', flowId: OTHER_FLOW, steps: nameFields({ first: 'f5', last: 'f6' }) }), urlA);
  await expect(pageA.locator('#first-name')).not.toHaveValue('Zzztest');
});

test('an email generated on page B matches the identity page A already established', async ({ context, serviceWorker, staticServer }) => {
  const { pageB, urlA, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });
  await seedIdentity(serviceWorker, FLOW, { firstName: 'Zzztest', lastName: 'Qqqcheck' });

  await runOn(
    serviceWorker,
    script({ id: 's-a', flowId: FLOW, steps: [field({ id: 'f1', selector: 'full-name', generator: { kind: 'builtin', id: 'fullName' } })] }),
    urlA,
  );
  await runOn(
    serviceWorker,
    script({
      id: 's-b',
      flowId: FLOW,
      steps: [field({ id: 'f2', selector: 'email', elementType: 'email', generator: { kind: 'builtin', id: 'email' } })],
    }),
    urlB,
  );

  // `email` appends a random number and picks a random domain each call, so
  // only the name-derived local part is stable — that's what correlation means.
  await expect(pageB.locator('#email')).toHaveValue(/^zzztest\.qqqcheck\d+@/);
});

test('Reset flow clears both the named variables and the correlated identity', async ({ context, serviceWorker, staticServer }) => {
  const { pageA, urlA, urlB } = await openBothPages(context, staticServer);
  await seed(serviceWorker, { flows: [flow(FLOW)] });
  await seedIdentity(serviceWorker, FLOW, { firstName: 'Zzztest', lastName: 'Qqqcheck' });

  const scriptA = script({
    id: 's-a',
    flowId: FLOW,
    steps: [
      field({ id: 'f-name', selector: 'full-name', generator: { kind: 'fixed', value: 'Ada Lovelace' }, saveAs: 'fullName' }),
      field({ id: 'f-first', selector: 'first-name', generator: { kind: 'builtin', id: 'firstName' } }),
    ],
  });
  const readBack = script({
    id: 's-b',
    flowId: FLOW,
    steps: [field({ id: 'f-greeting', selector: 'greeting', generator: { kind: 'fixed', value: '{{fullName}}' } })],
  });

  await runOn(serviceWorker, scriptA, urlA);
  expect(await flowValues(serviceWorker, FLOW)).toEqual({ fullName: 'Ada Lovelace' });
  expect(await flowIdentity(serviceWorker, FLOW)).toBeDefined();

  await serviceWorker.evaluate(async (flowId) => {
    await chrome.storage.local.remove([`formaster:flow-values:${flowId}`, `formaster:flow-identity:${flowId}`]);
  }, FLOW);

  // Both halves must actually be gone: the named variable no longer
  // resolves, and the identity is regenerated instead of reused.
  const afterReset = await runOn(serviceWorker, readBack, urlB);
  expect(afterReset[0].status).toBe('error');
  expect(afterReset[0].message).toContain('is not set yet');

  await runOn(serviceWorker, scriptA, urlA);
  await expect(pageA.locator('#first-name')).not.toHaveValue('Zzztest');
});
