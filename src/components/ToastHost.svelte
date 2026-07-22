<script lang="ts">
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import { dismissToast, toasts } from '../lib/toast/toast-store.svelte';
</script>

<div class="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex flex-col items-center gap-2 px-3">
  {#each toasts as toast (toast.id)}
    <div
      class="pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur
      {toast.variant === 'success'
        ? 'border-emerald-800 bg-emerald-950/95 text-emerald-100'
        : toast.variant === 'error'
          ? 'border-red-800 bg-red-950/95 text-red-100'
          : 'border-hair bg-surface/95 text-ink-1'}"
    >
      {#if toast.variant === 'success'}
        <CheckCircleIcon size={15} weight="fill" />
      {:else if toast.variant === 'error'}
        <WarningCircleIcon size={15} weight="fill" />
      {:else}
        <InfoIcon size={15} weight="fill" />
      {/if}
      <span>{toast.message}</span>
      <button
        type="button"
        class="ml-1 rounded p-0.5 opacity-60 transition hover:opacity-100"
        aria-label="Dismiss"
        onclick={() => dismissToast(toast.id)}
      >
        <XIcon size={12} weight="bold" />
      </button>
    </div>
  {/each}
</div>
