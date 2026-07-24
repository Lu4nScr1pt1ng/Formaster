<script lang="ts">
  import { browser } from 'wxt/browser';
  import BracketsCurlyIcon from 'phosphor-svelte/lib/BracketsCurlyIcon';
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import CopySimpleIcon from 'phosphor-svelte/lib/CopySimpleIcon';
  import CursorClickIcon from 'phosphor-svelte/lib/CursorClickIcon';
  import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
  import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
  import HourglassIcon from 'phosphor-svelte/lib/HourglassIcon';
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import SignOutIcon from 'phosphor-svelte/lib/SignOutIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import TimerIcon from 'phosphor-svelte/lib/TimerIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import CodeEditor from './CodeEditor.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import DelayStepRow from './DelayStepRow.svelte';
  import FieldRow from './FieldRow.svelte';
  import WaitForStepRow from './WaitForStepRow.svelte';
  import { fieldContextKey, type FieldValueContext } from '../lib/filler/fill-script';
  import { runBuiltinGenerator, type GeneratorRunContext } from '../lib/generators';
  import { runCustomCode } from '../lib/generators/quickjs-runner';
  import type { RuntimeMessage } from '../lib/messaging/types';
  import {
    formScriptSchema,
    formatValidationError,
    type DelayStep,
    type FieldMapping,
    type FormScript,
    type GeneratorRef,
    type ScriptStep,
    type WaitForStep,
  } from '../lib/schema/script';
  import { getReturnTabId } from '../lib/storage/return-tab-store';
  import { pushToast } from '../lib/toast/toast-store.svelte';

  interface Props {
    script: FormScript;
    onSave: (script: FormScript) => Promise<FormScript>;
    onDelete: (id: string) => void;
    onExport: (script: FormScript) => void;
    onDuplicate: (script: FormScript) => void;
  }

  let { script, onSave, onDelete, onExport, onDuplicate }: Props = $props();

  // Local editable copy so navigating away without saving doesn't mutate storage.
  // `script` is itself a reactive $state proxy; $state.snapshot() resolves it to an
  // independent plain deep clone (structuredClone would throw on the proxy directly).
  // Deliberately a one-time capture, not a $derived — this needs to be independently
  // mutable, and the $effect below handles resyncing it when `script` genuinely changes.
  // svelte-ignore state_referenced_locally
  let draft = $state<FormScript>($state.snapshot(script));

  // Tracks the updatedAt we ourselves last persisted, so the effect below can
  // tell "this script changed because something else touched it" (e.g. the
  // background appending fields from "Add fields from page") apart from
  // "this script changed because we just saved it" — only the former should
  // resync the draft. A plain full remount on every save would also work,
  // but it wipes local UI state (open code panel, expanded selectors, etc).
  // svelte-ignore state_referenced_locally
  let lastSyncedUpdatedAt = $state(script.updatedAt);

  $effect(() => {
    if (script.updatedAt !== lastSyncedUpdatedAt) {
      draft = $state.snapshot(script);
      lastSyncedUpdatedAt = script.updatedAt;
    }
  });

  let saveFlash = $state(false);
  let justAddedFieldId = $state<string | null>(null);
  let confirmDeleteScriptOpen = $state(false);
  let confirmDeleteGeneratorId = $state<string | null>(null);
  const confirmDeleteGeneratorName = $derived(
    draft.customGenerators.find((generator) => generator.id === confirmDeleteGeneratorId)?.name ?? '',
  );

  let showJsonView = $state(false);
  let jsonText = $state('');
  let jsonError = $state<string | null>(null);
  let isJsonEdit = $state(false);

  $effect(() => {
    const serialized = JSON.stringify(draft, null, 2);
    if (!isJsonEdit) jsonText = serialized;
  });

  function handleJsonChange(text: string): void {
    jsonText = text;
    isJsonEdit = true;
    try {
      draft = formScriptSchema.parse(JSON.parse(text));
      jsonError = null;
    } catch (error) {
      jsonError = error instanceof SyntaxError ? `Invalid JSON: ${error.message}` : formatValidationError(error);
    }
  }

  function addCustomGenerator(): void {
    draft.customGenerators = [
      ...draft.customGenerators,
      { id: crypto.randomUUID(), name: `Generator ${draft.customGenerators.length + 1}`, code: 'return "value";' },
    ];
  }

  function removeCustomGenerator(id: string): void {
    draft.customGenerators = draft.customGenerators.filter((generator) => generator.id !== id);
    draft.steps = draft.steps.map((step) =>
      step.type === 'field' && step.field.generator.kind === 'custom' && step.field.generator.generatorId === id
        ? { ...step, field: { ...step.field, generator: { kind: 'fixed', value: '' } } }
        : step,
    );
  }

  function updateField(index: number, field: FieldMapping): void {
    draft.steps[index] = { type: 'field', field };
  }

  function updateDelayStep(index: number, step: DelayStep): void {
    draft.steps[index] = step;
  }

  function updateWaitForStep(index: number, step: WaitForStep): void {
    draft.steps[index] = step;
  }

  function moveStep(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    draft.steps = steps;
  }

  // Creating a generator from inside a field's dropdown assigns it to that
  // field immediately — otherwise a newly created generator has no visible
  // effect until the user manually revisits this field and re-selects it.
  function createAndAssignGenerator(index: number): void {
    const step = draft.steps[index];
    if (step.type !== 'field') return;
    const newGenerator = {
      id: crypto.randomUUID(),
      name: `Generator ${draft.customGenerators.length + 1}`,
      code: 'return "value";',
    };
    draft.customGenerators = [...draft.customGenerators, newGenerator];
    updateField(index, { ...step.field, generator: { kind: 'custom', generatorId: newGenerator.id } });
    requestAnimationFrame(() => focusGenerator(newGenerator.id));
  }

  function focusGenerator(id: string): void {
    const card = document.getElementById(`generator-${id}`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card?.querySelector<HTMLElement>('.cm-content')?.focus();
  }

  function removeStep(index: number): void {
    draft.steps = draft.steps.filter((_, i) => i !== index);
  }

  function duplicateField(index: number): void {
    const step = draft.steps[index];
    if (step.type !== 'field') return;
    const clone: FieldMapping = {
      ...step.field,
      id: crypto.randomUUID(),
      label: step.field.label ? `${step.field.label} (Copy)` : '(Copy)',
    };
    const steps = [...draft.steps];
    steps.splice(index + 1, 0, { type: 'field', field: clone });
    draft.steps = steps;
  }

  function addDelayStep(): void {
    draft.steps = [...draft.steps, { type: 'delay', id: crypto.randomUUID(), delayMs: 500 }];
  }

  function addWaitForStep(): void {
    const newStep: ScriptStep = {
      type: 'waitFor',
      id: crypto.randomUUID(),
      selectors: [{ strategy: 'css', value: '#change-me', enabled: true }],
      condition: 'enabled',
      timeoutMs: 5000,
      pollIntervalMs: 150,
    };
    draft.steps = [...draft.steps, newStep];
  }

  // Lets the user write a field by hand instead of picking it from a live
  // page — the selector value starts as an obvious placeholder (never
  // empty: the schema requires a non-empty string, and an empty one would
  // silently fail validation on the next load, dropping the whole script).
  function addManualField(): void {
    const newField: FieldMapping = {
      id: crypto.randomUUID(),
      label: '',
      elementType: 'text',
      selectors: [{ strategy: 'css', value: '#change-me', enabled: true }],
      generator: { kind: 'fixed', value: '' },
    };
    draft.steps = [...draft.steps, { type: 'field', field: newField }];
    justAddedFieldId = newField.id;
    requestAnimationFrame(() => {
      document.getElementById(`field-${newField.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function updateUrlPatterns(value: string): void {
    draft.urlPatterns = value
      .split('\n')
      .map((pattern) => pattern.trim())
      .filter(Boolean);
  }

  async function resolveFieldValue(
    field: FieldMapping,
    context: FieldValueContext,
    generatorRunContext: GeneratorRunContext,
  ): Promise<string | number | boolean> {
    const ref: GeneratorRef = field.generator;
    if (ref.kind === 'builtin') return runBuiltinGenerator(ref.id, ref.options, generatorRunContext);
    if (ref.kind === 'fixed') return ref.value;
    const generator = draft.customGenerators.find((entry) => entry.id === ref.generatorId);
    if (!generator) throw new Error('No custom generator selected');
    return runCustomCode(generator.code, undefined, context, generatorRunContext);
  }

  /**
   * Runs every field above this one first, so generators can read `fields.xyz`
   * just like a real run — and, via the shared `generatorRunContext`, so
   * correlated builtins (cep/city/state/neighborhood) preview the same
   * underlying address as the fields already previewed above them.
   */
  async function previewGenerator(field: FieldMapping): Promise<string> {
    const index = draft.steps.findIndex((step) => step.type === 'field' && step.field.id === field.id);
    const context: FieldValueContext = {};
    const generatorRunContext: GeneratorRunContext = {};
    for (let i = 0; i < index; i++) {
      const step = draft.steps[i];
      if (step.type !== 'field') continue;
      try {
        context[fieldContextKey(step.field)] = await resolveFieldValue(step.field, context, generatorRunContext);
      } catch {
        // A broken earlier field shouldn't block previewing this one; it's just absent from context.
      }
    }
    const value = await resolveFieldValue(field, context, generatorRunContext);
    return String(value);
  }

  async function save(): Promise<boolean> {
    try {
      const saved = await onSave($state.snapshot(draft));
      lastSyncedUpdatedAt = saved.updatedAt;
      draft.updatedAt = saved.updatedAt;
      saveFlash = true;
      setTimeout(() => (saveFlash = false), 1500);
      return true;
    } catch {
      // onSave already surfaced a toast explaining what's wrong.
      return false;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
    }
  }

  /**
   * Closes the tab this editor is running in and, if we know which tab was
   * active when it was opened (set by whatever popup/background flow got us
   * here — see `lib/storage/return-tab-store.ts`), switches back to it first.
   * Falls back to a plain close if that tab is gone or was never recorded
   * (e.g. the user opened the options URL by hand).
   */
  async function closeEditor(): Promise<void> {
    const returnTabId = await getReturnTabId();
    if (returnTabId != null) {
      try {
        await browser.tabs.update(returnTabId, { active: true });
        const returnTab = await browser.tabs.get(returnTabId);
        if (returnTab.windowId != null) await browser.windows.update(returnTab.windowId, { focused: true });
      } catch {
        // The original tab was closed in the meantime — nothing to switch back to.
      }
    }
    const currentTab = await browser.tabs.getCurrent();
    if (currentTab?.id != null) await browser.tabs.remove(currentTab.id);
  }

  async function saveAndClose(): Promise<void> {
    if (await save()) await closeEditor();
  }

  function confirmDeleteScript(): void {
    confirmDeleteScriptOpen = false;
    onDelete(draft.id);
  }

  function confirmDeleteGenerator(): void {
    if (confirmDeleteGeneratorId) removeCustomGenerator(confirmDeleteGeneratorId);
    confirmDeleteGeneratorId = null;
  }

  async function addFieldsFromPage(): Promise<void> {
    // `draft` is a live $state proxy; the messaging API structured-clones its
    // payload and throws on a raw proxy, so snapshot before sending.
    const snapshot = $state.snapshot(draft);
    await onSave(snapshot);
    pushToast('Switching to the target page — click elements to add, then Finish', 'info', 4000);
    await browser.runtime.sendMessage({
      type: 'picker/start-for-script',
      scriptId: snapshot.id,
      urlPatterns: snapshot.urlPatterns,
    } satisfies RuntimeMessage);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="@container flex h-full flex-col">
  <div class="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-3 py-3 sm:px-6 sm:py-4">
    <div class="group relative flex min-w-0 max-w-sm flex-1 items-center">
      <input
        class="min-w-0 flex-1 rounded-t-[5px] border-b border-dashed border-white/15 bg-transparent px-1.5 py-1 text-lg font-semibold text-ink-1 outline-none transition placeholder:text-ink-3 hover:border-white/30 hover:bg-surface-hover focus:border-solid focus:border-accent-500 focus:bg-surface-hover"
        bind:value={draft.name}
        placeholder="Script name"
      />
      <PencilSimpleIcon
        size={13}
        class="pointer-events-none ml-1.5 shrink-0 text-ink-3 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
      />
    </div>
    <div class="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-1 transition active:scale-[0.97] hover:bg-surface-hover"
        onclick={() => (showJsonView = !showJsonView)}
      >
        <BracketsCurlyIcon size={14} weight="bold" />
        {showJsonView ? 'Hide code' : 'View code'}
      </button>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-1 transition active:scale-[0.97] hover:bg-surface-hover"
        onclick={() => onDuplicate($state.snapshot(draft))}
      >
        <CopySimpleIcon size={14} weight="bold" />
        Duplicate
      </button>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-1 transition active:scale-[0.97] hover:bg-surface-hover"
        onclick={() => onExport($state.snapshot(draft))}
      >
        <DownloadSimpleIcon size={14} weight="bold" />
        Export
      </button>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 transition active:scale-[0.97] hover:bg-red-500/10"
        onclick={() => (confirmDeleteScriptOpen = true)}
      >
        <TrashIcon size={14} weight="bold" />
        Delete
      </button>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition active:scale-[0.97] {saveFlash
          ? 'bg-emerald-700 text-white'
          : 'bg-accent-500 text-accent-ink hover:bg-accent-600'}"
        onclick={save}
      >
        {#if saveFlash}
          <CheckIcon size={14} weight="bold" />
          Saved
        {:else}
          Save
        {/if}
      </button>
      <div class="mx-0.5 w-px self-stretch bg-hair"></div>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-1 transition active:scale-[0.97] hover:bg-surface-hover"
        title="Close without saving"
        onclick={closeEditor}
      >
        <XIcon size={14} weight="bold" />
        Close
      </button>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-sm font-semibold text-accent-ink transition active:scale-[0.97] hover:bg-accent-600"
        onclick={saveAndClose}
      >
        <SignOutIcon size={14} weight="bold" />
        Save & close
      </button>
    </div>
  </div>

  <div class="grid min-h-0 flex-1 grid-cols-1 {showJsonView ? '@3xl:grid-cols-2' : ''}">
    <div class="min-h-0 space-y-6 overflow-y-auto px-3 py-4 sm:px-6">
      <section>
        <div class="mb-2 flex flex-wrap items-center justify-between gap-y-1.5">
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-ink-3" for="url-patterns">
            URL patterns (one per line)
          </label>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md border border-dashed border-accent-500/45 px-2 py-1 text-xs font-medium text-accent-500 transition hover:bg-accent-500/10"
            onclick={addFieldsFromPage}
          >
            <CursorClickIcon size={12} weight="bold" />
            Add fields from page
          </button>
        </div>
        <textarea
          id="url-patterns"
          class="w-full rounded-lg border border-hair bg-surface px-3 py-2 font-mono text-sm text-ink-1 outline-none focus:border-accent-500"
          rows="2"
          value={draft.urlPatterns.join('\n')}
          oninput={(event) => updateUrlPatterns((event.currentTarget as HTMLTextAreaElement).value)}
        ></textarea>
      </section>

      <section>
        <div class="mb-2 flex flex-wrap items-center justify-between gap-y-1.5">
          <h2 class="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            Fields ({draft.steps.filter((step) => step.type === 'field').length})
          </h2>
          <div class="flex flex-wrap items-center gap-y-1 gap-x-3">
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs font-medium text-ink-2 transition hover:text-accent-500"
              onclick={addManualField}
            >
              <PlusIcon size={13} weight="bold" />
              Add field
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs font-medium text-ink-2 transition hover:text-accent-500"
              onclick={addDelayStep}
            >
              <TimerIcon size={13} weight="bold" />
              Add wait
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs font-medium text-ink-2 transition hover:text-accent-500"
              onclick={addWaitForStep}
            >
              <HourglassIcon size={13} weight="bold" />
              Add conditional wait
            </button>
          </div>
        </div>
        {#if draft.steps.length === 0}
          <p class="text-sm text-ink-3">
            No fields mapped yet. Use "Add fields from page" above, "Add field" to write one by hand, or "Map fields
            on this page" from the popup.
          </p>
        {:else}
          <div class="space-y-2">
            {#each draft.steps as step, index (step.type === 'field' ? step.field.id : step.id)}
              {#if step.type === 'field'}
                <FieldRow
                  field={step.field}
                  customGenerators={draft.customGenerators}
                  canMoveUp={index > 0}
                  canMoveDown={index < draft.steps.length - 1}
                  startExpanded={step.field.id === justAddedFieldId}
                  onChange={(updated) => updateField(index, updated)}
                  onRemove={() => removeStep(index)}
                  onDuplicate={() => duplicateField(index)}
                  onMoveUp={() => moveStep(index, -1)}
                  onMoveDown={() => moveStep(index, 1)}
                  onPreview={() => previewGenerator(step.field)}
                  onCreateGenerator={() => createAndAssignGenerator(index)}
                  onFocusGenerator={focusGenerator}
                />
              {:else if step.type === 'delay'}
                <DelayStepRow
                  {step}
                  canMoveUp={index > 0}
                  canMoveDown={index < draft.steps.length - 1}
                  onChange={(updated) => updateDelayStep(index, updated)}
                  onRemove={() => removeStep(index)}
                  onMoveUp={() => moveStep(index, -1)}
                  onMoveDown={() => moveStep(index, 1)}
                />
              {:else}
                <WaitForStepRow
                  {step}
                  canMoveUp={index > 0}
                  canMoveDown={index < draft.steps.length - 1}
                  onChange={(updated) => updateWaitForStep(index, updated)}
                  onRemove={() => removeStep(index)}
                  onMoveUp={() => moveStep(index, -1)}
                  onMoveDown={() => moveStep(index, 1)}
                />
              {/if}
            {/each}
          </div>
        {/if}
      </section>

      <section>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Custom generators</h2>
          <button type="button" class="text-xs font-medium text-accent-500 hover:underline" onclick={addCustomGenerator}>
            New generator
          </button>
        </div>
        {#if draft.customGenerators.length === 0}
          <p class="text-sm text-ink-3">
            Write the <strong class="text-ink-2">body</strong> of a sandboxed JS function — <code
              class="font-mono text-ink-2">helpers</code
            >, <code class="font-mono text-ink-2">options</code>, and <code class="font-mono text-ink-2">fields</code> are
            already in scope, you just <code class="font-mono text-ink-2">return</code> a value. <code
              class="font-mono text-ink-2">helpers</code
            >
            gives you every built-in generator (e.g. <code class="font-mono text-ink-2">helpers.cpf()</code>), <code
              class="font-mono text-ink-2">fields</code
            >
            holds every field filled earlier in this script (e.g. <code class="font-mono text-ink-2"
              >fields.firstName</code
            >). <code class="font-mono text-ink-2">options</code> is always an empty object today — there's no way yet to
            configure a custom generator's own options.
          </p>
        {:else}
          <div class="space-y-3">
            {#each draft.customGenerators as generator (generator.id)}
              <div id={`generator-${generator.id}`} class="rounded-xl bg-surface p-3">
                <div class="mb-2 flex items-center justify-between gap-2">
                  <div class="group relative flex min-w-0 flex-1 items-center">
                    <input
                      class="min-w-0 flex-1 rounded-t-[5px] border-b border-dashed border-white/15 bg-transparent px-1 py-0.5 text-sm font-medium text-ink-1 outline-none transition hover:border-white/30 hover:bg-surface-hover focus:border-solid focus:border-accent-500 focus:bg-surface-hover"
                      bind:value={generator.name}
                    />
                    <PencilSimpleIcon
                      size={12}
                      class="pointer-events-none ml-1.5 shrink-0 text-ink-3 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
                    />
                  </div>
                  <button
                    type="button"
                    class="flex items-center gap-1 rounded-md p-1.5 text-xs text-ink-3 transition hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Remove generator"
                    onclick={() => (confirmDeleteGeneratorId = generator.id)}
                  >
                    <TrashIcon size={13} weight="bold" />
                  </button>
                </div>
                <p class="mb-1.5 text-[11px] text-ink-3">
                  Function body — <code class="font-mono text-ink-2">helpers</code>, <code class="font-mono text-ink-2"
                    >options</code
                  >, <code class="font-mono text-ink-2">fields</code> are in scope, <code class="font-mono text-ink-2"
                    >return</code
                  > a string/number/boolean. E.g. <code class="font-mono text-ink-2">return helpers.cpf();</code> or
                  <code class="font-mono text-ink-2">return fields.firstName + "@example.com";</code>
                </p>
                <CodeEditor
                  value={generator.code}
                  language="javascript"
                  onChange={(value) => (generator.code = value)}
                  minHeight="5rem"
                />
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    {#if showJsonView}
      <div class="flex max-h-[50vh] min-h-0 flex-col border-t border-hair @3xl:max-h-none @3xl:border-l @3xl:border-t-0">
        {#if jsonError}
          <p class="border-b border-hair bg-red-500/10 px-4 py-2 text-xs text-red-400">{jsonError}</p>
        {:else}
          <p class="border-b border-hair px-4 py-2 text-xs text-ink-3">
            Full script as code. Edit or paste here to update the form live.
          </p>
        {/if}
        <div class="min-h-0 flex-1 overflow-auto p-3">
          <CodeEditor value={jsonText} language="json" onChange={handleJsonChange} minHeight="100%" maxHeight="none" />
        </div>
      </div>
    {/if}
  </div>
</div>

<ConfirmDialog
  open={confirmDeleteScriptOpen}
  title="Delete this script?"
  message={`"${draft.name}" and all its fields and generators will be permanently deleted.`}
  onConfirm={confirmDeleteScript}
  onCancel={() => (confirmDeleteScriptOpen = false)}
/>

<ConfirmDialog
  open={confirmDeleteGeneratorId !== null}
  title="Delete this generator?"
  message={`Fields using "${confirmDeleteGeneratorName}" will fall back to an empty fixed value.`}
  onConfirm={confirmDeleteGenerator}
  onCancel={() => (confirmDeleteGeneratorId = null)}
/>
