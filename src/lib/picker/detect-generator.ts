import type { BuiltinGeneratorId, GeneratorRef } from '../schema/script';

export interface DetectedGenerator {
  id: BuiltinGeneratorId;
  options?: Record<string, unknown>;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // strip accents so "endereço"/"nascimento" match ascii keywords too
}

/** Whole-word match — "rg" shouldn't fire on "org" or "large". */
function has(haystack: string, ...words: string[]): boolean {
  return words.some((word) => new RegExp(`\\b${word}\\b`).test(haystack));
}

// autocomplete is a standardized HTML attribute that says exactly what a
// field is for — when present, it's a stronger signal than guessing from a
// label, so these rules run first, in the priority order below.
const AUTOCOMPLETE_RULES: Record<string, DetectedGenerator> = {
  email: { id: 'email' },
  'given-name': { id: 'firstName' },
  'family-name': { id: 'lastName' },
  name: { id: 'fullName' },
  tel: { id: 'phoneBr' },
  'tel-national': { id: 'phoneBr' },
  'postal-code': { id: 'cep' },
  'address-level2': { id: 'addressCity' },
  'address-level1': { id: 'addressState' },
  'street-address': { id: 'addressStreet' },
  'address-line1': { id: 'addressStreet' },
  bday: { id: 'birthdate' },
  organization: { id: 'company' },
  country: { id: 'country' },
  'country-name': { id: 'country' },
  'cc-number': { id: 'creditCardNumber' },
  'cc-exp': { id: 'creditCardExpiry' },
  'cc-csc': { id: 'creditCardCvc' },
  'new-password': { id: 'password' },
  'current-password': { id: 'password' },
};

const NATIVE_TYPE_RULES: Record<string, DetectedGenerator> = {
  email: { id: 'email' },
  tel: { id: 'phoneBr' },
};

/**
 * Keyword rules, checked in order — first match wins. Locale-bearing ones
 * come in EN/PT pairs so the *language of the field itself* picks the
 * locale (a form labeled "Name" is presumably for a US audience; "Nome" a
 * Brazilian one), matching how the built-in generators' own `locale` option
 * already defaults to `'br'` everywhere else.
 */
const KEYWORD_RULES: Array<{ test: (h: string) => boolean; result: DetectedGenerator | null }> = [
  // Passwords: "confirm"/"confirmar" variants are deliberately excluded —
  // a plain `password` generator run independently on that field would
  // produce a *different* random value than whatever filled the real
  // password field, silently breaking the form. Better to suggest nothing
  // than to suggest something confidently wrong.
  { test: (h) => has(h, 'password', 'senha') && has(h, 'confirm', 'confirmar', 'repetir', 'repeat'), result: null },
  { test: (h) => has(h, 'password', 'senha', 'pwd'), result: { id: 'password' } },

  { test: (h) => has(h, 'email', 'e-mail'), result: { id: 'email' } },
  { test: (h) => has(h, 'cnpj'), result: { id: 'cnpj' } },
  { test: (h) => has(h, 'cpf'), result: { id: 'cpf' } },
  { test: (h) => has(h, 'rg') || h.includes('identidade'), result: { id: 'rg' } },
  { test: (h) => has(h, 'passport', 'passaporte'), result: { id: 'passport' } },

  { test: (h) => has(h, 'cvv', 'cvc') || h.includes('security code') || h.includes('codigo de seguranca'), result: { id: 'creditCardCvc' } },
  { test: (h) => h.includes('expiry') || h.includes('expiration') || h.includes('validade'), result: { id: 'creditCardExpiry' } },
  { test: (h) => h.includes('card number') || h.includes('numero do cartao') || h.includes('cardnumber'), result: { id: 'creditCardNumber' } },

  { test: (h) => h.includes('zip'), result: { id: 'cep', options: { locale: 'us' } } },
  { test: (h) => h.includes('postal'), result: { id: 'cep' } },
  { test: (h) => has(h, 'cep'), result: { id: 'cep', options: { locale: 'br' } } },

  { test: (h) => has(h, 'bairro'), result: { id: 'addressNeighborhood', options: { locale: 'br' } } },
  { test: (h) => h.includes('neighborhood'), result: { id: 'addressNeighborhood', options: { locale: 'us' } } },
  { test: (h) => has(h, 'cidade'), result: { id: 'addressCity', options: { locale: 'br' } } },
  { test: (h) => has(h, 'city'), result: { id: 'addressCity', options: { locale: 'us' } } },
  { test: (h) => has(h, 'estado', 'uf'), result: { id: 'addressState', options: { locale: 'br' } } },
  { test: (h) => has(h, 'state'), result: { id: 'addressState', options: { locale: 'us' } } },
  { test: (h) => has(h, 'rua', 'logradouro'), result: { id: 'addressStreet', options: { locale: 'br' } } },
  { test: (h) => has(h, 'street'), result: { id: 'addressStreet', options: { locale: 'us' } } },
  { test: (h) => has(h, 'complemento', 'apto', 'apartamento', 'bloco'), result: { id: 'addressComplement', options: { locale: 'br' } } },
  { test: (h) => has(h, 'complement', 'apt', 'suite', 'unit'), result: { id: 'addressComplement', options: { locale: 'us' } } },
  // Same EN/PT-picks-the-locale signal as every rule above, but here the
  // locale option pins the generator to one specific, matching country
  // name (see country.ts) instead of leaving it to draw randomly from the
  // full list, which is what happens when a field is assigned this
  // generator any other way (manually, or with no locale option set).
  { test: (h) => has(h, 'pais'), result: { id: 'country', options: { locale: 'br' } } },
  { test: (h) => has(h, 'country', 'nationality'), result: { id: 'country', options: { locale: 'us' } } },
  // "Full address"/"endereço completo" must be checked before the bare
  // "address"/"endereco" rule below, which would otherwise claim it first
  // (a single-line "street address" field is far more common than one
  // field standing in for the whole address, but when the label explicitly
  // says "complete"/"full" it means the latter).
  { test: (h) => h.includes('endereco completo'), result: { id: 'fullAddress', options: { locale: 'br' } } },
  { test: (h) => h.includes('full address'), result: { id: 'fullAddress', options: { locale: 'us' } } },
  // Bare "address"/"endereco" (not "email address", which the rule above
  // already claims first) — the single most common real-world field name
  // for a street address, so worth a default despite being less specific
  // than "street"/"rua".
  { test: (h) => has(h, 'endereco'), result: { id: 'addressStreet', options: { locale: 'br' } } },
  { test: (h) => has(h, 'address'), result: { id: 'addressStreet', options: { locale: 'us' } } },

  { test: (h) => has(h, 'whatsapp', 'celular', 'telefone', 'fone'), result: { id: 'phoneBr', options: { locale: 'br' } } },
  { test: (h) => has(h, 'phone', 'mobile'), result: { id: 'phoneBr', options: { locale: 'us' } } },

  { test: (h) => h.includes('nascimento') || h.includes('data de nasc'), result: { id: 'birthdate' } },
  { test: (h) => has(h, 'birthdate', 'birthday') || h.includes('date of birth') || h.includes('dob'), result: { id: 'birthdate' } },

  { test: (h) => h.includes('nome completo'), result: { id: 'fullName', options: { locale: 'br' } } },
  { test: (h) => h.includes('fullname') || h.includes('full name'), result: { id: 'fullName', options: { locale: 'us' } } },
  { test: (h) => h.includes('sobrenome') || h.includes('ultimo nome'), result: { id: 'lastName', options: { locale: 'br' } } },
  {
    test: (h) => h.includes('last name') || h.includes('lastname') || has(h, 'surname') || h.includes('family name'),
    result: { id: 'lastName', options: { locale: 'us' } },
  },
  { test: (h) => h.includes('primeiro nome'), result: { id: 'firstName', options: { locale: 'br' } } },
  {
    test: (h) => h.includes('first name') || h.includes('firstname') || h.includes('given name'),
    result: { id: 'firstName', options: { locale: 'us' } },
  },
  { test: (h) => has(h, 'nome'), result: { id: 'firstName', options: { locale: 'br' } } },
  { test: (h) => has(h, 'name'), result: { id: 'firstName', options: { locale: 'us' } } },

  { test: (h) => has(h, 'empresa'), result: { id: 'company', options: { locale: 'br' } } },
  { test: (h) => has(h, 'company', 'organization'), result: { id: 'company' } },

  { test: (h) => has(h, 'idade'), result: { id: 'integer', options: { min: 18, max: 90 } } },
  { test: (h) => has(h, 'age'), result: { id: 'integer', options: { min: 18, max: 90 } } },
];

/**
 * Best-effort guess at which built-in generator (if any) a real form field
 * is for, from its own attributes — used both to pre-fill a generator when
 * a field is picked, and to resolve one on the fly for the right-click
 * "Fill this field" context-menu action. Returns `null` rather than a weak
 * guess when nothing lines up; a wrong confident suggestion is worse than
 * none (see the "confirm password" exclusion above).
 */
export function detectGeneratorForElement(element: Element): DetectedGenerator | null {
  const input = element as HTMLInputElement;
  const id = element.getAttribute('id');
  const associatedLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : undefined;
  const closestLabel = element.closest('label')?.textContent;

  const haystack = normalize(
    [
      id,
      input.name,
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      associatedLabel,
      closestLabel,
    ]
      .filter(Boolean)
      .join(' '),
  );

  const autocomplete = normalize(element.getAttribute('autocomplete')).trim();
  const nativeType = element.tagName === 'INPUT' ? normalize(input.type) : '';

  if (autocomplete && AUTOCOMPLETE_RULES[autocomplete]) return AUTOCOMPLETE_RULES[autocomplete];
  if (nativeType && NATIVE_TYPE_RULES[nativeType]) return NATIVE_TYPE_RULES[nativeType];

  for (const rule of KEYWORD_RULES) {
    if (rule.test(haystack)) return rule.result;
  }
  return null;
}

/** A picked field's initial generator: the detected suggestion if there is one, else the previous unset-field default. */
export function generatorRefFromSuggestion(suggestedGenerator: DetectedGenerator | undefined): GeneratorRef {
  if (!suggestedGenerator) return { kind: 'fixed', value: '' };
  return { kind: 'builtin', id: suggestedGenerator.id, options: suggestedGenerator.options };
}
