import { randomDigits } from './random';

function cpfCheckDigit(digits: number[]): number {
  let sum = 0;
  let weight = digits.length + 1;
  for (const digit of digits) {
    sum += digit * weight;
    weight -= 1;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export interface DocumentOptions {
  masked?: boolean;
}

export function generateCpf({ masked = true }: DocumentOptions = {}): string {
  const base = randomDigits(9);
  const d1 = cpfCheckDigit(base);
  const d2 = cpfCheckDigit([...base, d1]);
  const digits = [...base, d1, d2];
  const raw = digits.join('');
  if (!masked) return raw;
  return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}-${raw.slice(9)}`;
}

function cnpjCheckDigit(digits: number[]): number {
  const weights =
    digits.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function generateCnpj({ masked = true }: DocumentOptions = {}): string {
  const base = randomDigits(8);
  const branch = [0, 0, 0, 1];
  const body = [...base, ...branch];
  const d1 = cnpjCheckDigit(body);
  const d2 = cnpjCheckDigit([...body, d1]);
  const digits = [...body, d1, d2];
  const raw = digits.join('');
  if (!masked) return raw;
  return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}/${raw.slice(8, 12)}-${raw.slice(12)}`;
}

/** RG has no national standard; this mimics the common SSP-SP style with a mod-11 check digit. */
export function generateRg({ masked = true }: DocumentOptions = {}): string {
  const base = randomDigits(8);
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  const sum = base.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const checkValue = (11 - (sum % 11)) % 11;
  const checkDigit = checkValue === 10 ? 'X' : String(checkValue);
  const raw = base.join('');
  if (!masked) return `${raw}${checkDigit}`;
  return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}-${checkDigit}`;
}

/** Brazilian passport format: 2 letters + 6 digits. */
export function generatePassport(): string {
  const letters = Array.from({ length: 2 }, () => String.fromCharCode(randomIntUpper()));
  const digits = randomDigits(6).join('');
  return `${letters.join('')}${digits}`;
}

function randomIntUpper(): number {
  return Math.floor(Math.random() * 26) + 65; // 'A'-'Z'
}

export function generateCep({ masked = true }: DocumentOptions = {}): string {
  const raw = randomDigits(8).join('');
  if (!masked) return raw;
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}
