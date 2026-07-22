<script lang="ts">
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
  import TimerIcon from 'phosphor-svelte/lib/TimerIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import type { DelayStep } from '../lib/schema/script';

  interface Props {
    step: DelayStep;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onChange: (step: DelayStep) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
  }

  let { step, canMoveUp, canMoveDown, onChange, onRemove, onMoveUp, onMoveDown }: Props = $props();

  let confirmRemoveOpen = $state(false);

  function setDelay(value: string): void {
    onChange({ ...step, delayMs: Math.max(0, Number(value) || 0) });
  }

  function confirmRemove(): void {
    confirmRemoveOpen = false;
    onRemove();
  }
</script>

<div class="flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-2.5 dark:border-neutral-700 dark:bg-neutral-900/50">
  <div class="flex shrink-0 flex-col">
    <button
      type="button"
      class="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:pointer-events-none disabled:opacity-25 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
      title="Move up"
      aria-label="Move up"
      disabled={!canMoveUp}
      onclick={onMoveUp}
    >
      <CaretUpIcon size={11} weight="bold" />
    </button>
    <button
      type="button"
      class="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:pointer-events-none disabled:opacity-25 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
      title="Move down"
      aria-label="Move down"
      disabled={!canMoveDown}
      onclick={onMoveDown}
    >
      <CaretDownIcon size={11} weight="bold" />
    </button>
  </div>

  <TimerIcon size={15} class="shrink-0 text-neutral-400" />
  <span class="text-sm font-medium text-neutral-600 dark:text-neutral-300">Wait</span>

  <input
    type="number"
    min="0"
    step="100"
    class="w-20 rounded-md border border-neutral-300 bg-transparent px-1.5 py-1 text-right text-xs dark:border-neutral-700"
    value={step.delayMs}
    oninput={(event) => setDelay((event.currentTarget as HTMLInputElement).value)}
  />
  <span class="text-xs text-neutral-500">ms before the next field</span>

  <button
    type="button"
    class="ml-auto rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
    title="Remove wait"
    aria-label="Remove wait"
    onclick={() => (confirmRemoveOpen = true)}
  >
    <TrashIcon size={15} weight="bold" />
  </button>
</div>

<ConfirmDialog
  open={confirmRemoveOpen}
  title="Remove this wait?"
  message="This pause will no longer happen between fields."
  confirmLabel="Remove"
  onConfirm={confirmRemove}
  onCancel={() => (confirmRemoveOpen = false)}
/>
