<script lang="ts">
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';

  export interface SearchableSelectOption {
    value: string;
    label: string;
  }

  interface Props {
    value: string;
    options: SearchableSelectOption[];
    onChange: (value: string) => void;
    ariaLabel: string;
    placeholder?: string;
    /** Small uppercase-mono chip trigger (field type, selector strategy) instead of a regular bordered one. */
    compact?: boolean;
    triggerClass?: string;
    /** Search box only shows once there are more options than this — a 4-item list doesn't need one. */
    searchThreshold?: number;
  }

  let {
    value,
    options,
    onChange,
    ariaLabel,
    placeholder = 'Select…',
    compact = false,
    triggerClass = '',
    searchThreshold = 6,
  }: Props = $props();

  const listboxId = `sel-${crypto.randomUUID()}`;

  let open = $state(false);
  let query = $state('');
  let activeIndex = $state(0);
  let root = $state<HTMLDivElement>();
  let triggerEl = $state<HTMLButtonElement>();
  let searchInput = $state<HTMLInputElement>();
  let optionsList = $state<HTMLDivElement>();

  const selectedLabel = $derived(options.find((option) => option.value === value)?.label ?? placeholder);
  const showSearch = $derived(options.length > searchThreshold);
  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  });

  function openPanel(): void {
    query = '';
    open = true;
    const current = options.findIndex((option) => option.value === value);
    activeIndex = current >= 0 ? current : 0;
    requestAnimationFrame(() => (showSearch ? searchInput?.focus() : optionsList?.focus()));
  }

  function closePanel(): void {
    open = false;
  }

  function select(option: SearchableSelectOption): void {
    onChange(option.value);
    closePanel();
    triggerEl?.focus();
  }

  function handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) openPanel();
    }
  }

  function handleListKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[activeIndex]) select(filtered[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
      triggerEl?.focus();
    }
  }

  $effect(() => {
    if (!open) return;
    // mousedown (not click) so this beats an option's own click handler when
    // the trigger itself is clicked again to toggle closed.
    function handleOutside(event: MouseEvent): void {
      if (root && !root.contains(event.target as Node)) closePanel();
    }
    window.addEventListener('mousedown', handleOutside, true);
    return () => window.removeEventListener('mousedown', handleOutside, true);
  });
</script>

<div class="relative max-w-full {compact ? 'shrink-0' : 'min-w-0'}" bind:this={root}>
  <button
    type="button"
    bind:this={triggerEl}
    class={compact
      ? `flex max-w-full items-center gap-1 rounded-md bg-surface-hover py-0.5 pl-1.5 pr-1 font-mono text-[10px] uppercase tracking-wide text-ink-2 outline-none ${triggerClass}`
      : `flex max-w-full items-center gap-1.5 rounded-md border border-hair bg-canvas py-1 pl-2 pr-1.5 text-xs text-ink-1 outline-none ${triggerClass}`}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={listboxId}
    aria-label={ariaLabel}
    onclick={() => (open ? closePanel() : openPanel())}
    onkeydown={handleTriggerKeydown}
  >
    <span class="min-w-0 truncate">{selectedLabel}</span>
    <CaretDownIcon size={compact ? 8 : 11} class="shrink-0 text-ink-3" />
  </button>

  {#if open}
    <div
      id={listboxId}
      class="absolute left-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-hair bg-surface shadow-2xl"
      style="width: max-content; min-width: 100%; max-width: 16rem;"
    >
      {#if showSearch}
        <div class="flex items-center gap-1.5 border-b border-hair px-2 py-1.5">
          <MagnifyingGlassIcon size={11} class="shrink-0 text-ink-3" />
          <input
            bind:this={searchInput}
            bind:value={query}
            oninput={() => (activeIndex = 0)}
            onkeydown={handleListKeydown}
            placeholder="Search…"
            aria-label="Search options"
            class="min-w-0 flex-1 bg-transparent text-xs text-ink-1 outline-none placeholder:text-ink-3"
          />
        </div>
      {/if}
      <div
        bind:this={optionsList}
        role="listbox"
        aria-label={ariaLabel}
        tabindex="-1"
        class="max-h-48 overflow-y-auto p-1 outline-none"
        onkeydown={handleListKeydown}
      >
        {#each filtered as option, index (option.value)}
          <button
            type="button"
            role="option"
            aria-selected={option.value === value}
            class="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition {option.value === value
              ? 'bg-accent-500/13 font-medium text-accent-500'
              : index === activeIndex
                ? 'bg-surface-hover text-ink-1'
                : 'text-ink-2 hover:bg-surface-hover hover:text-ink-1'}"
            onmouseenter={() => (activeIndex = index)}
            onclick={() => select(option)}
          >
            {option.label}
          </button>
        {:else}
          <p class="px-2 py-2 text-xs text-ink-3">No matches</p>
        {/each}
      </div>
    </div>
  {/if}
</div>
