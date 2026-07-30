import { randomInt } from './random';

export interface PasswordOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+';

/**
 * Every character class is independently toggleable — some sign-up forms
 * reject symbols entirely, or cap the length far below a "strong" default,
 * so a single fixed shape doesn't fit every target site.
 */
export function generatePassword({
  length = 12,
  uppercase = true,
  lowercase = true,
  numbers = true,
  symbols = true,
}: PasswordOptions = {}): string {
  const pools = [uppercase && UPPER, lowercase && LOWER, numbers && DIGITS, symbols && SYMBOLS].filter(
    (pool): pool is string => Boolean(pool),
  );
  const activePools = pools.length > 0 ? pools : [LOWER];
  const size = Math.max(1, Math.floor(length));

  // One char guaranteed from each enabled class (as space allows), then fill the rest from the combined pool.
  // When `size` can't fit every class, pick which classes get a guaranteed
  // slot at random instead of always favoring the first ones in `activePools`
  // (uppercase/lowercase) at the systematic expense of the later ones
  // (numbers/symbols).
  const guaranteedPools = size >= activePools.length ? activePools : shuffle(activePools).slice(0, size);
  const guaranteed = guaranteedPools.map((pool) => pool[randomInt(0, pool.length - 1)]);
  const combined = activePools.join('');
  const rest = Array.from({ length: Math.max(0, size - guaranteed.length) }, () => combined[randomInt(0, combined.length - 1)]);
  return shuffle([...guaranteed, ...rest]).join('');
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
