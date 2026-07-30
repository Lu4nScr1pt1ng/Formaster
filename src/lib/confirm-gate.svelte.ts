/**
 * Reusable "click delete → confirm → then act" gate — every `<ConfirmDialog>`
 * call site in this app used to hand-roll its own `$state` boolean/id plus a
 * small `confirmX()` closure that closes the dialog and calls the real
 * action. `T` is whatever identifies what's pending removal; use the default
 * `true` for an all-or-nothing case with no id to carry (e.g. "remove this
 * step"), or a real id/value for a case that also needs to look up something
 * about the pending item (e.g. a generator's name for the dialog message).
 */
export function createConfirmGate<T = true>() {
  let pending = $state<T | null>(null);

  return {
    get open(): boolean {
      return pending !== null;
    },
    get value(): T | null {
      return pending;
    },
    request(value: T): void {
      pending = value;
    },
    confirm(action: (value: T) => void): void {
      if (pending === null) return;
      action(pending);
      pending = null;
    },
    cancel(): void {
      pending = null;
    },
  };
}
