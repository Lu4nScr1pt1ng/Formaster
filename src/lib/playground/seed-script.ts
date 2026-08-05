import type { CustomGenerator, FieldMapping, FormScript, ScriptStep, SelectorCandidate } from '../schema/script';

/** Builds a `{strategy:'id', ...}` selector list for a playground form element by its DOM id. */
function byId(id: string): SelectorCandidate[] {
  return [{ id: crypto.randomUUID(), strategy: 'id', value: id, enabled: true }];
}

function field(partial: Omit<FieldMapping, 'id' | 'selectors'> & { id: string }): ScriptStep {
  return {
    type: 'field',
    field: { ...partial, selectors: byId(partial.id) },
  };
}

const GEN_CONFIRM_PASSWORD = 'pg-gen-confirm-password';
const GEN_REFERRAL_CODE = 'pg-gen-referral-code';
const GEN_PROMO_CODE = 'pg-gen-promo-code';
const GEN_USERNAME = 'pg-gen-username';

const customGenerators: CustomGenerator[] = [
  {
    id: GEN_CONFIRM_PASSWORD,
    name: 'Confirm password (matches password)',
    code: `// "fields" holds every field filled earlier in this script, keyed by label.
return fields.password;`,
    optionsSchema: [],
  },
  {
    id: GEN_REFERRAL_CODE,
    name: 'Referral code (derived from email)',
    code: `return "REF-" + String(fields.email).split("@")[0].toUpperCase();`,
    optionsSchema: [],
  },
  {
    id: GEN_PROMO_CODE,
    name: 'Promo code (uses a helper)',
    code: `return "PROMO-" + helpers.uuid().slice(0, 8).toUpperCase();`,
    optionsSchema: [],
  },
  {
    id: GEN_USERNAME,
    name: 'Username (custom generator with its own options)',
    // "options" here is whatever this field's own Options editor is set to
    // (see optionsSchema below) — every field using this generator can pick
    // its own prefix/digit count independently.
    code: `const prefix = options.prefix || "user";
const digits = Math.max(1, options.digits || 4);
const n = String(Math.floor(Math.random() * Math.pow(10, digits))).padStart(digits, "0");
return prefix + "_" + n;`,
    optionsSchema: [
      {
        key: 'prefix',
        type: 'select',
        label: 'Style',
        default: 'user',
        choices: [
          { value: 'user', label: 'user_' },
          { value: 'guest', label: 'guest_' },
          { value: 'test', label: 'test_' },
        ],
      },
      { key: 'digits', type: 'number', label: 'Digits', default: 4, min: 1, max: 10 },
    ],
  },
];

/**
 * A ready-to-run example script wired to the bundled Playground page
 * (`src/entrypoints/playground`). Exercises: every native input type, a
 * disabled-until-filled field (via a `waitFor` step), the built-in password
 * generator plus a confirm-password custom generator reading `fields.*`,
 * credit card generators, a non-native "custom" widget, and a custom
 * generator with its own configurable `optionsSchema` (username) — so a new
 * user has something concrete to press Run on and tweak, instead of an empty
 * script.
 */
export function buildPlaygroundScript(): FormScript {
  const now = new Date().toISOString();

  const steps: ScriptStep[] = [
    field({ id: 'pg-first-name', label: 'First name', elementType: 'text', generator: { kind: 'builtin', id: 'firstName' } }),
    field({ id: 'pg-last-name', label: 'Last name', elementType: 'text', generator: { kind: 'builtin', id: 'lastName' } }),
    field({ id: 'pg-email', label: 'Email', elementType: 'email', generator: { kind: 'builtin', id: 'email' } }),
    {
      type: 'waitFor',
      id: crypto.randomUUID(),
      selectors: byId('pg-referral-code'),
      condition: 'enabled',
      timeoutMs: 4000,
      pollIntervalMs: 150,
    },
    field({
      id: 'pg-referral-code',
      label: 'Referral code',
      elementType: 'text',
      generator: { kind: 'custom', generatorId: GEN_REFERRAL_CODE },
    }),
    field({ id: 'pg-phone', label: 'Phone', elementType: 'tel', generator: { kind: 'builtin', id: 'phoneBr' } }),
    field({
      id: 'pg-age',
      label: 'Age',
      elementType: 'number',
      generator: { kind: 'builtin', id: 'integer', options: { min: 18, max: 90 } },
    }),
    field({ id: 'pg-birthdate', label: 'Birthdate', elementType: 'date', generator: { kind: 'builtin', id: 'birthdate' } }),
    field({
      id: 'pg-password',
      label: 'Password',
      elementType: 'password',
      generator: { kind: 'builtin', id: 'password', options: { length: 14, symbols: false } },
    }),
    field({
      id: 'pg-confirm-password',
      label: 'Confirm password',
      elementType: 'password',
      generator: { kind: 'custom', generatorId: GEN_CONFIRM_PASSWORD },
    }),
    field({ id: 'pg-website', label: 'Website', elementType: 'url', generator: { kind: 'fixed', value: 'https://example.com' } }),
    field({
      id: 'pg-appointment',
      label: 'Appointment',
      elementType: 'datetime-local',
      generator: { kind: 'fixed', value: '2026-08-15T10:30' },
    }),
    field({ id: 'pg-start-month', label: 'Start month', elementType: 'month', generator: { kind: 'fixed', value: '2026-08' } }),
    field({ id: 'pg-vacation-week', label: 'Vacation week', elementType: 'week', generator: { kind: 'fixed', value: '2026-W33' } }),
    field({ id: 'pg-meeting-time', label: 'Meeting time', elementType: 'time', generator: { kind: 'fixed', value: '14:30' } }),
    field({ id: 'pg-newsletter', label: 'Newsletter', elementType: 'checkbox', generator: { kind: 'builtin', id: 'boolean' } }),
    field({
      id: 'pg-plan-pro',
      label: 'Plan',
      elementType: 'radio',
      generator: { kind: 'fixed', value: 'pro' },
      options: { radioValue: 'pro' },
    }),
    field({
      id: 'pg-account-type',
      label: 'Account type',
      elementType: 'select',
      generator: { kind: 'fixed', value: 'business' },
    }),
    field({ id: 'pg-bio', label: 'Bio', elementType: 'textarea', generator: { kind: 'builtin', id: 'lorem', options: { words: 12 } } }),
    field({ id: 'pg-satisfaction', label: 'Satisfaction', elementType: 'range', generator: { kind: 'fixed', value: '8' } }),
    field({ id: 'pg-favorite-color', label: 'Favorite color', elementType: 'color', generator: { kind: 'fixed', value: '#eea63c' } }),
    field({
      id: 'pg-card-number',
      label: 'Card number',
      elementType: 'text',
      generator: { kind: 'builtin', id: 'creditCardNumber', options: { formatted: true } },
    }),
    field({ id: 'pg-card-expiry', label: 'Card expiry', elementType: 'text', generator: { kind: 'builtin', id: 'creditCardExpiry' } }),
    field({ id: 'pg-card-cvc', label: 'Card CVC', elementType: 'text', generator: { kind: 'builtin', id: 'creditCardCvc' } }),
    field({ id: 'pg-country', label: 'Country', elementType: 'custom', generator: { kind: 'fixed', value: 'Brazil' } }),
    field({
      id: 'pg-promo-code',
      label: 'Promo code',
      elementType: 'text',
      generator: { kind: 'custom', generatorId: GEN_PROMO_CODE },
    }),
    field({
      id: 'pg-username',
      label: 'Username',
      elementType: 'text',
      generator: { kind: 'custom', generatorId: GEN_USERNAME, options: { prefix: 'guest', digits: 6 } },
    }),
  ];

  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: 'Playground example',
    description: 'Demonstrates every field type, a disabled-until-filled field, and custom generators reading earlier fields.',
    flowId: crypto.randomUUID(),
    urlPatterns: ['formaster://playground'],
    steps,
    customGenerators,
    createdAt: now,
    updatedAt: now,
  };
}
