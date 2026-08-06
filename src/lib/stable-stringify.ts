/**
 * Key-order-independent serialization, for comparing two parsed records.
 *
 * Zod preserves the key order of its *input*, so two objects that are equal
 * in every value can still differ under `JSON.stringify` purely because one
 * came from a hand-edited file and the other from the app. Anything that
 * asks "is this the same content?" needs this instead.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Deep equality ignoring some top-level keys — `updatedAt` above all, which
 * every save rewrites and which therefore says nothing about whether the
 * content the user cares about actually changed.
 */
export function deepEqualIgnoring<T extends object>(a: T, b: T, ignoredKeys: string[]): boolean {
  return stableStringify(withoutKeys(a, ignoredKeys)) === stableStringify(withoutKeys(b, ignoredKeys));
}

function withoutKeys<T extends object>(value: T, keys: string[]): Partial<T> {
  const copy = { ...value };
  for (const key of keys) delete copy[key as keyof T];
  return copy;
}
