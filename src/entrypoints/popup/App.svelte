<script lang="ts">
  import { onMount } from 'svelte';
  import BookOpenIcon from 'phosphor-svelte/lib/BookOpenIcon';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import CursorClickIcon from 'phosphor-svelte/lib/CursorClickIcon';
  import FolderOpenIcon from 'phosphor-svelte/lib/FolderOpenIcon';
  import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
  import GlobeIcon from 'phosphor-svelte/lib/GlobeIcon';
  import ListBulletsIcon from 'phosphor-svelte/lib/ListBulletsIcon';
  import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import { browser } from 'wxt/browser';
  import BrandIcon from '../../components/BrandIcon.svelte';
  import type { FillFieldResult, RuntimeMessage } from '../../lib/messaging/types';
  import { createEmptyScript, type FormScript } from '../../lib/schema/script';
  import { setReturnTabId } from '../../lib/storage/return-tab-store';
  import { listScripts, saveScript } from '../../lib/storage/scripts-store';
  import { matchesAnyPattern, suggestScriptTarget } from '../../lib/url-match';

  type RunState = 'idle' | 'running' | 'done' | 'error';

  let loading = $state(true);
  let currentUrl = $state('');
  let matchingScripts = $state<FormScript[]>([]);
  let activeTabId = $state<number | null>(null);
  let runState = $state<Record<string, RunState>>({});
  let runSummary = $state<Record<string, string>>({});

  const pageLabel = $derived(safePageLabel(currentUrl));

  onMount(async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id ?? null;
    currentUrl = tab?.url ?? '';
    const scripts = await listScripts();
    matchingScripts = scripts.filter((script) => matchesAnyPattern(currentUrl, script.urlPatterns));
    loading = false;
  });

  async function runScript(script: FormScript): Promise<void> {
    if (activeTabId == null) return;
    runState = { ...runState, [script.id]: 'running' };
    try {
      // `script` is a live $state proxy element (from matchingScripts); the
      // messaging API structured-clones its payload and throws on a raw proxy.
      const results = (await browser.tabs.sendMessage(activeTabId, {
        type: 'fill/run',
        script: $state.snapshot(script),
      } satisfies RuntimeMessage)) as FillFieldResult[] | undefined;

      const filled = results?.filter((result) => result.status === 'filled').length ?? 0;
      const total = results?.length ?? 0;
      const ok = total === 0 || filled === total;

      runSummary = { ...runSummary, [script.id]: total === 0 ? 'No fields to fill' : `${filled} of ${total} filled` };
      runState = { ...runState, [script.id]: ok ? 'done' : 'error' };
    } catch {
      runSummary = { ...runSummary, [script.id]: 'Could not reach this page' };
      runState = { ...runState, [script.id]: 'error' };
    } finally {
      setTimeout(() => {
        runState = { ...runState, [script.id]: 'idle' };
      }, 2200);
    }
  }

  async function editScript(script: FormScript): Promise<void> {
    if (activeTabId != null) await setReturnTabId(activeTabId);
    await browser.tabs.create({ url: browser.runtime.getURL(`/options.html?script=${script.id}`) });
    window.close();
  }

  async function startMapping(): Promise<void> {
    if (activeTabId == null) return;
    await browser.tabs.sendMessage(activeTabId, { type: 'picker/start' } satisfies RuntimeMessage);
    window.close();
  }

  async function openLibrary(): Promise<void> {
    if (activeTabId != null) await setReturnTabId(activeTabId);
    await browser.runtime.openOptionsPage();
  }

  async function openDocs(): Promise<void> {
    await browser.tabs.create({ url: browser.runtime.getURL('/docs.html') });
  }

  // A blank, saved script scoped to this page's URL pattern instead of
  // "*://*/*" — saved for real (not stashed as a draft for the options tab
  // to notice) so the ?script= deep link below always finds it immediately.
  async function createScriptForThisPage(): Promise<void> {
    if (activeTabId != null) await setReturnTabId(activeTabId);
    const { name, urlPattern } = suggestScriptTarget(currentUrl);
    const script = await saveScript(createEmptyScript(name, urlPattern));
    await browser.tabs.create({ url: browser.runtime.getURL(`/options.html?script=${script.id}`) });
    window.close();
  }

  // file: URLs have no host component ("file:///path"), so hostname alone
  // would be blank and wrongly read as "no active tab" — fall back to the
  // file name in that case.
  function safePageLabel(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.hostname) return parsed.hostname;
      if (parsed.protocol === 'file:') return parsed.pathname.split('/').pop() || parsed.pathname;
      return '';
    } catch {
      return '';
    }
  }
</script>

<main class="flex max-h-[600px] w-full min-w-[300px] max-w-[380px] flex-col bg-canvas text-ink-1">
  <header class="flex shrink-0 items-center gap-2.5 px-4 py-3.5">
    <div class="relative flex h-7 w-7 shrink-0 items-center justify-center">
      <div class="absolute inset-[-8px] -z-10 rounded-full bg-accent-500/35 blur-[6px]"></div>
      <div class="flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent-500 text-accent-ink">
        <BrandIcon size={20} />
      </div>
    </div>
    <span class="text-[13.5px] font-bold tracking-tight">Formaster</span>
    <button
      type="button"
      class="ml-auto flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-hover hover:text-ink-1"
      title="Open documentation"
      aria-label="Open documentation"
      onclick={openDocs}
    >
      <BookOpenIcon size={15} weight="bold" />
    </button>
    <button
      type="button"
      class="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-hover hover:text-ink-1"
      title="Open script library"
      aria-label="Open script library"
      onclick={openLibrary}
    >
      <GearSixIcon size={15} weight="bold" />
    </button>
  </header>

  {#if loading}
    <div class="space-y-2 px-4 pb-4">
      <div class="h-3 w-32 animate-pulse rounded bg-surface"></div>
      <div class="h-14 animate-pulse rounded-xl bg-surface"></div>
      <div class="h-14 animate-pulse rounded-xl bg-surface"></div>
    </div>
  {:else}
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center gap-1.5 px-4 pb-2 text-[11px] text-ink-3">
        <GlobeIcon size={10} />
        <span class="truncate">{pageLabel || 'No active tab'}</span>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-4">
      {#if matchingScripts.length > 0}
        <ul>
          {#each matchingScripts as script (script.id)}
            {@const state = runState[script.id] ?? 'idle'}
            {@const fieldCount = script.steps.filter((step) => step.type === 'field').length}
            <li class="flex items-center gap-2 border-b border-hair py-3.5 last:border-none">
              <div class="min-w-0 flex-1">
                <p class="truncate text-[12.8px] font-semibold">{script.name}</p>
                <p class="mt-1.5">
                  {#if state === 'idle' || state === 'running'}
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-2 py-[3px] text-[10.5px] font-semibold tabular-nums text-ink-2"
                    >
                      <ListBulletsIcon size={10} weight="bold" />
                      {fieldCount} field{fieldCount === 1 ? '' : 's'}
                    </span>
                  {:else if state === 'done'}
                    <span class="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-400">
                      <CheckCircleIcon size={11} weight="fill" />
                      {runSummary[script.id]}
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1 text-[10.5px] font-semibold text-red-400">
                      <WarningCircleIcon size={11} weight="fill" />
                      {runSummary[script.id]}
                    </span>
                  {/if}
                </p>
              </div>

              <button
                type="button"
                class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-hover hover:text-ink-1"
                title="Edit script"
                aria-label="Edit script"
                onclick={() => editScript(script)}
              >
                <PencilSimpleIcon size={13} weight="bold" />
              </button>

              <button
                type="button"
                class="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border transition active:scale-90 disabled:pointer-events-none disabled:opacity-70 {state ===
                'error'
                  ? 'border-red-500/40 bg-red-500/10 text-red-400'
                  : state === 'done'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : 'border-hair text-ink-1 hover:border-accent-500 hover:bg-accent-500/10 hover:text-accent-500'}"
                disabled={state === 'running'}
                aria-label={state === 'error' ? 'Retry' : state === 'done' ? 'Filled' : state === 'running' ? 'Running' : 'Run'}
                onclick={() => runScript(script)}
              >
                {#if state === 'running'}
                  <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-3/40 border-t-ink-1"></span>
                {:else if state === 'done'}
                  <CheckCircleIcon size={15} weight="fill" />
                {:else if state === 'error'}
                  <WarningCircleIcon size={15} weight="fill" />
                {:else}
                  <PlayIcon size={13} weight="fill" />
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-hair px-4 py-6 text-center">
          <p class="text-[12.8px] font-semibold">No script for this site yet</p>
          <p class="text-[11.5px] text-ink-3">Map the fields on this page once, then run them here anytime.</p>
          <button
            type="button"
            class="mt-1.5 flex items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-[11.5px] font-semibold text-ink-1 transition hover:bg-surface-hover"
            onclick={createScriptForThisPage}
          >
            <PlusIcon size={12} weight="bold" />
            Create empty script for this page
          </button>
        </div>
      {/if}
      </div>
    </div>

    <div class="shrink-0 px-4 pb-3.5 pt-3">
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-[11px] py-3 text-[12.5px] font-bold transition active:scale-[0.98] {matchingScripts.length >
        0
          ? 'border border-dashed border-accent-500/45 text-accent-500 hover:bg-accent-500/10'
          : 'bg-accent-500 text-accent-ink hover:bg-accent-600'}"
        onclick={startMapping}
      >
        <CursorClickIcon size={15} weight="bold" />
        Map fields on this page
      </button>
    </div>
  {/if}

  <footer class="shrink-0 border-t border-hair px-4 py-2.5">
    <button type="button" class="flex items-center gap-1.5 text-[11.5px] text-ink-3 transition hover:text-ink-1" onclick={openLibrary}>
      <FolderOpenIcon size={13} weight="bold" />
      Open script library
    </button>
  </footer>
</main>
