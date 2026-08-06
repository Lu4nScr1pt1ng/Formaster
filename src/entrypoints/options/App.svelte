<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import BookOpenIcon from 'phosphor-svelte/lib/BookOpenIcon';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
  import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
  import FlaskIcon from 'phosphor-svelte/lib/FlaskIcon';
  import FolderIcon from 'phosphor-svelte/lib/FolderIcon';
  import FolderOpenIcon from 'phosphor-svelte/lib/FolderOpenIcon';
  import ListIcon from 'phosphor-svelte/lib/ListIcon';
  import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import { browser } from 'wxt/browser';
  import BrandIcon from '../../components/BrandIcon.svelte';
  import ImportDialog, { type ImportPayload } from '../../components/ImportDialog.svelte';
  import ScriptEditor from '../../components/ScriptEditor.svelte';
  import UnsavedChangesDialog from '../../components/UnsavedChangesDialog.svelte';
  import ToastHost from '../../components/ToastHost.svelte';
  import type { RuntimeMessage } from '../../lib/messaging/types';
  import {
    createEmptyScript,
    duplicateScript,
    formScriptSchema,
    formatValidationError,
    type FormScript,
  } from '../../lib/schema/script';
  import { createEmptyFlow, type Flow } from '../../lib/schema/flow';
  import { applyScriptOrder, moveByOffset, moveWithin } from '../../lib/script-order';
  import { listFlowOrders, moveScriptToFlow, setFlowOrder } from '../../lib/storage/script-order-store';
  import { createUnsavedGuard } from '../../lib/unsaved-guard.svelte';
  import {
    applyFlowBundlePlan,
    buildFlowBundle,
    downloadFlowBundle,
    type FlowBundlePlan,
  } from '../../lib/storage/flow-bundle-store';
  import { listFlows } from '../../lib/storage/flows-store';
  import { setReturnTabId } from '../../lib/storage/return-tab-store';
  import { deleteScript, downloadScriptAsJson, listScripts, saveScript } from '../../lib/storage/scripts-store';
  import { pushToast } from '../../lib/toast/toast-store.svelte';

  let scripts = $state<FormScript[]>([]);
  let flows = $state<Flow[]>([]);
  let selectedId = $state<string | null>(null);
  let searchQuery = $state('');
  let importDialogOpen = $state(false);
  // Bumped to force the open ScriptEditor to remount after an import
  // rewrites the data under it — see `handleImportFlow`.
  let editorEpoch = $state(0);

  // Selecting another script destroys the editor (the `{#key}` below), so
  // anything that changes the selection has to go through here first.
  const unsavedGuard = createUnsavedGuard();
  // Below the `md` breakpoint the sidebar becomes an off-canvas drawer
  // instead of a static column — there isn't room for both side by side down
  // to ~300px wide. Ignored at `md` and up, where the sidebar is always shown.
  let sidebarOpen = $state(false);

  const selectedScript = $derived(scripts.find((script) => script.id === selectedId) ?? null);

  // The open editor's unsaved name/Flow, reported by ScriptEditor. Applied
  // on top of the stored list below so renaming a script — or moving it to
  // another Flow — is reflected in the sidebar immediately, instead of only
  // once the user hits Save.
  let liveDraft = $state<{ id: string; name: string; flowId: string; flowName: string } | null>(null);

  // Switching scripts discards the previous editor's unsaved edits (it
  // remounts against stored state), so the sidebar has to stop showing them
  // too — otherwise a rename the user abandoned would linger in the list.
  $effect(() => {
    const id = selectedId;
    untrack(() => {
      if (liveDraft && liveDraft.id !== id) liveDraft = null;
    });
  });

  const displayScripts = $derived.by(() => {
    // Narrowed into a local first — TS can't carry the null check through
    // the `.map()` closure that reads the reactive `liveDraft` again.
    const draft = liveDraft;
    if (draft === null) return scripts;
    return scripts.map((script) => (script.id === draft.id ? { ...script, name: draft.name, flowId: draft.flowId } : script));
  });

  // One linear pass over an in-memory array already held for the sidebar —
  // O(n) time / O(1) extra space, which is optimal for a one-shot scan and
  // plenty fast at the scale of a personal script library (no need for a
  // persistent search index here).
  const filteredScripts = $derived(filterScripts(displayScripts, searchQuery));

  function filterScripts(list: FormScript[], query: string): FormScript[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (script) =>
        script.name.toLowerCase().includes(needle) ||
        script.urlPatterns.some((pattern) => pattern.toLowerCase().includes(needle)),
    );
  }

  interface ScriptGroup {
    flowId: string;
    name: string;
    scripts: FormScript[];
    /** Only used to keep folder order stable; not rendered. */
    createdAt: string;
  }

  // Every script lives in a Flow, so every script shows up inside that
  // Flow's folder — including a Flow with a single script. Uniform on
  // purpose: a new script has to land somewhere visible, and moving one to
  // another Flow has to visibly move it between folders.
  let flowOrders = $state<Record<string, string[]>>({});
  const groupedScripts = $derived(groupByFlow(filteredScripts, flows, liveDraft, flowOrders));
  let collapsedFlowIds = $state(new Set<string>());

  function toggleFlowFolder(flowId: string): void {
    const next = new Set(collapsedFlowIds);
    if (next.has(flowId)) next.delete(flowId);
    else next.add(flowId);
    collapsedFlowIds = next;
  }

  // Selecting a script that lives in a collapsed folder (a ?script= deep
  // link, or a picker/refresh broadcast) has to reveal it — otherwise the
  // editor swaps to a script with no visible entry anywhere in the list.
  // `collapsedFlowIds` is read inside `untrack` on purpose: tracking it
  // would make this effect re-run on every collapse and immediately undo
  // it, so a folder holding the selected script could never be closed.
  $effect(() => {
    const id = selectedId;
    const list = scripts;
    untrack(() => {
      const selected = list.find((script) => script.id === id);
      if (!selected || !collapsedFlowIds.has(selected.flowId)) return;
      const next = new Set(collapsedFlowIds);
      next.delete(selected.flowId);
      collapsedFlowIds = next;
    });
  });

  function groupByFlow(list: FormScript[], allFlows: Flow[], draft: typeof liveDraft, orders: Record<string, string[]>): ScriptGroup[] {
    const flowsById = new Map(allFlows.map((flow) => [flow.id, flow]));
    const buckets = new Map<string, FormScript[]>();
    for (const script of list) {
      if (!buckets.has(script.flowId)) buckets.set(script.flowId, []);
      buckets.get(script.flowId)!.push(script);
    }

    const groups = [...buckets.entries()].map(([flowId, scriptsInFlow]) => {
      const stored = flowsById.get(flowId);
      // A Flow the editor just created (or just renamed) isn't in storage
      // yet, so its folder takes the name straight off the live draft.
      const name = draft?.flowId === flowId ? draft.flowName : stored?.name;
      return {
        flowId,
        name: name || stored?.name || 'Untitled flow',
        scripts: applyScriptOrder(scriptsInFlow, orders[flowId]),
        createdAt: stored?.createdAt ?? '',
      };
    });

    // Folder order used to be "first flowId seen while walking the scripts",
    // which made folders jump around whenever a script was reassigned. The
    // Flow's own creation time is stable and roughly matches the order they
    // were made in.
    return groups.sort((a, b) => (a.createdAt === b.createdAt ? a.name.localeCompare(b.name) : a.createdAt < b.createdAt ? -1 : 1));
  }

  onMount(() => {
    // A picker session can also finish while this tab is already open —
    // background.ts broadcasts this instead of relying on a fresh mount.
    // Registered synchronously (not inside the async load below) so the
    // function returned here is recognized by Svelte as a real teardown
    // callback and the listener actually gets removed on unmount — an
    // `onMount(async () => ...)` callback returns a Promise instead, which
    // Svelte can't call as a cleanup function.
    function handleMessage(message: RuntimeMessage): void {
      if (message.type === 'scripts/refresh') {
        void refreshAndSelect(message.scriptId);
      } else if (message.type === 'flows/refresh') {
        void refreshFlows();
      } else if (message.type === 'scriptOrder/refresh') {
        // List-only: another tab rearranging must never move this tab's
        // selection or disturb an editor open next to it.
        void refreshOrdersAndScripts();
      }
    }
    browser.runtime.onMessage.addListener(handleMessage);

    void loadInitialScripts();

    return () => browser.runtime.onMessage.removeListener(handleMessage);
  });

  // The "Formaster" sidebar header renders unconditionally, before this
  // page's own storage read finishes — nothing here blocks the user from
  // clicking "New"/"Import"/"Duplicate" (all synchronous, local-only until
  // saved) while a `listScripts()` call from `loadInitialScripts` or
  // `refreshAndSelect` is still in flight. Blindly assigning `scripts =
  // await listScripts()` after that await would then wipe out whatever
  // unsaved draft the user just created, since storage has never heard of
  // it — this merges storage's view back in without discarding anything
  // local-only. Storage still wins for any id it does know about (edits,
  // deletes), a draft only survives until it's actually saved (at which
  // point it shows up in `stored` under its own id and this becomes a no-op
  // for it).
  function mergeWithLocalDrafts(stored: FormScript[]): FormScript[] {
    const draftsOnly = scripts.filter((script) => !stored.some((existing) => existing.id === script.id));
    return [...stored, ...draftsOnly];
  }

  async function refreshFlows(): Promise<void> {
    flows = await listFlows();
    flowOrders = await listFlowOrders(flows.map((flow) => flow.id));
  }

  async function loadInitialScripts(): Promise<void> {
    const [stored] = await Promise.all([listScripts(), refreshFlows()]);
    scripts = mergeWithLocalDrafts(stored);

    // Deep link from the popup's "Edit" button, "Create empty script for
    // this page", or a picker session finishing while no options tab was
    // open yet: ?script=<id>. Picker-finished scripts always exist in
    // storage by the time this runs — background.ts saves them for real
    // before ever creating or focusing an options tab.
    const requestedId = new URLSearchParams(location.search).get('script');
    if (requestedId && scripts.some((script) => script.id === requestedId)) {
      selectedId = requestedId;
    } else if (selectedId === null && scripts.length > 0) {
      // Only a *default* preselect for whenever nothing's selected yet — must
      // not stomp a selection the user already made (e.g. clicking "New")
      // while this load was still in flight.
      selectedId = scripts[0].id;
    }
  }

  async function refreshAndSelect(scriptId: string): Promise<void> {
    const [stored] = await Promise.all([listScripts(), refreshFlows()]);
    scripts = mergeWithLocalDrafts(stored);
    if (!scripts.some((script) => script.id === scriptId)) return;
    // This comes from another tab's broadcast, not from anything the user
    // did here — so it never prompts. Jumping away from unsaved work
    // unasked would be worse than not following the broadcast, so it just
    // updates the list and stays put.
    if (unsavedGuard.isDirty()) {
      pushToast('Another tab changed a script — staying on your unsaved edits', 'info', 5000);
      return;
    }
    selectedId = scriptId;
  }

  async function refreshOrdersAndScripts(): Promise<void> {
    const [stored] = await Promise.all([listScripts(), refreshFlows()]);
    scripts = mergeWithLocalDrafts(stored);
  }

  /** Live announcement for the keyboard path, since a reorder has no other feedback for a screen reader. */
  let reorderAnnouncement = $state('');

  function scriptIdsIn(flowId: string): string[] {
    return groupedScripts.find((group) => group.flowId === flowId)?.scripts.map((script) => script.id) ?? [];
  }

  /** Reorders within a Flow. Persisting the ids is all it takes — no script record is touched. */
  async function reorderWithin(flowId: string, nextIds: string[]): Promise<void> {
    flowOrders = { ...flowOrders, [flowId]: nextIds };
    await setFlowOrder(flowId, nextIds);
  }

  async function moveScriptWithinFlow(script: FormScript, offset: -1 | 1): Promise<void> {
    const ids = scriptIdsIn(script.flowId);
    const next = moveByOffset(ids, script.id, offset);
    if (next === ids) return;
    await reorderWithin(script.flowId, next);
    reorderAnnouncement = `${script.name} moved ${offset === -1 ? 'up' : 'down'}, position ${next.indexOf(script.id) + 1} of ${next.length}`;
  }

  async function dropScriptOnScript(draggedId: string, targetId: string, position: 'before' | 'after'): Promise<void> {
    const dragged = scripts.find((entry) => entry.id === draggedId);
    const target = scripts.find((entry) => entry.id === targetId);
    if (!dragged || !target || draggedId === targetId) return;

    if (dragged.flowId === target.flowId) {
      const ids = scriptIdsIn(dragged.flowId);
      // The list may not name every script yet (a fresh import, a script
      // just moved in), so normalize to the rendered order before moving.
      const normalized = ids.includes(draggedId) ? ids : [...ids, draggedId];
      await reorderWithin(dragged.flowId, moveWithin(normalized, draggedId, targetId, position));
      return;
    }
    const targetIds = scriptIdsIn(target.flowId);
    const at = targetIds.indexOf(targetId);
    await moveScriptToOtherFlow(dragged, target.flowId, position === 'before' ? at : at + 1);
  }

  async function moveScriptToOtherFlow(script: FormScript, toFlowId: string, index: number): Promise<void> {
    if (script.flowId === toFlowId) return;
    // Moving the script that's open rewrites the `flowId` in storage while
    // the editor still holds the old one in its draft — saving afterwards
    // would quietly move it back. Settle the draft first, then remount so
    // the editor reloads the Flow it now belongs to.
    if (script.id === selectedId) {
      unsavedGuard.run(() => void performFlowMove(script, toFlowId, index));
      return;
    }
    await performFlowMove(script, toFlowId, index);
  }

  async function performFlowMove(script: FormScript, toFlowId: string, index: number): Promise<void> {
    const fromFlowId = script.flowId;
    const flowName = groupedScripts.find((group) => group.flowId === toFlowId)?.name ?? 'another flow';
    try {
      const { removedEmptyFlow } = await moveScriptToFlow(script.id, fromFlowId, toFlowId, index);
      await refreshOrdersAndScripts();
      if (script.id === selectedId) {
        // Its Flow changed underneath the editor; remount so `loadFlowContext`
        // picks up the new one instead of showing the old Flow's name.
        liveDraft = null;
        editorEpoch += 1;
      }
      const emptied = groupedScripts.find((group) => group.flowId === fromFlowId)?.name;
      reorderAnnouncement = `${script.name} moved to ${flowName}`;
      pushToast(
        removedEmptyFlow
          ? `"${script.name}" moved to "${flowName}" — the now-empty flow${emptied ? ` "${emptied}"` : ''} was removed`
          : `"${script.name}" moved to "${flowName}"`,
        'success',
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Could not move that script', 'error', 6000);
    }
  }

  /** Alt+arrows: the keyboard equivalent of dragging, which HTML5 drag-and-drop offers no way to do. */
  function handleScriptKeydown(event: KeyboardEvent, script: FormScript): void {
    if (!event.altKey) return;
    const flowIds = groupedScripts.map((group) => group.flowId);
    const flowIndex = flowIds.indexOf(script.flowId);

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      void moveScriptWithinFlow(script, event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'ArrowLeft' && flowIndex > 0) {
      event.preventDefault();
      void moveScriptToOtherFlow(script, flowIds[flowIndex - 1], Number.MAX_SAFE_INTEGER);
    } else if (event.key === 'ArrowRight' && flowIndex < flowIds.length - 1) {
      event.preventDefault();
      void moveScriptToOtherFlow(script, flowIds[flowIndex + 1], Number.MAX_SAFE_INTEGER);
    }
  }

  // Which row the pointer is currently over during a drag, and on which
  // half — drives the insertion line so the drop isn't a guess.
  let dragging = $state<{ id: string; flowId: string } | null>(null);
  let dropTarget = $state<{ id: string; position: 'before' | 'after' } | null>(null);
  let dropFlowId = $state<string | null>(null);

  function handleDragOverScript(event: DragEvent, script: FormScript): void {
    if (!dragging) return;
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropTarget = { id: script.id, position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' };
    dropFlowId = null;
  }

  function endDrag(): void {
    dragging = null;
    dropTarget = null;
    dropFlowId = null;
  }

  /** Every user-initiated selection change funnels through here so unsaved work gets a prompt first. */
  function selectScript(id: string): void {
    if (id === selectedId) return;
    unsavedGuard.run(() => {
      selectedId = id;
      sidebarOpen = false;
    });
  }

  function createScript(): void {
    // Not persisted here — same "draft until actually saved" spirit as the
    // script itself. `flowId` just needs to be a stable id from here on;
    // `ScriptEditor` treats a `flowId` with nothing in `flows-store` yet as
    // an implicit single-script Flow named after the script, and persists it
    // the first time the script itself is saved.
    const flow = createEmptyFlow('New script');
    const script = createEmptyScript('New script', '*://*/*', flow.id);
    unsavedGuard.run(() => {
      scripts = [...scripts, script];
      selectedId = script.id;
    });
  }

  async function openPlayground(): Promise<void> {
    // So the playground's embedded editor's "Close"/"Save & close" can jump
    // back to this exact tab instead of just closing to whatever was
    // underneath (see `ScriptEditor.closeEditor` / `return-tab-store.ts`).
    const currentTab = await browser.tabs.getCurrent();
    if (currentTab?.id != null) await setReturnTabId(currentTab.id);
    await browser.tabs.create({ url: browser.runtime.getURL('/playground.html') });
  }

  async function openDocs(): Promise<void> {
    await browser.tabs.create({ url: browser.runtime.getURL('/docs.html') });
  }

  function handleDuplicate(script: FormScript): void {
    const copy = duplicateScript(script);
    unsavedGuard.run(() => {
      scripts = [...scripts, copy];
      selectedId = copy.id;
      pushToast(`"${copy.name}" created — remember to save it`, 'info');
    });
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
    scripts = mergeWithLocalDrafts(await listScripts());
    selectedId = saved.id;
    pushToast(`"${saved.name}" saved`, 'success');
    return saved;
  }

  async function handleDelete(id: string): Promise<void> {
    const name = scripts.find((script) => script.id === id)?.name ?? 'Script';
    await deleteScript(id);
    const [stored] = await Promise.all([listScripts(), refreshFlows()]);
    scripts = mergeWithLocalDrafts(stored).filter((script) => script.id !== id);
    selectedId = scripts[0]?.id ?? null;
    pushToast(`"${name}" deleted`, 'info');
  }

  function handleExport(script: FormScript): void {
    downloadScriptAsJson(script);
    pushToast(`"${script.name}" exported`, 'success');
  }

  async function handleExportFlow(flowId: string): Promise<void> {
    try {
      const { bundle, missingTemplateIds } = await buildFlowBundle(flowId);
      downloadFlowBundle(bundle);
      const templateCount = bundle.fileTemplates.length;
      pushToast(
        `"${bundle.flow.name}" exported — ${bundle.scripts.length} script${bundle.scripts.length === 1 ? '' : 's'}` +
          `${templateCount > 0 ? `, ${templateCount} file template${templateCount === 1 ? '' : 's'}` : ''} (last saved state)`,
        'success',
      );
      if (missingTemplateIds.length > 0) {
        pushToast(`${missingTemplateIds.length} file template reference could not be found and was not included`, 'error', 6000);
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Could not export this flow', 'error', 6000);
    }
  }

  async function handleImport(payload: ImportPayload): Promise<void> {
    if (payload.kind === 'script') {
      const saved = await saveScript(payload.script);
      scripts = mergeWithLocalDrafts(await listScripts());
      selectedId = saved.id;
      importDialogOpen = false;
      pushToast(`"${saved.name}" imported`, 'success');
      return;
    }
    await handleImportFlow(payload.plan);
  }

  async function handleImportFlow(plan: FlowBundlePlan): Promise<void> {
    try {
      await applyFlowBundlePlan(plan);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Could not import this flow', 'error', 8000);
      return;
    }
    const [stored] = await Promise.all([listScripts(), refreshFlows()]);
    scripts = mergeWithLocalDrafts(stored);
    selectedId = plan.scripts[0].id;
    // The editor for the selected script may already be mounted, and store
    // broadcasts don't come back to the page that sent them — force a
    // remount so it reloads the flow, sibling scripts and templates.
    editorEpoch += 1;
    importDialogOpen = false;
    pushToast(`"${plan.flow.name}" imported — ${plan.scripts.length} script${plan.scripts.length === 1 ? '' : 's'}`, 'success');
    for (const warning of plan.warnings) pushToast(warning, 'info', 8000);
  }
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
      : 'hidden'} fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] flex-col border-r border-hair bg-sidebar md:static md:z-auto md:flex md:w-64 md:max-w-none md:shrink-0"
  >
    <div class="flex items-center gap-2 px-4 py-4">
      <div class="relative flex h-[22px] w-[22px] shrink-0 items-center justify-center">
        <div class="absolute inset-[-6px] -z-10 rounded-full bg-accent-500/35 blur-[5px]"></div>
        <div class="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-accent-500 text-accent-ink">
          <BrandIcon size={15} />
        </div>
      </div>
      <span class="text-[13px] font-bold tracking-tight">Formaster</span>
      <button
        type="button"
        class="ml-auto rounded-lg p-1 text-ink-3 hover:bg-surface-hover hover:text-ink-1 md:hidden"
        aria-label="Close menu"
        onclick={() => (sidebarOpen = false)}
      >
        <XIcon size={15} weight="bold" />
      </button>
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
        onclick={() => unsavedGuard.run(() => (importDialogOpen = true))}
      >
        <UploadSimpleIcon size={13} weight="bold" />
        Import
      </button>
    </div>

    <div class="flex gap-2 px-4 pb-3">
      <button
        type="button"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hair px-2 py-1.5 text-xs transition active:scale-[0.97] hover:bg-surface-hover"
        onclick={openPlayground}
      >
        <FlaskIcon size={13} weight="bold" />
        Playground
      </button>
      <button
        type="button"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hair px-2 py-1.5 text-xs transition active:scale-[0.97] hover:bg-surface-hover"
        onclick={openDocs}
      >
        <BookOpenIcon size={13} weight="bold" />
        Docs
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

    <!-- Dragging gives sighted users feedback on its own; this is the only
         feedback the keyboard path (Alt+arrows) has. -->
    <p class="sr-only" role="status" aria-live="polite">{reorderAnnouncement}</p>

    <nav class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
      {#each groupedScripts as group (group.flowId)}
        {@const open = !collapsedFlowIds.has(group.flowId)}
        <!-- The export action is a sibling of the toggle, not nested inside
             it: a <button> inside a <button> is invalid HTML and the inner
             one never receives its own click. -->
        <div
          class="group flex items-center gap-0.5 rounded-lg transition hover:bg-surface-hover {dropFlowId === group.flowId
            ? 'ring-1 ring-accent-500'
            : ''}"
          data-flow-id={group.flowId}
          role="presentation"
          ondragover={(event) => {
            if (!dragging || dragging.flowId === group.flowId) return;
            event.preventDefault();
            dropFlowId = group.flowId;
            dropTarget = null;
          }}
          ondragleave={() => {
            if (dropFlowId === group.flowId) dropFlowId = null;
          }}
          ondrop={(event) => {
            if (!dragging) return;
            event.preventDefault();
            const script = scripts.find((entry) => entry.id === dragging!.id);
            // Dropped on the folder itself rather than between two scripts:
            // append, which is where a new arrival belongs.
            if (script) void moveScriptToOtherFlow(script, group.flowId, Number.MAX_SAFE_INTEGER);
            endDrag();
          }}
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-ink-2 transition group-hover:text-ink-1"
            aria-expanded={open}
            onclick={() => toggleFlowFolder(group.flowId)}
          >
            {#if open}
              <CaretDownIcon size={10} weight="bold" class="shrink-0 text-ink-3" />
              <FolderOpenIcon size={13} weight="fill" class="shrink-0 text-ink-3" />
            {:else}
              <CaretRightIcon size={10} weight="bold" class="shrink-0 text-ink-3" />
              <FolderIcon size={13} weight="fill" class="shrink-0 text-ink-3" />
            {/if}
            <span class="min-w-0 flex-1 truncate">{group.name}</span>
            <span class="shrink-0 text-[10px] tabular-nums text-ink-3">{group.scripts.length}</span>
          </button>
          <button
            type="button"
            class="mr-1 shrink-0 rounded-md p-1 text-ink-3 opacity-0 transition hover:bg-surface hover:text-ink-1 focus:opacity-100 group-hover:opacity-100"
            title="Export flow"
            aria-label="Export flow"
            onclick={() => handleExportFlow(group.flowId)}
          >
            <DownloadSimpleIcon size={12} weight="bold" />
          </button>
        </div>
        {#if open}
          <!-- `role="group"` labelled by the flow name: this is what makes
               "the scripts inside this folder" addressable, to assistive tech
               and to tests, without depending on the row's markup shape. -->
          <div class="ml-[13px] space-y-0.5 border-l border-hair pl-2" role="group" aria-label={group.name}>
            {#each group.scripts as script (script.id)}
              <button
                type="button"
                draggable="true"
                data-script-id={script.id}
                class="w-full truncate rounded-lg px-2 py-1.5 text-left text-[12.5px] transition {selectedId === script.id
                  ? 'bg-accent-500/13 font-semibold text-accent-500'
                  : 'text-ink-2 hover:bg-surface-hover hover:text-ink-1'} {dragging?.id === script.id
                  ? 'opacity-40'
                  : ''} {dropTarget?.id === script.id && dropTarget.position === 'before'
                  ? 'shadow-[inset_0_2px_0_0_var(--color-accent-500)]'
                  : ''} {dropTarget?.id === script.id && dropTarget.position === 'after'
                  ? 'shadow-[inset_0_-2px_0_0_var(--color-accent-500)]'
                  : ''}"
                title="Drag to reorder or move to another flow — or Alt with the arrow keys"
                onclick={() => selectScript(script.id)}
                onkeydown={(event) => handleScriptKeydown(event, script)}
                ondragstart={(event) => {
                  dragging = { id: script.id, flowId: script.flowId };
                  event.dataTransfer?.setData('text/plain', script.id);
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
                }}
                ondragover={(event) => handleDragOverScript(event, script)}
                ondrop={(event) => {
                  if (!dragging || !dropTarget) return;
                  event.preventDefault();
                  event.stopPropagation();
                  void dropScriptOnScript(dragging.id, dropTarget.id, dropTarget.position);
                  endDrag();
                }}
                ondragend={endDrag}
              >
                {script.name}
              </button>
            {/each}
          </div>
        {/if}
      {:else}
        <p class="px-3 py-2 text-xs text-ink-3">
          {scripts.length === 0 ? 'No scripts yet.' : 'No scripts match your search.'}
        </p>
      {/each}
    </nav>
  </aside>

  <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <div class="flex shrink-0 items-center gap-2 border-b border-hair px-3 py-2 md:hidden">
      <button
        type="button"
        class="rounded-lg p-1.5 text-ink-2 hover:bg-surface-hover hover:text-ink-1"
        aria-label="Open script list"
        onclick={() => (sidebarOpen = true)}
      >
        <ListIcon size={16} weight="bold" />
      </button>
      <span class="truncate text-xs font-medium text-ink-2">{selectedScript?.name ?? 'Formaster'}</span>
    </div>

    <div class="min-h-0 flex-1">
      {#if selectedScript}
        {#key `${selectedScript.id}:${editorEpoch}`}
          <ScriptEditor
            script={selectedScript}
            onSave={handleSave}
            onDelete={handleDelete}
            onExport={handleExport}
            onExportFlow={handleExportFlow}
            onDuplicate={handleDuplicate}
            onDraftChange={(draft) => (liveDraft = draft)}
            {unsavedGuard}
          />
        {/key}
      {:else}
        <div class="flex h-full items-center justify-center text-sm text-ink-3">Select or create a script to get started.</div>
      {/if}
    </div>
  </main>
</div>

<ImportDialog
  open={importDialogOpen}
  existingScripts={scripts}
  onImport={handleImport}
  onCancel={() => (importDialogOpen = false)}
/>

<UnsavedChangesDialog
  open={unsavedGuard.open}
  label={unsavedGuard.label}
  saving={unsavedGuard.saving}
  onCancel={unsavedGuard.cancel}
  onDiscard={unsavedGuard.discard}
  onSave={unsavedGuard.saveAndProceed}
/>

<ToastHost />
