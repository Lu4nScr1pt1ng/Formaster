<script lang="ts">
  import FloppyDiskIcon from 'phosphor-svelte/lib/FloppyDiskIcon';
  import { useEscapeToClose } from '../lib/dismiss-on-outside.svelte';

  /**
   * Three actions, which `ConfirmDialog` can't express. Kept separate rather
   * than adding a third slot there: this one defaults focus to the safe
   * choice, isn't styled as a destructive confirm, and none of the eight
   * existing ConfirmDialog call sites would ever pass the extra props.
   */
  interface Props {
    open: boolean;
    /** What has pending changes, so the user knows which script they'd lose. */
    label: string;
    saving?: boolean;
    onCancel: () => void;
    onDiscard: () => void;
    onSave: () => void;
  }

  let { open, label, saving = false, onCancel, onDiscard, onSave }: Props = $props();

  const titleId = `unsaved-dialog-title-${crypto.randomUUID()}`;
  let cancelButton = $state<HTMLButtonElement>();

  useEscapeToClose(() => open, () => onCancel());

  // Escape and the backdrop both mean "cancel", so the safest action is also
  // the one focus lands on — Enter can't discard anything by accident.
  $effect(() => {
    if (open) cancelButton?.focus();
  });
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}
  >
    <div class="w-full max-w-md rounded-xl bg-surface p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
      <div class="flex items-start gap-3">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-accent-500">
          <FloppyDiskIcon size={18} weight="bold" />
        </div>
        <div class="min-w-0">
          <h2 id={titleId} class="text-sm font-semibold text-ink-1">Unsaved changes</h2>
          <p class="mt-1 text-sm text-ink-2">
            {label ? `"${label}"` : 'This script'} has changes you haven't saved yet.
          </p>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button
          bind:this={cancelButton}
          type="button"
          class="rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-1 transition active:scale-[0.97] hover:bg-surface-hover"
          onclick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 transition active:scale-[0.97] hover:bg-red-500/10"
          onclick={onDiscard}
        >
          Discard changes
        </button>
        <button
          type="button"
          class="rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-semibold text-accent-ink transition active:scale-[0.97] hover:bg-accent-600 disabled:opacity-50"
          disabled={saving}
          onclick={onSave}
        >
          {saving ? 'Saving…' : 'Save & continue'}
        </button>
      </div>
    </div>
  </div>
{/if}
