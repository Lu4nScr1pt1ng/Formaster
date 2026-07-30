/**
 * "Set a value, then auto-revert it after N ms, canceling any still-pending
 * revert from a previous trigger" — the shape every temporary-flash UI state
 * in this app needs (a save button flashing "Saved", a field preview
 * clearing itself, a popup run button settling back to idle).
 */
export function createFlashTimer(onExpire: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    trigger(delayMs: number): void {
      clearTimeout(timer);
      timer = setTimeout(onExpire, delayMs);
    },
    cancel(): void {
      clearTimeout(timer);
    },
  };
}

/** Same as {@link createFlashTimer}, but keyed — for a set of independent flashes identified by id (e.g. one per script/row). */
export function createKeyedFlashTimer<K>(onExpire: (key: K) => void) {
  const timers = new Map<K, ReturnType<typeof setTimeout>>();
  return {
    trigger(key: K, delayMs: number): void {
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          onExpire(key);
        }, delayMs),
      );
    },
    cancel(key: K): void {
      clearTimeout(timers.get(key));
      timers.delete(key);
    },
  };
}
