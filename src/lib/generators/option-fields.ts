import type { BuiltinGeneratorId, GeneratorOptionField } from '../schema/script';

export type { GeneratorOptionField };

const MASKED_FIELD: GeneratorOptionField = { key: 'masked', type: 'boolean', label: 'Masked', default: true };

const LOCALE_FIELD: GeneratorOptionField = {
  key: 'locale',
  type: 'select',
  label: 'Country',
  default: 'br',
  choices: [
    { value: 'br', label: 'Brazil' },
    { value: 'us', label: 'United States' },
  ],
};

/**
 * Left as "Any" (empty string, meaning unset), a gender is picked once per
 * script run and shared by every name/email field — see person.ts's
 * `currentPersonRecord`. An explicit choice here pins that field (and every
 * other one sharing the run's identity) to it.
 */
const GENDER_FIELD: GeneratorOptionField = {
  key: 'gender',
  type: 'select',
  label: 'Gender',
  default: '',
  choices: [
    { value: '', label: 'Any' },
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
  ],
};

const BRAND_CHOICES = [
  { value: '', label: 'Random brand' },
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'Amex' },
  { value: 'discover', label: 'Discover' },
];

/**
 * UI-editable options per built-in generator, mirroring each generator
 * function's own `Options` interface (see `src/lib/generators/*.ts`). Not
 * every generator has options — the ones missing here (uuid, addressNumber, …)
 * simply take none, so no editor is shown for them.
 */
export const BUILTIN_GENERATOR_OPTION_FIELDS: Partial<Record<BuiltinGeneratorId, GeneratorOptionField[]>> = {
  cpf: [MASKED_FIELD],
  cnpj: [MASKED_FIELD],
  rg: [MASKED_FIELD],
  phoneBr: [LOCALE_FIELD, MASKED_FIELD],
  cep: [LOCALE_FIELD, MASKED_FIELD],
  fullName: [LOCALE_FIELD, GENDER_FIELD],
  firstName: [LOCALE_FIELD, GENDER_FIELD],
  lastName: [LOCALE_FIELD, GENDER_FIELD],
  email: [LOCALE_FIELD, GENDER_FIELD],
  addressStreet: [LOCALE_FIELD],
  addressComplement: [LOCALE_FIELD],
  addressCity: [LOCALE_FIELD],
  addressState: [LOCALE_FIELD],
  addressNeighborhood: [LOCALE_FIELD],
  fullAddress: [LOCALE_FIELD],
  birthdate: [
    { key: 'minAge', type: 'number', label: 'Min age', default: 18, min: 0, max: 120 },
    { key: 'maxAge', type: 'number', label: 'Max age', default: 65, min: 0, max: 120 },
    {
      key: 'format',
      type: 'select',
      label: 'Format',
      default: 'iso',
      choices: [
        { value: 'iso', label: 'YYYY-MM-DD' },
        { value: 'br', label: 'DD/MM/YYYY' },
      ],
    },
  ],
  password: [
    { key: 'length', type: 'number', label: 'Length', default: 12, min: 1, max: 128 },
    { key: 'uppercase', type: 'boolean', label: 'Uppercase', default: true },
    { key: 'lowercase', type: 'boolean', label: 'Lowercase', default: true },
    { key: 'numbers', type: 'boolean', label: 'Numbers', default: true },
    { key: 'symbols', type: 'boolean', label: 'Symbols', default: true },
  ],
  creditCardNumber: [
    { key: 'brand', type: 'select', label: 'Brand', default: '', choices: BRAND_CHOICES },
    { key: 'formatted', type: 'boolean', label: 'Spaced', default: false },
  ],
  creditCardExpiry: [
    {
      key: 'format',
      type: 'select',
      label: 'Format',
      default: 'MM/YY',
      choices: [
        { value: 'MM/YY', label: 'MM/YY' },
        { value: 'MM/YYYY', label: 'MM/YYYY' },
      ],
    },
    { key: 'minYearsFromNow', type: 'number', label: 'Min years ahead', default: 1, min: 0, max: 20 },
    { key: 'maxYearsFromNow', type: 'number', label: 'Max years ahead', default: 4, min: 0, max: 20 },
  ],
  creditCardCvc: [{ key: 'brand', type: 'select', label: 'Brand', default: '', choices: BRAND_CHOICES }],
  integer: [
    { key: 'min', type: 'number', label: 'Min', default: 0 },
    { key: 'max', type: 'number', label: 'Max', default: 1000 },
  ],
  decimal: [
    { key: 'min', type: 'number', label: 'Min', default: 0 },
    { key: 'max', type: 'number', label: 'Max', default: 1000 },
    { key: 'precision', type: 'number', label: 'Decimals', default: 2, min: 0, max: 10 },
  ],
  boolean: [{ key: 'trueProbability', type: 'number', label: 'True chance (0-1)', default: 0.5, min: 0, max: 1, step: 0.05 }],
  lorem: [{ key: 'words', type: 'number', label: 'Words', default: 8, min: 1, max: 200 }],
};
