<script lang="ts">
  import CodeIcon from 'phosphor-svelte/lib/CodeIcon';
  import HourglassIcon from 'phosphor-svelte/lib/HourglassIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import SearchableSelect, { type SearchableSelectOption } from './SearchableSelect.svelte';
  import SelectorCandidateEditor from './SelectorCandidateEditor.svelte';
  import StepMoveButtons from './StepMoveButtons.svelte';
  import { createConfirmGate } from '../lib/confirm-gate.svelte';
  import { waitConditionSchema, type WaitForStep } from '../lib/schema/script';

  const WAIT_CONDITIONS = waitConditionSchema.options;

  const CONDITION_LABELS: Record<WaitForStep['condition'], string> = {
    enabled: 'becomes enabled',
    visible: 'becomes visible',
    exists: 'appears in the page',
    checked: 'becomes checked',
  };
  const CONDITION_OPTIONS: SearchableSelectOption[] = WAIT_CONDITIONS.map((condition) => ({
    value: condition,
    label: CONDITION_LABELS[condition],
  }));

  interface Props {
    step: WaitForStep;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onChange: (step: WaitForStep) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
  }

  let { step, canMoveUp, canMoveDown, onChange, onRemove, onMoveUp, onMoveDown }: Props = $props();

  let expanded = $state(false);
  const removeGate = createConfirmGate();

  function setCondition(value: string): void {
    onChange({ ...step, condition: value as WaitForStep['condition'] });
  }

  function setTimeoutMs(value: string): void {
    onChange({ ...step, timeoutMs: Math.max(1, Number(value) || 0) });
  }
</script>

<div class="rounded-xl border border-dashed border-white/12 p-2.5">
  <div class="flex flex-wrap items-center gap-y-1.5 gap-x-2">
    <StepMoveButtons {canMoveUp} {canMoveDown} {onMoveUp} {onMoveDown} />

    <HourglassIcon size={15} class="shrink-0 text-ink-3" />
    <span class="text-sm font-medium text-ink-2">Wait until element</span>

    <SearchableSelect ariaLabel="Wait condition" value={step.condition} options={CONDITION_OPTIONS} onChange={setCondition} />

    <button
      type="button"
      class="ml-auto rounded-md p-1.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1 {expanded ? 'bg-surface-hover text-accent-500' : ''}"
      title="Show selector"
      aria-label="Show selector"
      onclick={() => (expanded = !expanded)}
    >
      <CodeIcon size={15} weight="bold" />
    </button>
    <button
      type="button"
      class="rounded-md p-1.5 text-ink-3 hover:bg-red-500/10 hover:text-red-400"
      title="Remove wait"
      aria-label="Remove wait"
      onclick={() => removeGate.request(true)}
    >
      <TrashIcon size={15} weight="bold" />
    </button>
  </div>

  <div class="mt-2 flex flex-wrap items-center gap-y-1 gap-x-1.5 pl-6 text-xs text-ink-3">
    <span>Give up after</span>
    <input
      type="number"
      min="1"
      step="500"
      class="w-20 rounded-md border border-hair bg-canvas px-1.5 py-1 text-right text-xs text-ink-1 outline-none focus:border-accent-500"
      value={step.timeoutMs}
      oninput={(event) => setTimeoutMs((event.currentTarget as HTMLInputElement).value)}
    />
    <span>ms and continue anyway</span>
  </div>

  {#if expanded}
    <div class="mt-2.5 space-y-1.5 border-t border-hair pt-2.5">
      <p class="px-0.5 text-[10px] text-ink-3">Element to watch — tried top to bottom until one matches.</p>
      <SelectorCandidateEditor selectors={step.selectors} onChange={(selectors) => onChange({ ...step, selectors })} />
    </div>
  {/if}
</div>

<ConfirmDialog
  open={removeGate.open}
  title="Remove this wait?"
  message="This condition will no longer block the fields after it."
  confirmLabel="Remove"
  onConfirm={() => removeGate.confirm(onRemove)}
  onCancel={removeGate.cancel}
/>
