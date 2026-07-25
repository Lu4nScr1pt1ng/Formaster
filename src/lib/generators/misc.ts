import { pick, randomInt } from './random';

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'labore', 'magna',
  'aliqua', 'enim', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation',
  'ullamco', 'laboris', 'nisi', 'aliquip', 'commodo', 'consequat', 'duis',
  'aute', 'irure', 'reprehenderit', 'voluptate', 'velit', 'esse', 'cillum',
  'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat', 'cupidatat',
  'proident', 'sunt', 'culpa', 'officia', 'deserunt', 'mollit', 'anim', 'id',
  'est', 'laborum', 'perspiciatis', 'unde', 'omnis', 'iste', 'natus', 'error',
  'voluptatem', 'accusantium', 'doloremque', 'laudantium', 'totam', 'rem',
  'aperiam', 'eaque', 'ipsa', 'quae', 'illo', 'inventore', 'veritatis',
  'quasi', 'architecto', 'beatae', 'vitae', 'dicta', 'explicabo', 'nemo',
  'ipsam', 'quia', 'voluptas', 'aspernatur', 'odit', 'fugit', 'consequuntur',
];

export function generateUuid(): string {
  return crypto.randomUUID();
}

export interface IntegerOptions {
  min?: number;
  max?: number;
}

export function generateInteger({ min = 0, max = 1000 }: IntegerOptions = {}): number {
  return randomInt(min, max);
}

export interface DecimalOptions {
  min?: number;
  max?: number;
  precision?: number;
}

export function generateDecimal({ min = 0, max = 1000, precision = 2 }: DecimalOptions = {}): number {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(precision));
}

export interface BooleanOptions {
  trueProbability?: number;
}

export function generateBoolean({ trueProbability = 0.5 }: BooleanOptions = {}): boolean {
  return Math.random() < trueProbability;
}

export interface LoremOptions {
  words?: number;
}

export function generateLorem({ words = 8 }: LoremOptions = {}): string {
  const chosen = Array.from({ length: words }, () => pick(LOREM_WORDS));
  // Capitalized + a trailing period so it reads like an actual sentence
  // (a bio/description field), not a flat lowercase word dump.
  chosen[0] = chosen[0][0].toUpperCase() + chosen[0].slice(1);
  return `${chosen.join(' ')}.`;
}
