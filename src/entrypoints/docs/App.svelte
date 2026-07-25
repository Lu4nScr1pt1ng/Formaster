<script lang="ts">
  import { onMount } from 'svelte';
  import ListIcon from 'phosphor-svelte/lib/ListIcon';
  import ListBulletsIcon from 'phosphor-svelte/lib/ListBulletsIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import { browser } from 'wxt/browser';
  import BrandIcon from '../../components/BrandIcon.svelte';
  import DocSearch from '../../components/docs/DocSearch.svelte';
  import DocSection from '../../components/docs/DocSection.svelte';
  import DocSidebar from '../../components/docs/DocSidebar.svelte';
  import { DOC_SECTIONS } from '../../lib/docs/content';

  let sidebarOpen = $state(false);
  let activeId = $state<string | null>(DOC_SECTIONS[0]?.id ?? null);
  let mainEl: HTMLElement | undefined;

  function navigateTo(id: string): void {
    sidebarOpen = false;
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.pushState(null, '', `#${id}`);
    activeId = id;
  }

  async function openScriptLibrary(): Promise<void> {
    await browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
  }

  onMount(() => {
    // Jump straight to a deep-linked section (e.g. a link from inside the
    // script editor) without the smooth-scroll animation used for in-page navigation.
    const hash = location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });

    // Keeps the sidebar's highlighted entry in sync with whichever section
    // is actually in view while the user scrolls, not just what was last clicked.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) activeId = visible[0].target.id;
      },
      { root: mainEl, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );
    for (const section of DOC_SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  });
</script>

<div class="flex h-screen bg-canvas text-ink-1">
  {#if sidebarOpen}
    <button
      type="button"
      class="fixed inset-0 z-40 bg-black/50 md:hidden"
      aria-label="Close menu"
      onclick={() => (sidebarOpen = false)}
    ></button>
  {/if}

  <aside
    class="{sidebarOpen
      ? 'flex'
      : 'hidden'} fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex-col border-r border-hair bg-sidebar md:static md:z-auto md:flex md:w-72 md:max-w-none md:shrink-0"
  >
    <div class="flex items-center gap-2 px-4 py-4">
      <div class="relative flex h-[22px] w-[22px] shrink-0 items-center justify-center">
        <div class="absolute inset-[-6px] -z-10 rounded-full bg-accent-500/35 blur-[5px]"></div>
        <div class="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-accent-500 text-accent-ink">
          <BrandIcon size={15} />
        </div>
      </div>
      <div class="min-w-0">
        <p class="truncate text-[13px] font-bold leading-tight tracking-tight">Formaster</p>
        <p class="truncate text-[10.5px] leading-tight text-ink-3">Documentation</p>
      </div>
      <button
        type="button"
        class="ml-auto rounded-lg p-1 text-ink-3 hover:bg-surface-hover hover:text-ink-1 md:hidden"
        aria-label="Close menu"
        onclick={() => (sidebarOpen = false)}
      >
        <XIcon size={15} weight="bold" />
      </button>
    </div>

    <DocSidebar sections={DOC_SECTIONS} {activeId} onNavigate={navigateTo} />
  </aside>

  <main bind:this={mainEl} class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <div class="flex shrink-0 items-center gap-2 border-b border-hair px-3 py-2 md:px-5">
      <button
        type="button"
        class="rounded-lg p-1.5 text-ink-2 hover:bg-surface-hover hover:text-ink-1 md:hidden"
        aria-label="Open table of contents"
        onclick={() => (sidebarOpen = true)}
      >
        <ListIcon size={16} weight="bold" />
      </button>
      <span class="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-ink-2 md:flex">
        <ListBulletsIcon size={14} weight="bold" class="text-ink-3" />
        Scripting reference
      </span>
      <div class="ml-auto flex items-center gap-2">
        <DocSearch sections={DOC_SECTIONS} onNavigate={navigateTo} />
        <button
          type="button"
          class="hidden shrink-0 items-center gap-1.5 rounded-lg border border-hair px-2.5 py-1.5 text-xs transition hover:bg-surface-hover md:flex"
          onclick={openScriptLibrary}
        >
          Script library
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-3xl">
        {#each DOC_SECTIONS as section (section.id)}
          <DocSection {section} />
        {/each}
      </div>
    </div>
  </main>
</div>
