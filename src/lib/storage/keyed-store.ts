import { browser } from 'wxt/browser';

/** Thin get/set/clear wrapper around a single `browser.storage.local` key. */
export function createKeyedStore<T>(key: string) {
  return {
    async get(): Promise<T | undefined> {
      const result = await browser.storage.local.get(key);
      return result[key] as T | undefined;
    },
    async set(value: T): Promise<void> {
      await browser.storage.local.set({ [key]: value });
    },
    async clear(): Promise<void> {
      await browser.storage.local.remove(key);
    },
  };
}
