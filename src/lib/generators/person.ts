import { pick, randomDigits, randomInt } from './random';

const FIRST_NAMES = [
  'Maria', 'Jose', 'Ana', 'Joao', 'Antonio', 'Francisco', 'Carlos', 'Paulo',
  'Pedro', 'Lucas', 'Luiz', 'Marcos', 'Gabriel', 'Rafael', 'Fernanda',
  'Patricia', 'Aline', 'Sandra', 'Camila', 'Juliana', 'Bruna', 'Larissa',
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves',
  'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho',
  'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa',
];

const STREET_PREFIXES = ['Rua', 'Avenida', 'Alameda', 'Travessa'];
const STREET_NAMES = [
  'das Flores', 'Brasil', 'Sao Paulo', 'das Acacias', 'dos Ipes',
  'Sete de Setembro', 'Rio Branco', 'das Palmeiras', 'do Comercio', 'Central',
];

const AREA_CODES = ['11', '21', '31', '41', '51', '61', '71', '81', '85', '91'];

const COMPANY_SUFFIXES = ['Tecnologia', 'Comercio', 'Solucoes', 'Servicos', 'Industria', 'Consultoria'];

export function generateFirstName(): string {
  return pick(FIRST_NAMES);
}

export function generateLastName(): string {
  return pick(LAST_NAMES);
}

export function generateFullName(): string {
  return `${generateFirstName()} ${generateLastName()} ${generateLastName()}`;
}

export function generateEmail(nameHint?: string): string {
  const base = (nameHint ?? `${generateFirstName()}.${generateLastName()}`)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]/g, '');
  const domain = pick(['example.com', 'mail.com', 'test.dev']);
  return `${base}${randomInt(1, 999)}@${domain}`;
}

export interface PhoneOptions {
  masked?: boolean;
}

export function generatePhoneBr({ masked = true }: PhoneOptions = {}): string {
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
  return `${generateLastName()} ${pick(COMPANY_SUFFIXES)}`;
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
