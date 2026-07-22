<script lang="ts">
  import { onMount } from 'svelte';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import CursorClickIcon from 'phosphor-svelte/lib/CursorClickIcon';
  import FolderOpenIcon from 'phosphor-svelte/lib/FolderOpenIcon';
  import GearSixIcon from 'phosphor-svelte/lib/GearSixIcon';
  import GlobeIcon from 'phosphor-svelte/lib/GlobeIcon';
  import MagicWandIcon from 'phosphor-svelte/lib/MagicWandIcon';
  import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import SparkleIcon from 'phosphor-svelte/lib/SparkleIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import { browser } from 'wxt/browser';
  import type { FillFieldResult, RuntimeMessage } from '../../lib/messaging/types';
  import type { FormScript } from '../../lib/schema/script';
  import { listScripts } from '../../lib/storage/scripts-store';
  import { matchesAnyPattern } from '../../lib/url-match';

  type RunState = 'idle' | 'running' | 'done' | 'error';

  let loading = $state(true);
  let currentUrl = $state('');
  let matchingScripts = $state<FormScript[]>([]);
  let activeTabId = $state<number | null>(null);
  let runState = $state<Record<string, RunState>>({});
  let runSummary = $state<Record<string, string>>({});

  const hostname = $derived(safeHostname(currentUrl));

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
    await browser.tabs.create({ url: browser.runtime.getURL(`/options.html?script=${script.id}`) });
    window.close();
  }

  async function startMapping(): Promise<void> {
    if (activeTabId == null) return;
    await browser.tabs.sendMessage(activeTabId, { type: 'picker/start' } satisfies RuntimeMessage);
    window.close();
  }

  function openLibrary(): void {
    void browser.runtime.openOptionsPage();
  }

  function safeHostname(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }
</script>

<main class="w-[360px] bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
  <header class="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
    <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-500 text-white">
      <MagicWandIcon size={16} weight="bold" />
    </div>
    <span class="text-sm font-semibold">Formaster</span>
    <button
      type="button"
      class="ml-auto rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
      title="Open script library"
      aria-label="Open script library"
      onclick={openLibrary}
    >
      <GearSixIcon size={16} weight="bold" />
    </button>
  </header>

  {#if loading}
    <div class="space-y-2 px-4 py-3">
      <div class="h-3 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800"></div>
      <div class="h-14 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900"></div>
      <div class="h-14 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900"></div>
    </div>
  {:else}
    <div class="flex items-center gap-1.5 px-4 pt-3 text-xs text-neutral-500 dark:text-neutral-400">
      <GlobeIcon size={12} />
      <span class="truncate">{hostname || 'No active tab'}</span>
    </div>

    <div class="px-4 py-3">
      {#if matchingScripts.length > 0}
        <ul class="space-y-2">
          {#each matchingScripts as script (script.id)}
            {@const state = runState[script.id] ?? 'idle'}
            {@const fieldCount = script.steps.filter((step) => step.type === 'field').length}
            <li class="rounded-lg border border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
              <div class="flex items-center gap-2">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{script.name}</p>
                  <p class="text-xs text-neutral-500 dark:text-neutral-400">
                    {#if state === 'idle' || state === 'running'}
                      {fieldCount} field{fieldCount === 1 ? '' : 's'}
                    {:else}
                      {runSummary[script.id]}
                    {/if}
                  </p>
                </div>

                <button
                  type="button"
                  class="shrink-0 rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
                  title="Edit script"
                  aria-label="Edit script"
                  onclick={() => editScript(script)}
                >
                  <PencilSimpleIcon size={14} weight="bold" />
                </button>

                <button
                  type="button"
                  class="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.96] disabled:opacity-70
                  {state === 'error' ? 'bg-red-600' : state === 'done' ? 'bg-emerald-600' : 'bg-accent-600 hover:bg-accent-700'}"
                  disabled={state === 'running'}
                  onclick={() => runScript(script)}
                >
                  {#if state === 'running'}
                    <span
                      class="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    ></span>
                    Running
                  {:else if state === 'done'}
                    <CheckCircleIcon size={13} weight="fill" />
                    Filled
                  {:else if state === 'error'}
                    <WarningCircleIcon size={13} weight="fill" />
                    Retry
                  {:else}
                    <PlayIcon size={12} weight="fill" />
                    Run
                  {/if}
                </button>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center dark:border-neutral-700">
          <SparkleIcon size={22} class="text-neutral-400 dark:text-neutral-600" />
          <p class="text-sm font-medium">No script for this site yet</p>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            Map the fields on this page once, then run them here anytime.
          </p>
        </div>
      {/if}
    </div>

    <div class="px-4 pb-3">
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition active:scale-[0.98]
        {matchingScripts.length > 0
          ? 'border border-dashed border-accent-400 text-accent-600 hover:bg-accent-50 dark:text-accent-400 dark:hover:bg-accent-500/10'
          : 'bg-accent-600 text-white hover:bg-accent-700'}"
        onclick={startMapping}
      >
        <CursorClickIcon size={15} weight="bold" />
        Map fields on this page
      </button>
    </div>
  {/if}

  <footer class="border-t border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
    <button
      type="button"
      class="flex items-center gap-1.5 text-xs text-neutral-500 transition hover:text-accent-600 dark:text-neutral-400 dark:hover:text-accent-400"
      onclick={openLibrary}
    >
      <FolderOpenIcon size={13} weight="bold" />
      Open script library
    </button>
  </footer>
</main>
