import { pick, randomInt } from './random';

const LOREM_WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'labore', 'magna',
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
  return Array.from({ length: words }, () => pick(LOREM_WORDS)).join(' ');
}
