<script lang="ts">
  import CheckSquareIcon from 'phosphor-svelte/lib/CheckSquareIcon';
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import SquareIcon from 'phosphor-svelte/lib/SquareIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import SearchableSelect from './SearchableSelect.svelte';
  import { SELECTOR_STRATEGY_OPTIONS } from '../lib/schema/selector-strategies';
  import type { SelectorCandidate } from '../lib/schema/script';

  interface Props {
    selectors: SelectorCandidate[];
    onChange: (selectors: SelectorCandidate[]) => void;
  }

  let { selectors, onChange }: Props = $props();

  let newSelectorStrategy = $state<SelectorCandidate['strategy']>('css');
  let newSelectorValue = $state('');

  function toggleSelectorEnabled(index: number): void {
    onChange(selectors.map((candidate, i) => (i === index ? { ...candidate, enabled: candidate.enabled === false } : candidate)));
  }

  function updateSelectorValue(index: number, value: string): void {
    onChange(selectors.map((candidate, i) => (i === index ? { ...candidate, value } : candidate)));
  }

  function removeSelector(index: number): void {
    if (selectors.length <= 1) return; // at least one candidate must remain
    onChange(selectors.filter((_, i) => i !== index));
  }

  function addSelector(): void {
    const value = newSelectorValue.trim();
    if (!value) return;
    onChange([...selectors, { id: crypto.randomUUID(), strategy: newSelectorStrategy, value, enabled: true }]);
    newSelectorValue = '';
  }
</script>

{#each selectors as candidate, index (candidate.id)}
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
      disabled={selectors.length <= 1}
      onclick={() => removeSelector(index)}
    >
      <TrashIcon size={12} weight="bold" />
    </button>
  </div>
{/each}

<div class="mt-1.5 flex items-center gap-1.5 border-t border-hair pt-1.5">
  <SearchableSelect
    compact
    ariaLabel="New selector strategy"
    value={newSelectorStrategy}
    options={SELECTOR_STRATEGY_OPTIONS}
    onChange={(strategy) => (newSelectorStrategy = strategy as SelectorCandidate['strategy'])}
  />
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
