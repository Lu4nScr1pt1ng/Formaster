import { test, expect } from './fixtures/extension';
import { field, flow, flowValues, pngTemplate, runOn, script, seed } from './fixtures/flow-builders';

/**
 * The full motivating scenario, end to end: a three-step signup wizard where
 * step 3 uploads documents printed with data typed in steps 1 and 2.
 *
 *   1. Identity  — first name, last name, CPF
 *   2. Address   — CEP/street/number/city/state, plus a composed
 *                      "full address" built from those via `fields`
 *   3. Documents — two generated files carrying the name from step 1 and
 *                      the address from step 2
 *
 * Driven through a single tab that actually *navigates* between the three
 * URLs by clicking the wizard's own "Continuar" link, so nothing here can
 * pass on in-memory state: every value crossing a step has to have survived
 * a real page load via the Flow.
 */

/**
 * Both file inputs report into `#result` from an async `change` handler, and
 * the object accumulates one key per input — so a read taken the moment the
 * fill returns can miss the second document entirely, or (after a re-run)
 * still be showing the previous pass. Waiting for both keys is the condition
 * that actually means "this pass is fully reported".
 */
async function documentsReport(page: import('@playwright/test').Page) {
  await expect
    .poll(async () => Object.keys(JSON.parse((await page.locator('#result').textContent()) || '{}')).sort())
    .toEqual(['proof-of-address', 'signed-declaration']);
  return JSON.parse((await page.locator('#result').textContent()) || '{}');
}

async function clearDocumentsReport(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#result').evaluate((el) => (el.textContent = ''));
}

const FLOW = 'flow-signup';

const identityScript = script({
  id: 'wizard-1-identidade',
  flowId: FLOW,
  name: 'Signup — step 1 (identity)',
  steps: [
    field({ id: 'f-first', selector: 'first-name', label: 'First name', generator: { kind: 'builtin', id: 'firstName' }, saveAs: 'firstName' }),
    field({ id: 'f-last', selector: 'last-name', label: 'Last name', generator: { kind: 'builtin', id: 'lastName' }, saveAs: 'lastName' }),
    field({ id: 'f-cpf', selector: 'cpf', label: 'CPF', generator: { kind: 'builtin', id: 'cpf' }, saveAs: 'cpf' }),
  ],
});

// Labels double as `fields` keys (camelCased — see `fieldContextKey`), which
// is why they're spelled without accents: "Número" would camelCase to
// `nMero`, since the key derivation splits on every non-alphanumeric char.
const addressScript = script({
  id: 'wizard-2-address',
  flowId: FLOW,
  name: 'Signup — step 2 (address)',
  customGenerators: [
    {
      id: 'g-address',
      name: 'Full address',
      code: 'return fields.street + ", " + fields.number + " - " + fields.city + "/" + fields.state;',
      optionsSchema: [],
    },
  ],
  steps: [
    field({ id: 'f-cep', selector: 'cep', label: 'CEP', generator: { kind: 'builtin', id: 'cep' } }),
    field({ id: 'f-street', selector: 'street', label: 'Street', generator: { kind: 'builtin', id: 'addressStreet' } }),
    field({ id: 'f-number', selector: 'number', label: 'Number', generator: { kind: 'builtin', id: 'addressNumber' } }),
    field({ id: 'f-city', selector: 'city', label: 'City', generator: { kind: 'builtin', id: 'addressCity' } }),
    field({ id: 'f-state', selector: 'state', label: 'State', generator: { kind: 'builtin', id: 'addressState' } }),
    // Composed from the five above via `fields`, then published to the Flow
    // as one variable the documents in step 3 can print on a single line.
    field({
      id: 'f-address',
      selector: 'full-address',
      label: 'Full address',
      generator: { kind: 'custom', generatorId: 'g-address' },
      saveAs: 'address',
    }),
  ],
});

const documentsScript = script({
  id: 'wizard-3-documentos',
  flowId: FLOW,
  name: 'Signup — step 3 (documents)',
  steps: [
    field({ id: 'f-proof', selector: 'proof-of-address', elementType: 'file', generator: { kind: 'file', templateId: 'tpl-proof' } }),
    field({ id: 'f-signed', selector: 'signed-declaration', elementType: 'file', generator: { kind: 'file', templateId: 'tpl-signed' } }),
  ],
});

// Both documents put the name and address on one line each, which is only
// expressible as a literal with `{{key}}` splices — a `flowVariable` source
// carries exactly one value.
const proofTemplate = pngTemplate({
  id: 'tpl-proof',
  name: 'Proof of address',
  outputFilename: 'proof-of-address-{{firstName}}-{{lastName}}.png',
  layers: [
    { source: { kind: 'literal', value: 'PROOF OF ADDRESS' } },
    { source: { kind: 'literal', value: 'Name: {{firstName}} {{lastName}}' } },
    { source: { kind: 'literal', value: 'Address: {{address}}' } },
  ],
});

const signedDeclarationTemplate = pngTemplate({
  id: 'tpl-signed',
  name: 'Signed declaration',
  outputFilename: 'signed-declaration-{{firstName}}.png',
  layers: [
    { source: { kind: 'literal', value: 'Name: {{firstName}} {{lastName}}' } },
    { source: { kind: 'literal', value: 'Address: {{address}}' } },
    { source: { kind: 'literal', value: 'testing multistep' } },
  ],
});

test('a three-step wizard carries name and address onto documents uploaded two navigations later', async ({ context, serviceWorker, staticServer }) => {
  await seed(serviceWorker, {
    flows: [flow(FLOW, 'Multi-step signup')],
    scripts: [identityScript, addressScript, documentsScript],
    templates: [proofTemplate, signedDeclarationTemplate],
  });

  const page = await context.newPage();
  const urlStep1 = staticServer.url('multistep-1-identity.html');
  await page.goto(urlStep1);

  // ── Step 1 — identity ──────────────────────────────────────────
  expect(await runOn(serviceWorker, identityScript, urlStep1)).toEqual([
    { fieldId: 'f-first', status: 'filled' },
    { fieldId: 'f-last', status: 'filled' },
    { fieldId: 'f-cpf', status: 'filled' },
  ]);

  const firstName = await page.locator('#first-name').inputValue();
  const lastName = await page.locator('#last-name').inputValue();
  const cpf = await page.locator('#cpf').inputValue();
  expect(firstName).not.toBe('');
  expect(cpf).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/);

  // A real navigation, via the wizard's own link — everything below has to
  // come back out of storage, not out of the previous page's memory.
  await page.click('#next');
  const urlStep2 = staticServer.url('multistep-2-address.html');
  await page.waitForURL(urlStep2);

  // ── Step 2 — address ────────────────────────────────────────────────
  const addressResults = await runOn(serviceWorker, addressScript, urlStep2);
  expect(addressResults.every((result) => result.status === 'filled')).toBe(true);

  const street = await page.locator('#street').inputValue();
  const city = await page.locator('#city').inputValue();
  const state = await page.locator('#state').inputValue();
  const fullAddress = await page.locator('#full-address').inputValue();
  // The composed field really was built from its own siblings, not
  // independently regenerated.
  expect(fullAddress).toContain(street);
  expect(fullAddress).toBe(`${street}, ${await page.locator('#number').inputValue()} - ${city}/${state}`);

  await page.click('#next');
  const urlStep3 = staticServer.url('multistep-3-documents.html');
  await page.waitForURL(urlStep3);

  // ── Step 3 — documents ─────────────────────────────────────────────
  expect(await runOn(serviceWorker, documentsScript, urlStep3)).toEqual([
    { fieldId: 'f-proof', status: 'filled' },
    { fieldId: 'f-signed', status: 'filled' },
  ]);

  const report = await documentsReport(page);

  // The filename is the exact-match proof: these are the very strings typed
  // into step 1, two page loads back.
  expect(report['proof-of-address'].name).toBe(`proof-of-address-${firstName}-${lastName}.png`);
  expect(report['signed-declaration'].name).toBe(`signed-declaration-${firstName}.png`);
  expect(report['proof-of-address'].type).toBe('image/png');
  expect(report['signed-declaration'].type).toBe('image/png');

  // And the values were actually drawn, not resolved to blank.
  expect(report['proof-of-address'].inkPixels).toBeGreaterThan(200);
  expect(report['signed-declaration'].inkPixels).toBeGreaterThan(200);

  // Everything the wizard published, still readable as one Flow.
  expect(await flowValues(serviceWorker, FLOW)).toEqual({
    firstName,
    lastName,
    cpf,
    address: fullAddress,
  });
});

test('step 3 refuses to generate documents when the earlier steps were skipped', async ({ context, serviceWorker, staticServer }) => {
  await seed(serviceWorker, {
    flows: [flow(FLOW, 'Multi-step signup')],
    scripts: [documentsScript],
    templates: [proofTemplate, signedDeclarationTemplate],
  });

  const page = await context.newPage();
  const urlStep3 = staticServer.url('multistep-3-documents.html');
  await page.goto(urlStep3);

  // Jumping straight to the last step of the wizard: nothing published yet.
  const results = await runOn(serviceWorker, documentsScript, urlStep3);
  expect(results.map((result) => result.status)).toEqual(['error', 'error']);
  for (const result of results) {
    expect(result.message).toContain('is not set yet');
  }

  // Critically, no blank document was attached in place of a real one.
  expect(await page.locator('#result').textContent()).toBe('');
});

test('re-running step 1 changes the name the step 3 documents are generated with', async ({ context, serviceWorker, staticServer }) => {
  await seed(serviceWorker, {
    flows: [flow(FLOW, 'Multi-step signup')],
    scripts: [identityScript, addressScript, documentsScript],
    templates: [proofTemplate, signedDeclarationTemplate],
  });

  const page = await context.newPage();
  const urlStep1 = staticServer.url('multistep-1-identity.html');
  const urlStep2 = staticServer.url('multistep-2-address.html');
  const urlStep3 = staticServer.url('multistep-3-documents.html');

  await page.goto(urlStep1);
  await runOn(serviceWorker, identityScript, urlStep1);
  await page.click('#next');
  await page.waitForURL(urlStep2);
  await runOn(serviceWorker, addressScript, urlStep2);
  await page.click('#next');
  await page.waitForURL(urlStep3);
  await runOn(serviceWorker, documentsScript, urlStep3);
  const firstName = (await documentsReport(page))['signed-declaration'].name;

  // Go back to step 1 and fill it again as a different person, so the
  // document regenerated afterwards must carry the *new* name. The rerun uses
  // a fixed value rather than the generator: a freshly generated name would
  // usually differ, but "usually" makes the final assertion a coin flip
  // against a finite name table.
  await page.goto(urlStep1);
  const rerunStep1 = script({
    ...identityScript,
    steps: [
      field({ id: 'f-first', selector: 'first-name', label: 'First name', generator: { kind: 'fixed', value: 'Zzztest' }, saveAs: 'firstName' }),
      ...identityScript.steps.slice(1),
    ],
  });
  await runOn(serviceWorker, rerunStep1, urlStep1);
  const updatedFirstName = await page.locator('#first-name').inputValue();
  expect(updatedFirstName).toBe('Zzztest');

  await page.goto(urlStep3);
  await clearDocumentsReport(page);
  await runOn(serviceWorker, documentsScript, urlStep3);
  const secondName = (await documentsReport(page))['signed-declaration'].name;

  expect(secondName).toBe(`signed-declaration-${updatedFirstName}.png`);
  expect(secondName).not.toBe(firstName);
});
