<script lang="ts">
  import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
  import { useEscapeToClose } from '../lib/dismiss-on-outside.svelte';

  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let { open, title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', danger = true, onConfirm, onCancel }: Props =
    $props();

  useEscapeToClose(() => open, () => onCancel());

  // Per instance: two dialogs mounted at once would otherwise both claim the
  // same DOM id and `aria-labelledby` would resolve to whichever came first.
  const titleId = `confirm-dialog-title-${crypto.randomUUID()}`;
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}
  >
    <div
      class="w-full max-w-sm rounded-xl bg-surface p-5 shadow-2xl"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div class="flex items-start gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full {danger
            ? 'bg-red-500/15 text-red-400'
            : 'bg-accent-500/15 text-accent-500'}"
        >
          <WarningIcon size={18} weight="bold" />
        </div>
        <div class="min-w-0">
          <h2 id={titleId} class="text-sm font-semibold text-ink-1">{title}</h2>
          <p class="mt-1 text-sm text-ink-2">{message}</p>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-1 transition active:scale-[0.97] hover:bg-surface-hover"
          onclick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm font-semibold transition active:scale-[0.97] {danger
            ? 'bg-red-500 text-red-950 hover:bg-red-400'
            : 'bg-accent-500 text-accent-ink hover:bg-accent-600'}"
          onclick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
