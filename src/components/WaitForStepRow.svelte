<script lang="ts">
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
  import CheckSquareIcon from 'phosphor-svelte/lib/CheckSquareIcon';
  import CodeIcon from 'phosphor-svelte/lib/CodeIcon';
  import HourglassIcon from 'phosphor-svelte/lib/HourglassIcon';
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import SquareIcon from 'phosphor-svelte/lib/SquareIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { waitConditionSchema, type SelectorCandidate, type WaitForStep } from '../lib/schema/script';

  const SELECTOR_STRATEGIES: SelectorCandidate['strategy'][] = [
    'id',
    'name',
    'data-testid',
    'aria-label',
    'css',
    'xpath',
  ];

  const WAIT_CONDITIONS = waitConditionSchema.options;

  const CONDITION_LABELS: Record<WaitForStep['condition'], string> = {
    enabled: 'becomes enabled',
    visible: 'becomes visible',
    exists: 'appears in the page',
    checked: 'becomes checked',
  };

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
  let confirmRemoveOpen = $state(false);
  let newSelectorStrategy = $state<SelectorCandidate['strategy']>('css');
  let newSelectorValue = $state('');

  function setCondition(value: string): void {
    onChange({ ...step, condition: value as WaitForStep['condition'] });
  }

  function setTimeoutMs(value: string): void {
    onChange({ ...step, timeoutMs: Math.max(1, Number(value) || 0) });
  }

  function toggleSelectorEnabled(index: number): void {
    const selectors = step.selectors.map((candidate, i) =>
      i === index ? { ...candidate, enabled: candidate.enabled === false } : candidate,
    );
    onChange({ ...step, selectors });
  }

  function updateSelectorValue(index: number, value: string): void {
    const selectors = step.selectors.map((candidate, i) => (i === index ? { ...candidate, value } : candidate));
    onChange({ ...step, selectors });
  }

  function removeSelector(index: number): void {
    if (step.selectors.length <= 1) return;
    onChange({ ...step, selectors: step.selectors.filter((_, i) => i !== index) });
  }

  function addSelector(): void {
    const value = newSelectorValue.trim();
    if (!value) return;
    onChange({
      ...step,
      selectors: [...step.selectors, { strategy: newSelectorStrategy, value, enabled: true }],
    });
    newSelectorValue = '';
  }

  function confirmRemove(): void {
    confirmRemoveOpen = false;
    onRemove();
  }
</script>

<div class="rounded-xl border border-dashed border-white/12 p-2.5">
  <div class="flex items-center gap-2">
    <div class="flex shrink-0 flex-col">
      <button
        type="button"
        class="rounded p-0.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1 disabled:pointer-events-none disabled:opacity-25"
        title="Move up"
        aria-label="Move up"
        disabled={!canMoveUp}
        onclick={onMoveUp}
      >
        <CaretUpIcon size={11} weight="bold" />
      </button>
      <button
        type="button"
        class="rounded p-0.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1 disabled:pointer-events-none disabled:opacity-25"
        title="Move down"
        aria-label="Move down"
        disabled={!canMoveDown}
        onclick={onMoveDown}
      >
        <CaretDownIcon size={11} weight="bold" />
      </button>
    </div>

    <HourglassIcon size={15} class="shrink-0 text-ink-3" />
    <span class="text-sm font-medium text-ink-2">Wait until element</span>

    <div class="relative shrink-0">
      <select
        class="appearance-none rounded-md border border-hair bg-canvas py-1 pl-2 pr-6 text-xs text-ink-1 outline-none"
        value={step.condition}
        onchange={(event) => setCondition((event.currentTarget as HTMLSelectElement).value)}
      >
        {#each WAIT_CONDITIONS as condition (condition)}
          <option value={condition}>{CONDITION_LABELS[condition]}</option>
        {/each}
      </select>
      <CaretDownIcon size={11} class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-3" />
    </div>

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
      onclick={() => (confirmRemoveOpen = true)}
    >
      <TrashIcon size={15} weight="bold" />
    </button>
  </div>

  <div class="mt-2 flex items-center gap-1.5 pl-6 text-xs text-ink-3">
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
      {#each step.selectors as candidate, index}
        {@const isEnabled = candidate.enabled !== false}
        <div class="flex items-center gap-1.5 font-mono text-[11px]">
          <button
            type="button"
            class="shrink-0 p-0.5 {isEnabled ? 'text-accent-500' : 'text-ink-3'}"
            title={isEnabled ? 'Disable this candidate' : 'Enable this candidate'}
            aria-label={isEnabled ? 'Disable selector candidate' : 'Enable selector candidate'}
            onclick={() => toggleSelectorEnabled(index)}
          >
            {#if isEnabled}
              <CheckSquareIcon size={13} weight="fill" />
            {:else}
              <SquareIcon size={13} />
            {/if}
          </button>
          <span class="w-16 shrink-0 uppercase tracking-wide {isEnabled ? 'text-ink-2' : 'text-ink-3'}">
            {candidate.strategy}
          </span>
          <input
            class="min-w-0 flex-1 rounded-md border border-hair bg-canvas px-1.5 py-1 text-ink-1 outline-none focus:bg-surface-hover {isEnabled
              ? ''
              : 'text-ink-3 line-through'}"
            value={candidate.value}
            oninput={(event) => updateSelectorValue(index, (event.currentTarget as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="shrink-0 p-0.5 text-ink-3 hover:text-red-400 disabled:pointer-events-none disabled:opacity-30"
            title="Remove candidate"
            aria-label="Remove selector candidate"
            disabled={step.selectors.length <= 1}
            onclick={() => removeSelector(index)}
          >
            <TrashIcon size={12} weight="bold" />
          </button>
        </div>
      {/each}

      <div class="mt-1.5 flex items-center gap-1.5 border-t border-hair pt-1.5">
        <div class="relative shrink-0">
          <select
            class="appearance-none rounded bg-transparent py-0.5 pl-1 pr-4 font-mono text-[11px] uppercase text-ink-2 outline-none"
            aria-label="New selector strategy"
            bind:value={newSelectorStrategy}
          >
            {#each SELECTOR_STRATEGIES as strategy (strategy)}
              <option value={strategy}>{strategy}</option>
            {/each}
          </select>
          <CaretDownIcon size={9} class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-ink-3" />
        </div>
        <input
          class="min-w-0 flex-1 rounded border border-dashed border-white/20 bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-ink-1 outline-none placeholder:text-ink-3"
          placeholder="Type a value to match this by…"
          bind:value={newSelectorValue}
          onkeydown={(event) => event.key === 'Enter' && addSelector()}
        />
        <button
          type="button"
          class="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-accent-500 hover:bg-accent-500/10"
          onclick={addSelector}
        >
          <PlusIcon size={11} weight="bold" />
          Add
        </button>
      </div>
    </div>
  {/if}
</div>

<ConfirmDialog
  open={confirmRemoveOpen}
  title="Remove this wait?"
  message="This condition will no longer block the fields after it."
  confirmLabel="Remove"
  onConfirm={confirmRemove}
  onCancel={() => (confirmRemoveOpen = false)}
/>
