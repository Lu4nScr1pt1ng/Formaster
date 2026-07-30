export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomDigits(length: number): number[] {
  return Array.from({ length }, () => randomInt(0, 9));
}

export function pick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)];
}

/**
 * Returns a value cached in `runContext[key]` for the current fill run,
 * generating and storing one via `factory()` on first use (or when the
 * cached value fails `isValid`, e.g. an explicit option conflicts with it).
 * Falls back to a fresh one-off value when there's no run context to cache
 * into (e.g. called directly, outside a script run).
 */
export function getOrCreate<T>(
  runContext: Record<string, unknown> | undefined,
  key: string,
  isValid: (cached: unknown) => cached is T,
  factory: () => T,
): T {
  if (!runContext) return factory();
  const cached = runContext[key];
  if (isValid(cached)) return cached;
  const value = factory();
  runContext[key] = value;
  return value;
}
