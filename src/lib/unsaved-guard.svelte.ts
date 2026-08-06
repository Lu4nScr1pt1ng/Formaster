/**
 * "Ask before throwing away unsaved edits" — the mediator between whatever
 * wants to navigate (the sidebar picking another script, the Import button)
 * and whatever holds the unsaved state (the open editor).
 *
 * The editor registers itself rather than the parent reaching in with
 * `bind:this`: the editor lives inside a `{#key}` block that destroys and
 * rebuilds it on every selection change, so a handle held by the parent
 * would go stale exactly when it's needed.
 */
export interface UnsavedSource {
  /** Cheap to call — the expensive comparison only runs when navigation is actually attempted. */
  isDirty: () => boolean;
  /** Resolves false when the save was refused (e.g. validation), which must abort the navigation. */
  save: () => Promise<boolean>;
  /** Shown in the dialog so the user knows *what* has pending changes. */
  label: () => string;
}

export function createUnsavedGuard() {
  let source = $state<UnsavedSource | null>(null);
  let pendingAction = $state<(() => void) | null>(null);
  let saving = $state(false);

  function proceed(): void {
    const action = pendingAction;
    pendingAction = null;
    action?.();
  }

  return {
    register(next: UnsavedSource): () => void {
      source = next;
      return () => {
        if (source === next) source = null;
      };
    },

    /** Runs `action` immediately when there's nothing to lose, otherwise opens the dialog. */
    run(action: () => void): void {
      if (!source?.isDirty()) {
        action();
        return;
      }
      pendingAction = action;
    },

    /** For callers that need to decide for themselves rather than prompt (e.g. a broadcast from another tab). */
    isDirty(): boolean {
      return source?.isDirty() ?? false;
    },

    get open(): boolean {
      return pendingAction !== null;
    },
    get saving(): boolean {
      return saving;
    },
    get label(): string {
      return source?.label() ?? '';
    },

    cancel(): void {
      pendingAction = null;
    },

    discard(): void {
      proceed();
    },

    async saveAndProceed(): Promise<void> {
      if (!source || saving) return;
      saving = true;
      try {
        // A refused save (invalid script) has to leave the user where they
        // are — the toast explains why, and navigating away would hide it.
        if (await source.save()) proceed();
      } finally {
        saving = false;
      }
    },
  };
}

export type UnsavedGuard = ReturnType<typeof createUnsavedGuard>;
