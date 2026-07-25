<script lang="ts">
  import { onMount } from 'svelte';
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
  import type { DocSection } from '../../lib/docs/content';
  import { search } from '../../lib/docs/search';

  interface Props {
    sections: DocSection[];
    onNavigate: (id: string) => void;
  }

  let { sections, onNavigate }: Props = $props();

  let query = $state('');
  let open = $state(false);
  let highlightIndex = $state(0);
  let rootEl: HTMLDivElement | undefined;
  let inputEl: HTMLInputElement | undefined;

  const results = $derived(search(sections, query));

  function select(id: string): void {
    onNavigate(id);
    query = '';
    open = false;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlightIndex = Math.min(highlightIndex + 1, results.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlightIndex = Math.max(highlightIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = results[highlightIndex];
      if (chosen) select(chosen.section.id);
    } else if (event.key === 'Escape') {
      open = false;
      inputEl?.blur();
    }
  }

  // "/" jumps straight to search, like most docs sites — skipped while
  // already typing somewhere else so it doesn't hijack normal typing.
  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== '/') return;
    const target = event.target as HTMLElement | null;
    const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
    if (typing) return;
    event.preventDefault();
    inputEl?.focus();
  }

  function handlePointerDown(event: PointerEvent): void {
    if (rootEl && !rootEl.contains(event.target as Node)) open = false;
  }

  onMount(() => {
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  });
</script>

<div class="relative w-full max-w-sm" bind:this={rootEl}>
  <MagnifyingGlassIcon size={13} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
  <input
    bind:this={inputEl}
    type="search"
    placeholder="Search the docs… (/)"
    class="w-full rounded-lg border border-hair bg-surface py-1.5 pl-7 pr-2 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-accent-500"
    bind:value={query}
    onfocus={() => (open = true)}
    oninput={() => {
      open = true;
      highlightIndex = 0;
    }}
    onkeydown={handleKeydown}
  />

  {#if open && results.length > 0}
    <div
      class="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[60vh] overflow-y-auto rounded-lg border border-hair bg-surface shadow-2xl"
    >
      {#each results as result, index (result.section.id)}
        <button
          type="button"
          class="block w-full border-b border-hair px-3 py-2 text-left last:border-b-0 {index === highlightIndex
            ? 'bg-accent-500/13'
            : 'hover:bg-surface-hover'}"
          onmouseenter={() => (highlightIndex = index)}
          onclick={() => select(result.section.id)}
        >
          <p class="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{result.section.category}</p>
          <p class="truncate text-[13px] font-medium text-ink-1">{result.section.title}</p>
          <p class="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-3">{result.snippet}</p>
        </button>
      {/each}
    </div>
  {:else if open && query.trim().length > 0}
    <div class="absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-lg border border-hair bg-surface p-3 shadow-2xl">
      <p class="text-xs text-ink-3">No results for "{query}".</p>
    </div>
  {/if}
</div>
