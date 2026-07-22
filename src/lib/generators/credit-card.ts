import { pick, randomDigits, randomInt } from './random';

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover';

interface BrandSpec {
  prefixes: string[];
  length: number;
}

const BRANDS: Record<CardBrand, BrandSpec> = {
  visa: { prefixes: ['4'], length: 16 },
  mastercard: { prefixes: ['51', '52', '53', '54', '55'], length: 16 },
  amex: { prefixes: ['34', '37'], length: 15 },
  discover: { prefixes: ['6011', '65'], length: 16 },
};

/** Standard Luhn check-digit generation for a partial number (all digits except the last). */
function luhnCheckDigit(partial: number[]): number {
  let sum = 0;
  let alternate = true;
  for (let i = partial.length - 1; i >= 0; i--) {
    let digit = partial[i];
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return (10 - (sum % 10)) % 10;
}

export interface CreditCardNumberOptions {
  brand?: CardBrand;
  /** Include spaces every 4 digits, like the number is usually displayed. */
  formatted?: boolean;
}

export function generateCreditCardNumber({ brand, formatted = false }: CreditCardNumberOptions = {}): string {
  const spec = BRANDS[brand ?? pick(Object.keys(BRANDS) as CardBrand[])];
  const prefix = pick(spec.prefixes);
  const bodyLength = spec.length - prefix.length - 1; // minus the check digit
  const body = randomDigits(bodyLength).join('');
  const partial = `${prefix}${body}`.split('').map(Number);
  const digits = partial.join('') + luhnCheckDigit(partial);
  return formatted ? digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim() : digits;
}

export interface CreditCardExpiryOptions {
  format?: 'MM/YY' | 'MM/YYYY';
  minYearsFromNow?: number;
  maxYearsFromNow?: number;
}

export function generateCreditCardExpiry({
  format = 'MM/YY',
  minYearsFromNow = 1,
  maxYearsFromNow = 4,
}: CreditCardExpiryOptions = {}): string {
  const year = new Date().getFullYear() + randomInt(minYearsFromNow, maxYearsFromNow);
  const month = String(randomInt(1, 12)).padStart(2, '0');
  return `${month}/${format === 'MM/YYYY' ? year : String(year).slice(-2)}`;
}

export interface CreditCardCvcOptions {
  brand?: CardBrand;
}

/** Amex uses a 4-digit CVC (on the front of the card); every other major brand uses 3. */
export function generateCreditCardCvc({ brand }: CreditCardCvcOptions = {}): string {
  return randomDigits(brand === 'amex' ? 4 : 3).join('');
}
