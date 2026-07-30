<script lang="ts">
  import TimerIcon from 'phosphor-svelte/lib/TimerIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import StepMoveButtons from './StepMoveButtons.svelte';
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

<div class="flex flex-wrap items-center gap-y-1.5 gap-x-2 rounded-xl border border-dashed border-white/12 p-2.5">
  <StepMoveButtons {canMoveUp} {canMoveDown} {onMoveUp} {onMoveDown} />

  <TimerIcon size={15} class="shrink-0 text-ink-3" />
  <span class="text-sm font-medium text-ink-2">Wait</span>

  <input
    type="number"
    min="0"
    step="100"
    class="w-20 rounded-md border border-hair bg-canvas px-1.5 py-1 text-right text-xs text-ink-1 outline-none focus:border-accent-500"
    value={step.delayMs}
    oninput={(event) => setDelay((event.currentTarget as HTMLInputElement).value)}
  />
  <span class="text-xs text-ink-3">ms before the next field</span>

  <button
    type="button"
    class="ml-auto rounded-md p-1.5 text-ink-3 hover:bg-red-500/10 hover:text-red-400"
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
