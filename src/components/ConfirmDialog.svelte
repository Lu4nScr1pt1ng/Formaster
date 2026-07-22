<script lang="ts">
  import WarningIcon from 'phosphor-svelte/lib/WarningIcon';

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

  // Capture phase, on window, so Escape closes the dialog regardless of
  // which element currently has focus (a plain keydown on this div only
  // catches it if focus already happens to be inside the dialog).
  $effect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
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
    <div
      class="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div class="flex items-start gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full {danger
            ? 'bg-red-500/15 text-red-400'
            : 'bg-accent-500/15 text-accent-400'}"
        >
          <WarningIcon size={18} weight="bold" />
        </div>
        <div class="min-w-0">
          <h2 id="confirm-dialog-title" class="text-sm font-semibold text-neutral-100">{title}</h2>
          <p class="mt-1 text-sm text-neutral-400">{message}</p>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition active:scale-[0.97] hover:bg-neutral-900"
          onclick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition active:scale-[0.97] {danger
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-accent-600 hover:bg-accent-700'}"
          onclick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
