import { pick, randomDigits, randomInt } from './random';

const MALE_FIRST_NAMES_BR = [
  'Jose', 'Joao', 'Antonio', 'Francisco', 'Carlos', 'Paulo', 'Pedro', 'Lucas',
  'Luiz', 'Marcos', 'Gabriel', 'Rafael', 'Bruno', 'Eduardo', 'Felipe', 'Rodrigo',
  'Andre', 'Diego', 'Thiago', 'Vinicius', 'Gustavo', 'Leonardo', 'Fernando',
  'Ricardo', 'Alexandre', 'Daniel', 'Fabio', 'Guilherme', 'Henrique', 'Igor',
  'Mateus', 'Renato', 'Sergio', 'Vitor',
];

const FEMALE_FIRST_NAMES_BR = [
  'Maria', 'Ana', 'Fernanda', 'Patricia', 'Aline', 'Sandra', 'Camila', 'Juliana',
  'Bruna', 'Larissa', 'Beatriz', 'Carolina', 'Amanda', 'Leticia', 'Vanessa',
  'Priscila', 'Renata', 'Daniela', 'Gabriela', 'Isabela', 'Mariana', 'Natalia',
  'Raquel', 'Tatiane', 'Viviane', 'Adriana', 'Cristina', 'Debora', 'Eliane',
  'Luciana', 'Michele', 'Simone', 'Vera', 'Yasmin',
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves',
  'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho',
  'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Araujo',
  'Cardoso', 'Correia', 'Cavalcanti', 'Dias', 'Duarte', 'Freitas', 'Machado',
  'Melo', 'Miranda', 'Monteiro', 'Moreira', 'Nascimento', 'Nunes', 'Pinto',
  'Ramos', 'Reis', 'Rocha', 'Sales', 'Teixeira',
];

const MALE_FIRST_NAMES_US = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
  'Thomas', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald',
  'Steven', 'Andrew', 'Kenneth', 'Joshua', 'Kevin', 'Brian', 'George',
  'Timothy', 'Ronald', 'Edward', 'Jason', 'Jeffrey', 'Ryan', 'Jacob', 'Gary',
];

const FEMALE_FIRST_NAMES_US = [
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan',
  'Jessica', 'Sarah', 'Karen', 'Nancy', 'Lisa', 'Betty', 'Margaret', 'Sandra',
  'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle', 'Carol', 'Amanda',
  'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Laura', 'Sharon', 'Cynthia',
  'Kathleen',
];

const US_LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen',
  'Hill', 'Flores',
];

const STREET_PREFIXES = ['Rua', 'Avenida', 'Alameda', 'Travessa', 'Praca', 'Estrada'];
const STREET_NAMES = [
  'das Flores', 'Brasil', 'Sao Paulo', 'das Acacias', 'dos Ipes',
  'Sete de Setembro', 'Rio Branco', 'das Palmeiras', 'do Comercio', 'Central',
  'Duque de Caxias', 'Tiradentes', 'das Araucarias', 'Getulio Vargas',
  'Marechal Deodoro', 'dos Bandeirantes', 'das Oliveiras', 'Santos Dumont',
  'Barao do Rio Branco', 'das Camelias', 'do Sol', 'da Paz', 'das Rosas',
  'Independencia',
];

const AREA_CODES = ['11', '21', '31', '41', '51', '61', '71', '81', '85', '91'];
const US_AREA_CODES = ['212', '310', '312', '415', '512', '617', '702', '718', '818', '917'];

const COMPANY_SUFFIXES = [
  'Tecnologia', 'Comercio', 'Solucoes', 'Servicos', 'Industria', 'Consultoria',
  'Engenharia', 'Logistica', 'Sistemas', 'Participacoes', 'Distribuidora',
  'Empreendimentos',
];

// example.{com,org,net} are IANA-reserved specifically for documentation/testing
// (RFC 2606) — guaranteed to never resolve to a real inbox. The rest are
// generic placeholder-style domains, same idea as mail.com/test.dev before.
const EMAIL_DOMAINS = [
  'example.com', 'example.org', 'example.net', 'mail.com', 'test.dev',
  'fakemail.dev', 'sample.io', 'demo.test',
];

export type Gender = 'male' | 'female';

export interface NameOptions {
  locale?: 'br' | 'us';
  /** Left unset (the default), a random one is picked once per script run and reused across name/email fields. */
  gender?: Gender;
}

interface PersonRecord {
  firstName: string;
  lastName: string;
  gender: Gender;
}

function firstNamesFor(locale: 'br' | 'us', gender: Gender): readonly string[] {
  if (locale === 'us') return gender === 'male' ? MALE_FIRST_NAMES_US : FEMALE_FIRST_NAMES_US;
  return gender === 'male' ? MALE_FIRST_NAMES_BR : FEMALE_FIRST_NAMES_BR;
}

function lastNamesFor(locale: 'br' | 'us'): readonly string[] {
  return locale === 'us' ? US_LAST_NAMES : LAST_NAMES;
}

function pickPersonRecord(locale: 'br' | 'us', gender?: Gender): PersonRecord {
  const resolvedGender = gender ?? pick<Gender>(['male', 'female']);
  return {
    firstName: pick(firstNamesFor(locale, resolvedGender)),
    lastName: pick(lastNamesFor(locale)),
    gender: resolvedGender,
  };
}

function isPersonRecord(value: unknown): value is PersonRecord {
  return typeof value === 'object' && value !== null && 'firstName' in value && 'lastName' in value && 'gender' in value;
}

/**
 * Returns the identity for the current fill run, generating and caching one
 * on first use (keyed by locale, like the BR/US address quartets) so
 * firstName/lastName/fullName/email fields on the same script all agree
 * instead of each picking an unrelated random person. An explicit `gender`
 * option always wins, even against an already-cached record of the other
 * gender — the record is only reused when it already matches (or no
 * gender was requested).
 */
function currentPersonRecord(options: NameOptions, runContext?: Record<string, unknown>): PersonRecord {
  const locale = options.locale ?? 'br';
  if (!runContext) return pickPersonRecord(locale, options.gender);
  const key = `person:${locale}`;
  const cached = runContext[key];
  if (isPersonRecord(cached) && (!options.gender || options.gender === cached.gender)) return cached;
  const record = pickPersonRecord(locale, options.gender);
  runContext[key] = record;
  return record;
}

export function generateFirstName(options: NameOptions = {}, runContext?: Record<string, unknown>): string {
  return currentPersonRecord(options, runContext).firstName;
}

export function generateLastName(options: NameOptions = {}, runContext?: Record<string, unknown>): string {
  return currentPersonRecord(options, runContext).lastName;
}

export function generateFullName(options: NameOptions = {}, runContext?: Record<string, unknown>): string {
  const locale = options.locale ?? 'br';
  const { firstName, lastName } = currentPersonRecord(options, runContext);
  if (locale === 'us') return `${firstName} ${lastName}`;
  // BR names conventionally carry two surnames — the first one matches
  // whatever the standalone "lastName" generator would return for this same
  // identity, the second is just an extra independent one for realism.
  const secondSurname = pick(lastNamesFor(locale));
  return `${firstName} ${lastName} ${secondSurname}`;
}

export function generateEmail(options: NameOptions = {}, runContext?: Record<string, unknown>): string {
  const { firstName, lastName } = currentPersonRecord(options, runContext);
  const base = `${firstName}.${lastName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.]/g, '');
  const domain = pick(EMAIL_DOMAINS);
  return `${base}${randomInt(1, 999)}@${domain}`;
}

export interface PhoneOptions {
  masked?: boolean;
  locale?: 'br' | 'us';
}

export function generatePhoneBr({ masked = true, locale = 'br' }: PhoneOptions = {}): string {
  if (locale === 'us') {
    const area = pick(US_AREA_CODES);
    const exchange = randomDigits(3).join('');
    const line = randomDigits(4).join('');
    if (!masked) return `${area}${exchange}${line}`;
    return `(${area}) ${exchange}-${line}`;
  }
  const area = pick(AREA_CODES);
  const number = `9${randomDigits(8).join('')}`;
  if (!masked) return `${area}${number}`;
  return `(${area}) ${number.slice(0, 5)}-${number.slice(5)}`;
}

export function generateAddressStreet(): string {
  return `${pick(STREET_PREFIXES)} ${pick(STREET_NAMES)}`;
}

export function generateAddressNumber(): string {
  return String(randomInt(1, 9999));
}

export function generateCompany(): string {
  return `${pick(LAST_NAMES)} ${pick(COMPANY_SUFFIXES)}`;
}

export interface BirthdateOptions {
  minAge?: number;
  maxAge?: number;
  format?: 'iso' | 'br';
}

export function generateBirthdate({ minAge = 18, maxAge = 65, format = 'iso' }: BirthdateOptions = {}): string {
  const now = new Date();
  const age = randomInt(minAge, maxAge);
  const year = now.getFullYear() - age;
  const month = randomInt(1, 12);
  const day = randomInt(1, 28);
  if (format === 'br') {
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
