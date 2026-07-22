<script lang="ts">
  import { onMount } from 'svelte';
  import MagicWandIcon from 'phosphor-svelte/lib/MagicWandIcon';
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
  import { browser } from 'wxt/browser';
  import ImportDialog from '../../components/ImportDialog.svelte';
  import ScriptEditor from '../../components/ScriptEditor.svelte';
  import ToastHost from '../../components/ToastHost.svelte';
  import type { RuntimeMessage } from '../../lib/messaging/types';
  import {
    createEmptyScript,
    duplicateScript,
    formScriptSchema,
    formatValidationError,
    type FormScript,
  } from '../../lib/schema/script';
  import { clearDraft, getDraft } from '../../lib/storage/draft-store';
  import { deleteScript, exportScript, listScripts, saveScript } from '../../lib/storage/scripts-store';
  import { pushToast } from '../../lib/toast/toast-store.svelte';
  import { suggestScriptTarget } from '../../lib/url-match';

  let scripts = $state<FormScript[]>([]);
  let selectedId = $state<string | null>(null);
  let searchQuery = $state('');
  let importDialogOpen = $state(false);

  const selectedScript = $derived(scripts.find((script) => script.id === selectedId) ?? null);

  // One linear pass over an in-memory array already held for the sidebar —
  // O(n) time / O(1) extra space, which is optimal for a one-shot scan and
  // plenty fast at the scale of a personal script library (no need for a
  // persistent search index here).
  const filteredScripts = $derived(filterScripts(scripts, searchQuery));

  function filterScripts(list: FormScript[], query: string): FormScript[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (script) =>
        script.name.toLowerCase().includes(needle) ||
        script.urlPatterns.some((pattern) => pattern.toLowerCase().includes(needle)),
    );
  }

  onMount(async () => {
    scripts = await listScripts();

    const draft = await getDraft();
    if (draft) {
      const { name, urlPattern } = suggestScriptTarget(draft.pageUrl);
      const script = createEmptyScript(name, urlPattern);
      script.steps = draft.fields.map((field) => ({
        type: 'field',
        field: {
          id: crypto.randomUUID(),
          label: field.label,
          selectors: field.selectors,
          elementType: field.elementType,
          generator: { kind: 'fixed', value: '' },
        },
      }));
      scripts = [...scripts, script];
      selectedId = script.id;
      await clearDraft();
      return;
    }

    // Deep link from the popup's "Edit" button: ?script=<id>
    const requestedId = new URLSearchParams(location.search).get('script');
    if (requestedId && scripts.some((script) => script.id === requestedId)) {
      selectedId = requestedId;
    } else if (scripts.length > 0) {
      selectedId = scripts[0].id;
    }

    browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
      if (message.type === 'scripts/refresh') {
        void refreshAndSelect(message.scriptId);
      }
    });
  });

  async function refreshAndSelect(scriptId: string): Promise<void> {
    scripts = await listScripts();
    if (scripts.some((script) => script.id === scriptId)) {
      selectedId = scriptId;
    }
  }

  function createScript(): void {
    const script = createEmptyScript('New script', '*://*/*');
    scripts = [...scripts, script];
    selectedId = script.id;
  }

  function handleDuplicate(script: FormScript): void {
    const copy = duplicateScript(script);
    scripts = [...scripts, copy];
    selectedId = copy.id;
    pushToast(`"${copy.name}" created — remember to save it`, 'info');
  }

  async function handleSave(script: FormScript): Promise<FormScript> {
    // saveScript() writes straight to storage; validating first means a
    // broken script (e.g. a manually-added field with a blank selector)
    // gets a clear error here instead of silently vanishing on next load
    // (listScripts() drops entries that fail schema validation).
    const validation = formScriptSchema.safeParse(script);
    if (!validation.success) {
      const message = formatValidationError(validation.error);
      pushToast(`Could not save: ${message}`, 'error', 6000);
      throw new Error(message);
    }
    const saved = await saveScript(validation.data);
    scripts = await listScripts();
    selectedId = saved.id;
    pushToast(`"${saved.name}" saved`, 'success');
    return saved;
  }

  async function handleDelete(id: string): Promise<void> {
    const name = scripts.find((script) => script.id === id)?.name ?? 'Script';
    await deleteScript(id);
    scripts = await listScripts();
    selectedId = scripts[0]?.id ?? null;
    pushToast(`"${name}" deleted`, 'info');
  }

  function handleExport(script: FormScript): void {
    const json = exportScript(script);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${script.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'script'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    pushToast(`"${script.name}" exported`, 'success');
  }

  async function handleImportScript(script: FormScript): Promise<void> {
    const saved = await saveScript(script);
    scripts = await listScripts();
    selectedId = saved.id;
    importDialogOpen = false;
    pushToast(`"${saved.name}" imported`, 'success');
  }
</script>

<div class="flex h-screen bg-canvas text-ink-1">
  <aside class="flex w-64 shrink-0 flex-col border-r border-hair bg-sidebar">
    <div class="flex items-center gap-2 px-4 py-4">
      <div class="relative flex h-[22px] w-[22px] shrink-0 items-center justify-center">
        <div class="absolute inset-[-6px] -z-10 rounded-full bg-accent-500/35 blur-[5px]"></div>
        <div class="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-accent-500 text-accent-ink">
          <MagicWandIcon size={12} weight="bold" />
        </div>
      </div>
      <span class="text-[13px] font-bold tracking-tight">Formaster</span>
    </div>

    <div class="flex gap-2 px-4 pb-3">
      <button
        type="button"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-2 py-1.5 text-xs font-semibold text-accent-ink transition active:scale-[0.97] hover:bg-accent-600"
        onclick={createScript}
      >
        <PlusIcon size={13} weight="bold" />
        New
      </button>
      <button
        type="button"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hair px-2 py-1.5 text-xs transition active:scale-[0.97] hover:bg-surface-hover"
        onclick={() => (importDialogOpen = true)}
      >
        <UploadSimpleIcon size={13} weight="bold" />
        Import
      </button>
    </div>

    {#if scripts.length > 0}
      <div class="px-4 pb-3">
        <div class="relative">
          <MagnifyingGlassIcon size={12} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            placeholder="Search by name or URL…"
            class="w-full rounded-lg border border-hair bg-surface py-1.5 pl-7 pr-2 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-accent-500"
            bind:value={searchQuery}
          />
        </div>
      </div>
    {/if}

    <nav class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
      {#each filteredScripts as script (script.id)}
        <button
          type="button"
          class="w-full truncate rounded-lg px-3 py-2 text-left text-[12.5px] transition {selectedId === script.id
            ? 'bg-accent-500/13 font-semibold text-accent-500'
            : 'text-ink-2 hover:bg-surface-hover hover:text-ink-1'}"
          onclick={() => (selectedId = script.id)}
        >
          {script.name}
        </button>
      {:else}
        <p class="px-3 py-2 text-xs text-ink-3">
          {scripts.length === 0 ? 'No scripts yet.' : 'No scripts match your search.'}
        </p>
      {/each}
    </nav>
  </aside>

  <main class="flex-1 overflow-hidden">
    {#if selectedScript}
      {#key selectedScript.id}
        <ScriptEditor
          script={selectedScript}
          onSave={handleSave}
          onDelete={handleDelete}
          onExport={handleExport}
          onDuplicate={handleDuplicate}
        />
      {/key}
    {:else}
      <div class="flex h-full items-center justify-center text-sm text-ink-3">Select or create a script to get started.</div>
    {/if}
  </main>
</div>

<ImportDialog
  open={importDialogOpen}
  existingScripts={scripts}
  onImport={handleImportScript}
  onCancel={() => (importDialogOpen = false)}
/>

<ToastHost />
