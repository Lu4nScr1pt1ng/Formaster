<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { browser } from 'wxt/browser';
  import BracketsCurlyIcon from 'phosphor-svelte/lib/BracketsCurlyIcon';
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import FolderOpenIcon from 'phosphor-svelte/lib/FolderOpenIcon';
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
  import CustomGeneratorCard from './CustomGeneratorCard.svelte';
  import DelayStepRow from './DelayStepRow.svelte';
  import FieldRow from './FieldRow.svelte';
  import FileTemplateEditor from './FileTemplateEditor.svelte';
  import SearchableSelect, { type SearchableSelectOption } from './SearchableSelect.svelte';
  import WaitForStepRow from './WaitForStepRow.svelte';
  import { createConfirmGate } from '../lib/confirm-gate.svelte';
  import { createFlashTimer } from '../lib/flash-timer';
  import { focusWindowIfSupported } from '../lib/focus-window';
  import { fieldContextKey, type FieldValueContext, type FlowVariables } from '../lib/filler/fill-script';
  import { collectSavedFlowVariableKeys } from '../lib/flow-variable-keys';
  import { interpolateFlowVariables } from '../lib/flow-variables';
  import { BUILTIN_GENERATOR_LABELS, runBuiltinGenerator, type GeneratorRunContext } from '../lib/generators';
  import { renderFile } from '../lib/generators/file-generators';
  import { runCustomCode } from '../lib/generators/quickjs-runner';
  import type { RuntimeMessage } from '../lib/messaging/types';
  import { createEmptyFileTemplate, type FileTemplate } from '../lib/schema/file-template';
  import { createEmptyFlow, type Flow } from '../lib/schema/flow';
  import {
    formScriptSchema,
    formatValidationError,
    generatorOptionFieldSchema,
    type BuiltinGeneratorId,
    type CustomGenerator,
    type DelayStep,
    type FieldMapping,
    type FormScript,
    type GeneratorRef,
    type ScriptStep,
    type WaitForStep,
  } from '../lib/schema/script';
  import { deepEqualIgnoring } from '../lib/stable-stringify';
  import type { UnsavedGuard } from '../lib/unsaved-guard.svelte';
  import { deleteFileTemplate, listFileTemplates, saveFileTemplate } from '../lib/storage/file-templates-store';
  import { resetFlowIdentity } from '../lib/storage/flow-identity-store';
  import { getFlowVariables, listFlowValues, resetFlowValues } from '../lib/storage/flow-values-store';
  import { getFlow, listFlows, saveFlow } from '../lib/storage/flows-store';
  import { getReturnTabId } from '../lib/storage/return-tab-store';
  import { listScripts } from '../lib/storage/scripts-store';
  import { pushToast } from '../lib/toast/toast-store.svelte';

  interface Props {
    script: FormScript;
    onSave: (script: FormScript) => Promise<FormScript>;
    onDelete: (id: string) => void;
    onExport: (script: FormScript) => void;
    onDuplicate: (script: FormScript) => void;
    /** Off in the Playground: there's no real tab to reopen the picker on, so the button can't do anything there. */
    showAddFieldsFromPage?: boolean;
    /**
     * Reports unsaved edits that the surrounding UI shows too — the script's
     * name, and which Flow it sits in — so a sidebar can follow along as the
     * user types instead of only catching up on Save.
     */
    onDraftChange?: (draft: { id: string; name: string; flowId: string; flowName: string }) => void;
    /**
     * When present, this editor registers itself as the holder of unsaved
     * work, so whatever wants to navigate away can ask first. Registration
     * rather than a `bind:this` handle because the editor is remounted by a
     * `{#key}` on every selection change.
     */
    unsavedGuard?: UnsavedGuard;
  }

  let { script, onSave, onDelete, onExport, onDuplicate, showAddFieldsFromPage = true, onDraftChange, unsavedGuard }: Props = $props();

  // Local editable copy so navigating away without saving doesn't mutate storage.
  // `script` is itself a reactive $state proxy; $state.snapshot() resolves it to an
  // independent plain deep clone (structuredClone would throw on the proxy directly).
  // Deliberately a one-time capture, not a $derived — this needs to be independently
  // mutable, and the $effect below handles resyncing it when `script` genuinely changes.
  // svelte-ignore state_referenced_locally
  let draft = $state<FormScript>($state.snapshot(script));

  /**
   * The last state we and storage agreed on. Everything about "are there
   * unsaved changes" and "did something else touch this script" is a
   * comparison against this, which a bare `updatedAt` marker couldn't do:
   * it distinguished "we saved it" from "someone else saved it", but never
   * told us whether the *draft* had diverged.
   */
  // svelte-ignore state_referenced_locally
  let baseline = $state<FormScript>($state.snapshot(script));

  /**
   * Deliberately computed on demand rather than tracked by an effect: it's
   * only ever asked when the user tries to navigate away (or the tab is
   * closing), so a handful of deep compares per session costs nothing — and
   * an effect watching the draft would re-run on every keystroke, which is
   * both wasteful and, as this went through, a loop waiting to happen.
   */
  export function isDirty(): boolean {
    const draftChanged = !deepEqualIgnoring($state.snapshot(draft), baseline, ['updatedAt']);
    // A Flow that isn't in storage yet has no baseline to diverge from — it
    // gets created as a side effect of saving the script.
    const flowChanged = flow !== null && storedFlow !== null && !deepEqualIgnoring($state.snapshot(flow), storedFlow, ['updatedAt']);
    return draftChanged || flowChanged;
  }

  $effect(() => unsavedGuard?.register({ isDirty, save, label: () => draft.name }));

  function adoptAsSaved(next: FormScript): void {
    baseline = $state.snapshot(next);
  }

  // Something else wrote to this script (the background appending fields
  // from "Add fields from page", another tab saving it). Adopt it only when
  // the local draft has nothing to lose — otherwise the user's in-progress
  // edits would vanish under them.
  //
  // Only `script` is a dependency: everything this reads and writes
  // afterwards is untracked, or adopting (which assigns `draft`) would make
  // the effect its own trigger.
  $effect(() => {
    const incoming = $state.snapshot(script);
    untrack(() => {
      if (deepEqualIgnoring(incoming, baseline, ['updatedAt'])) return;
      if (isDirty()) {
        pushToast('This script changed elsewhere — your unsaved edits were kept.', 'info', 6000);
        return;
      }
      draft = incoming;
      baseline = incoming;
    });
  });

  let saveFlash = $state(false);
  const saveFlashTimer = createFlashTimer(() => (saveFlash = false));
  let justAddedFieldId = $state<string | null>(null);
  const deleteScriptGate = createConfirmGate();

  const NEW_FLOW_VALUE = '__new_flow__';

  // `flow` starts null only for the brief window before `loadFlowContext()`
  // resolves (this component remounts fresh per script — see the `{#key}` in
  // options/App.svelte and playground/App.svelte — so there's no stale state
  // to worry about). `null` here means "not loaded yet", not "no Flow".
  let flow = $state<Flow | null>(null);
  /** The Flow as storage has it, so edits to the name/description count as unsaved changes too. */
  let storedFlow = $state<Flow | null>(null);
  let allFlows = $state<Flow[]>([]);
  let allScripts = $state<FormScript[]>([]);
  let fileTemplates = $state<FileTemplate[]>([]);
  let flowValues = $state<Record<string, { value: string; updatedAt: string }>>({});
  let flowVariablesPanelOpen = $state(false);
  // The description is rarely used, so it stays out of the way until asked for.
  let descriptionOpen = $state(false);
  const resetFlowGate = createConfirmGate();

  // Which field to assign a newly-created template back to (set only when
  // the "+ New template" sentinel was picked from inside a specific field's
  // picker) — null when opened to edit an already-assigned template instead.
  let editingFileTemplate = $state<FileTemplate | null>(null);
  let assignTemplateToFieldIndex = $state<number | null>(null);

  const siblingScripts = $derived(allScripts.filter((script) => script.flowId === draft.flowId && script.id !== draft.id));
  const flowOptions = $derived.by<SearchableSelectOption[]>(() => {
    // Narrowed into a local first — same reason as `selectedCustomGeneratorFields`
    // above: TS can't carry `flow`'s null-narrowing through the `.some()` closure.
    const currentFlow = flow;
    const flows = currentFlow && !allFlows.some((entry) => entry.id === currentFlow.id) ? [currentFlow, ...allFlows] : allFlows;
    return [...flows.map((entry) => ({ value: entry.id, label: entry.name })), { value: NEW_FLOW_VALUE, label: '+ New flow…' }];
  });
  // Every script but this one contributes its *stored* fields; this one
  // contributes its live `draft` instead, so a key just marked in an
  // unsaved edit shows up immediately as a suggestion/orphan-resolution.
  const scriptsForKeyScan = $derived([...allScripts.filter((script) => script.id !== draft.id), draft]);
  // Declared keys plus any a run actually published: a value can exist in
  // the Flow without any field currently declaring it (the field was edited
  // or deleted after the run), and it's still readable, so it's still worth
  // suggesting.
  const flowVariableKeys = $derived(
    [...new Set([...collectSavedFlowVariableKeys(scriptsForKeyScan, draft.flowId), ...Object.keys(flowValues)])].sort(),
  );
  const allPublishedFlowVariableKeys = $derived(collectSavedFlowVariableKeys(scriptsForKeyScan));
  // Not gated on having sibling scripts: a single script can publish a
  // variable in one field and read it back (via `{{key}}` or `flowVars.key`)
  // in a later one, so hiding the panel there would hide real state.
  const showFlowVariablesPanel = $derived(
    siblingScripts.length > 0 || flowVariableKeys.length > 0 || Object.keys(flowValues).length > 0,
  );

  /**
   * One row per key this Flow either *declares* (some field saves it) or has
   * actually *published* (a run wrote a value). Showing declared-but-empty
   * keys is the point: it's how "this variable exists but nothing has filled
   * it yet" becomes visible before a run rather than as an error during one.
   */
  /**
   * What a custom generator gets in scope, as completions for its code
   * editor. `options` isn't here — it's per-generator, so the card that
   * renders one adds its own from its `optionsSchema`.
   */
  const generatorCompletions = $derived({
    helpers: (Object.entries(BUILTIN_GENERATOR_LABELS) as [BuiltinGeneratorId, string][]).map(([id, label]) => ({
      label: `${id}()`,
      detail: label,
    })),
    fields: draft.steps
      .filter((step) => step.type === 'field')
      .map((step) => ({
        label: fieldContextKey((step as { field: FieldMapping }).field),
        detail: (step as { field: FieldMapping }).field.label || (step as { field: FieldMapping }).field.elementType,
      })),
    flowVars: flowVariableKeys.map((key) => ({ label: key, detail: flowValues[key]?.value || 'not filled yet' })),
  });

  const flowVariableRows = $derived(
    [...new Set([...flowVariableKeys, ...Object.keys(flowValues)])].sort().map((key) => ({
      key,
      entry: flowValues[key],
    })),
  );

  onMount(() => {
    function handleMessage(message: RuntimeMessage): void {
      if (message.type === 'scripts/refresh') void refreshScripts();
      else if (message.type === 'flows/refresh') void refreshFlows();
      else if (message.type === 'fileTemplates/refresh') void refreshFileTemplates();
      // A fill run just finished somewhere (any tab, popup Run, context
      // menu) — whatever it published lands in storage before this fires,
      // so re-reading here is what makes the panel reflect a run the user
      // just did on another tab without reopening the editor.
      else if (message.type === 'fill/result') void refreshFlowValues();
    }
    browser.runtime.onMessage.addListener(handleMessage);
    void loadFlowContext();
    return () => browser.runtime.onMessage.removeListener(handleMessage);
  });

  async function loadFlowContext(): Promise<void> {
    const [loadedFlow, flows, templates, scripts, values] = await Promise.all([
      getFlow(draft.flowId),
      listFlows(),
      listFileTemplates(),
      listScripts(),
      listFlowValues(draft.flowId),
    ]);
    // No Flow in storage yet: either a brand-new script's draft flowId
    // (options/App.svelte's createScript()) or a legacy script mid-migration
    // — either way, an implicit single-script Flow named after the script,
    // persisted for real the first time this script is actually saved.
    flow = loadedFlow ?? { ...createEmptyFlow(draft.name), id: draft.flowId };
    // Only a Flow that actually exists in storage is a baseline to diff
    // against; a synthesized one has nothing to have diverged from.
    storedFlow = loadedFlow ?? null;
    allFlows = flows;
    fileTemplates = templates;
    allScripts = scripts;
    flowValues = values;
  }

  async function refreshScripts(): Promise<void> {
    allScripts = await listScripts();
  }

  async function refreshFlows(): Promise<void> {
    allFlows = await listFlows();
  }

  async function refreshFileTemplates(): Promise<void> {
    fileTemplates = await listFileTemplates();
  }

  async function refreshFlowValues(): Promise<void> {
    flowValues = await listFlowValues(draft.flowId);
  }

  // Mirrors the three draft fields the sidebar renders. Reads them
  // explicitly (rather than passing `draft` wholesale) so this only fires
  // on the edits that actually change what's shown out there, not on every
  // keystroke inside a field or generator.
  $effect(() => {
    onDraftChange?.({
      id: draft.id,
      name: draft.name,
      flowId: draft.flowId,
      flowName: flow?.name ?? draft.name,
    });
  });

  function setFlowId(value: string): void {
    if (value === NEW_FLOW_VALUE) {
      const newFlow = createEmptyFlow(draft.name);
      flow = newFlow;
      allFlows = [...allFlows, newFlow];
      draft.flowId = newFlow.id;
      // A brand-new Flow has published nothing yet — clear rather than
      // leave the previous Flow's values on screen under a new name.
      flowValues = {};
      return;
    }
    const selected = allFlows.find((entry) => entry.id === value);
    if (!selected) return;
    flow = selected;
    draft.flowId = selected.id;
    void refreshFlowValues();
  }

  function updateFlowName(name: string): void {
    if (flow) flow = { ...flow, name };
  }

  function updateFlowDescription(description: string): void {
    if (flow) flow = { ...flow, description };
  }

  async function resetFlow(): Promise<void> {
    await resetFlowValues(draft.flowId);
    await resetFlowIdentity(draft.flowId);
    flowValues = {};
    pushToast('Flow reset — shared variables and identity cleared', 'info');
  }

  function formatRelativeTime(iso: string): string {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  async function openSiblingScript(id: string): Promise<void> {
    await browser.tabs.create({ url: browser.runtime.getURL(`/options.html?script=${id}`) });
  }

  function openCreateFileTemplate(fieldIndex: number): void {
    editingFileTemplate = createEmptyFileTemplate(`Template ${fileTemplates.length + 1}`, 'png');
    assignTemplateToFieldIndex = fieldIndex;
  }

  function openEditFileTemplate(templateId: string): void {
    const found = fileTemplates.find((entry) => entry.id === templateId);
    if (!found) return;
    editingFileTemplate = found;
    assignTemplateToFieldIndex = null;
  }

  function closeFileTemplateEditor(): void {
    editingFileTemplate = null;
    assignTemplateToFieldIndex = null;
  }

  async function saveFileTemplateFromEditor(template: FileTemplate): Promise<void> {
    const saved = await saveFileTemplate(template);
    fileTemplates = [...fileTemplates.filter((entry) => entry.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name));
    if (assignTemplateToFieldIndex !== null) {
      const step = draft.steps[assignTemplateToFieldIndex];
      if (step.type === 'field') updateField(assignTemplateToFieldIndex, { ...step.field, generator: { kind: 'file', templateId: saved.id } });
    }
    pushToast(`"${saved.name}" template saved`, 'success');
    closeFileTemplateEditor();
  }

  async function deleteFileTemplateFromEditor(id: string): Promise<void> {
    await deleteFileTemplate(id);
    fileTemplates = fileTemplates.filter((entry) => entry.id !== id);
    closeFileTemplateEditor();
  }

  let showJsonView = $state(false);
  let jsonText = $state('');
  let jsonError = $state<string | null>(null);
  let isJsonEdit = $state(false);

  // Options-schema editors are opt-in (collapsed) unless the generator
  // already has one — most custom generators never need this.
  // svelte-ignore state_referenced_locally
  let expandedGeneratorOptions = $state(new Set(draft.customGenerators.filter((g) => g.optionsSchema.length > 0).map((g) => g.id)));
  let generatorOptionsError = $state<Record<string, string | null>>({});

  function toggleGeneratorOptions(id: string): void {
    const next = new Set(expandedGeneratorOptions);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedGeneratorOptions = next;
  }

  function setGeneratorOptionsSchemaText(generator: CustomGenerator, text: string): void {
    try {
      const parsed = generatorOptionFieldSchema.array().parse(JSON.parse(text || '[]'));
      generator.optionsSchema = parsed;
      generatorOptionsError = { ...generatorOptionsError, [generator.id]: null };
    } catch (error) {
      generatorOptionsError = { ...generatorOptionsError, [generator.id]: formatValidationError(error) };
    }
  }

  // Serializing the whole draft is only worth doing while the JSON panel is
  // actually visible — otherwise every keystroke in any field/generator
  // editor would re-stringify the entire script for a panel nobody can see.
  // Debounced: with large custom generator bodies, re-serializing on every
  // single keystroke elsewhere in the editor is noticeably janky.
  $effect(() => {
    if (!showJsonView || isJsonEdit) return;
    const snapshot = $state.snapshot(draft);
    const timer = setTimeout(() => {
      jsonText = JSON.stringify(snapshot, null, 2);
    }, 200);
    return () => clearTimeout(timer);
  });

  const fieldCount = $derived(draft.steps.filter((step) => step.type === 'field').length);

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

  // `isJsonEdit` suppresses the resync effect above while the user is
  // actively typing in the JSON panel (so a debounced re-stringify doesn't
  // clobber an in-progress, momentarily-invalid edit). It must be cleared
  // when the panel closes, or the very next visual-editor change (add field,
  // rename generator, etc.) never resyncs into `jsonText` — reopening the
  // panel would keep showing whatever was last typed by hand.
  function toggleJsonView(): void {
    showJsonView = !showJsonView;
    if (!showJsonView) isJsonEdit = false;
  }

  function makeGenerator(name: string): CustomGenerator {
    return { id: crypto.randomUUID(), name, code: 'return "value";', optionsSchema: [] };
  }

  function addCustomGenerator(): void {
    draft.customGenerators = [...draft.customGenerators, makeGenerator(`Generator ${draft.customGenerators.length + 1}`)];
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
    const newGenerator = makeGenerator(`Generator ${draft.customGenerators.length + 1}`);
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
      selectors: [{ id: crypto.randomUUID(), strategy: 'css', value: '#change-me', enabled: true }],
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
      selectors: [{ id: crypto.randomUUID(), strategy: 'css', value: '#change-me', enabled: true }],
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
    flowVars: FlowVariables,
  ): Promise<string | number | boolean> {
    const ref: GeneratorRef = field.generator;
    if (ref.kind === 'builtin') return runBuiltinGenerator(ref.id, ref.options, generatorRunContext);
    if (ref.kind === 'fixed') return typeof ref.value === 'string' ? interpolateFlowVariables(ref.value, flowVars) : ref.value;
    if (ref.kind === 'file') {
      const file = await renderFile(ref.templateId, draft.flowId);
      return `File: ${file.name}`;
    }
    const generator = draft.customGenerators.find((entry) => entry.id === ref.generatorId);
    if (!generator) throw new Error('No custom generator selected');
    return runCustomCode(generator.code, ref.options, context, generatorRunContext, flowVars);
  }

  /**
   * Runs every field above this one first, so generators can read `fields.xyz`
   * just like a real run — and, via the shared `generatorRunContext`, so
   * correlated builtins (cep/city/state/neighborhood) preview the same
   * underlying address as the fields already previewed above them.
   *
   * `flowVars` starts from what the Flow has actually published (so a
   * preview can read a value an earlier *page* produced) and, like a real
   * run, picks up anything a field above this one publishes along the way —
   * without writing any of it back to storage, since a preview must never
   * change what the next real run sees.
   */
  async function previewGenerator(field: FieldMapping): Promise<string> {
    const index = draft.steps.findIndex((step) => step.type === 'field' && step.field.id === field.id);
    const context: FieldValueContext = {};
    const generatorRunContext: GeneratorRunContext = {};
    const flowVars: FlowVariables = await getFlowVariables(draft.flowId);
    for (let i = 0; i < index; i++) {
      const step = draft.steps[i];
      if (step.type !== 'field') continue;
      try {
        const value = await resolveFieldValue(step.field, context, generatorRunContext, flowVars);
        context[fieldContextKey(step.field)] = value;
        const savedKey = step.field.options?.saveAsFlowVariable?.key;
        if (savedKey) flowVars[savedKey] = String(value);
      } catch {
        // A broken earlier field shouldn't block previewing this one; it's just absent from context.
      }
    }
    const value = await resolveFieldValue(field, context, generatorRunContext, flowVars);
    return String(value);
  }

  /**
   * Clicking "Save as flow variable" starts the key empty, but the schema
   * requires a non-empty one — so an un-named publish used to make the whole
   * script unsavable with a `saveAsFlowVariable.key: Too small` error. An
   * empty key means "not published yet", so drop it on the way out; the
   * field row shows it as invalid until it's named.
   */
  function withoutEmptyPublishKeys(next: FormScript): FormScript {
    return {
      ...next,
      steps: next.steps.map((step) => {
        if (step.type !== 'field' || step.field.options?.saveAsFlowVariable?.key !== '') return step;
        const { saveAsFlowVariable: _drop, ...options } = step.field.options;
        return { ...step, field: { ...step.field, options: Object.keys(options).length > 0 ? options : undefined } };
      }),
    };
  }

  async function save(): Promise<boolean> {
    // Baselined *before* persisting, not after: `onSave` reassigns the
    // parent's script list, so the `script` prop changes — and the
    // external-change effect above would fire mid-save, see the old
    // baseline, and warn about edits that are in fact being saved right now.
    const previousBaseline = baseline;
    const outgoing = withoutEmptyPublishKeys($state.snapshot(draft));
    adoptAsSaved(outgoing);
    try {
      // The Flow this script belongs to may not be persisted yet (a brand
      // new script, or one that just switched to "+ New flow…") — always
      // upsert it first so `draft.flowId` never points at nothing in storage.
      if (flow) {
        const savedFlow = await saveFlow(flow);
        flow = savedFlow;
        storedFlow = savedFlow;
        if (!allFlows.some((entry) => entry.id === savedFlow.id)) allFlows = [...allFlows, savedFlow];
      }
      const saved = await onSave(outgoing);
      draft.updatedAt = saved.updatedAt;
      saveFlash = true;
      saveFlashTimer.trigger(1500);
      return true;
    } catch {
      // onSave already surfaced a toast explaining what's wrong. The edits
      // are still unsaved, so put the baseline back or the guard would let
      // the user walk away from them.
      baseline = previousBaseline;
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
   * `closeEditor()` ends in `browser.tabs.remove()`, and a programmatic tab
   * removal never triggers `beforeunload` — so the Close button needs its own
   * check. The `beforeunload` handler below covers the other way out (the
   * user closing the tab themselves).
   */
  function requestClose(): void {
    if (unsavedGuard) unsavedGuard.run(() => void closeEditor());
    else void closeEditor();
  }

  function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!isDirty()) return;
    event.preventDefault();
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
        await focusWindowIfSupported(returnTab.windowId);
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

  async function addFieldsFromPage(): Promise<void> {
    // `draft` is a live $state proxy; the messaging API structured-clones its
    // payload and throws on a raw proxy, so snapshot before sending.
    const snapshot = $state.snapshot(draft);
    // Baselined first, same reason as `save()` — and so the fields the
    // picker appends afterwards arrive as a clean external change that gets
    // adopted rather than warned about.
    adoptAsSaved(snapshot);
    const saved = await onSave(snapshot);
    draft.updatedAt = saved.updatedAt;
    pushToast('Switching to the target page — click elements to add, then Finish', 'info', 4000);
    await browser.runtime.sendMessage({
      type: 'picker/start-for-script',
      scriptId: snapshot.id,
      urlPatterns: snapshot.urlPatterns,
    } satisfies RuntimeMessage);
  }
</script>

<svelte:window onkeydown={handleKeydown} onbeforeunload={handleBeforeUnload} />

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
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-1 transition active:scale-[0.97] hover:bg-surface-hover"
        onclick={toggleJsonView}
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
        onclick={() => deleteScriptGate.request(true)}
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
      <button
        type="button"
        class="ml-2 flex items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-1 transition active:scale-[0.97] hover:bg-surface-hover"
        title="Close without saving"
        onclick={requestClose}
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
        <!-- Row 1: the Flow's identity and its two actions. The name used to
             appear twice — once as the picker's own label, once in the input
             beside it — so the picker is reduced to a caret-only "switch"
             control and the name lives in exactly one place. -->
        <div class="flex flex-wrap items-center gap-2">
          <label class="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink-3" for="flow-name">Flow</label>
          <FolderOpenIcon size={13} weight="fill" class="shrink-0 text-ink-3" />
          <input
            id="flow-name"
            class="min-w-0 flex-1 rounded-t-[5px] border-b border-dashed border-white/15 bg-transparent px-1 py-0.5 text-sm font-medium text-ink-1 outline-none transition placeholder:text-ink-3 hover:border-white/30 hover:bg-surface-hover focus:border-solid focus:border-accent-500"
            placeholder="Flow name"
            value={flow?.name ?? ''}
            oninput={(event) => updateFlowName((event.currentTarget as HTMLInputElement).value)}
          />
          <SearchableSelect
            ariaLabel="Flow"
            value={draft.flowId}
            options={flowOptions}
            onChange={setFlowId}
            compact
            placeholder="Switch"
            triggerClass="!text-[10px]"
          />
          <button
            type="button"
            class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ink-3 transition hover:bg-red-500/10 hover:text-red-400"
            title="Clear this flow's shared variables and generated identity"
            onclick={() => resetFlowGate.request(true)}
          >
            Reset
          </button>
          {#if !descriptionOpen && !flow?.description}
            <button
              type="button"
              class="shrink-0 text-[11px] font-medium text-ink-3 transition hover:text-accent-500"
              onclick={() => (descriptionOpen = true)}
            >
              + description
            </button>
          {/if}
        </div>

        {#if descriptionOpen || flow?.description}
          <input
            class="mt-1.5 w-full rounded-md border border-hair bg-canvas px-2 py-1 text-xs text-ink-2 outline-none focus:border-accent-500"
            placeholder="Flow description (optional)"
            value={flow?.description ?? ''}
            oninput={(event) => updateFlowDescription((event.currentTarget as HTMLInputElement).value)}
          />
        {/if}

        <!-- Row 2: the other pages of this flow, as links rather than a
             name plus a separate "Open" button. -->
        {#if siblingScripts.length > 0}
          <p class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
            Pages:
            {#each siblingScripts as sibling (sibling.id)}
              <button type="button" class="font-medium text-accent-500 hover:underline" onclick={() => openSiblingScript(sibling.id)}>
                {sibling.name}
              </button>
            {/each}
          </p>
        {/if}

        <!-- Row 3: the keys at a glance, expanding to values and timestamps. -->
        {#if showFlowVariablesPanel}
          <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
            Vars:
            {#each flowVariableRows as row (row.key)}
              <span class="rounded bg-canvas px-1.5 py-0.5 font-mono text-ink-2 {row.entry ? '' : 'opacity-60'}">{row.key}</span>
            {:else}
              <span class="text-ink-3">none yet</span>
            {/each}
            <button
              type="button"
              class="ml-auto flex items-center gap-1 font-medium text-ink-2 transition hover:text-accent-500"
              aria-expanded={flowVariablesPanelOpen}
              onclick={() => (flowVariablesPanelOpen = !flowVariablesPanelOpen)}
            >
              Flow variables ({flowVariableRows.length})
              <CaretDownIcon size={9} weight="bold" class="transition {flowVariablesPanelOpen ? 'rotate-180' : ''}" />
            </button>
          </div>
          {#if flowVariablesPanelOpen}
            <div class="mt-1.5 space-y-1 rounded-lg bg-canvas p-2">
              {#each flowVariableRows as row (row.key)}
                <div class="flex items-center justify-between gap-2 text-xs">
                  <span class="shrink-0 font-mono text-ink-2">{row.key}</span>
                  {#if row.entry}
                    <span class="flex min-w-0 items-center gap-2">
                      <span class="truncate text-ink-1" title={row.entry.value}>{row.entry.value || '(empty)'}</span>
                      <span class="shrink-0 text-ink-3">{formatRelativeTime(row.entry.updatedAt)}</span>
                    </span>
                  {:else}
                    <span class="shrink-0 text-ink-3">not filled yet</span>
                  {/if}
                </div>
              {:else}
                <p class="text-xs text-ink-3">No values published yet.</p>
              {/each}
            </div>
          {/if}
        {/if}
      </section>

      <section>
        <div class="mb-2 flex flex-wrap items-center justify-between gap-y-1.5">
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-ink-3" for="url-patterns">
            URL patterns (one per line)
          </label>
          {#if showAddFieldsFromPage}
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-md border border-dashed border-accent-500/45 px-2 py-1 text-xs font-medium text-accent-500 transition hover:bg-accent-500/10"
              onclick={addFieldsFromPage}
            >
              <CursorClickIcon size={12} weight="bold" />
              Add fields from page
            </button>
          {/if}
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
            Fields ({fieldCount})
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
            {#if showAddFieldsFromPage}
              No fields mapped yet. Use "Add fields from page" above, "Add field" to write one by hand, or "Map fields
              on this page" from the popup.
            {:else}
              No fields mapped yet. Use "Add field" to write one by hand.
            {/if}
          </p>
        {:else}
          <div class="space-y-2">
            {#each draft.steps as step, index (step.type === 'field' ? step.field.id : step.id)}
              {#if step.type === 'field'}
                <FieldRow
                  field={step.field}
                  customGenerators={draft.customGenerators}
                  {fileTemplates}
                  {flowVariableKeys}
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
                  onCreateFileTemplate={() => openCreateFileTemplate(index)}
                  onEditFileTemplate={openEditFileTemplate}
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
            holds every field filled earlier in this script, keyed by that field's <strong class="text-ink-2"
              >label</strong
            >
            camelCased — a field labeled "Senha" is <code class="font-mono text-ink-2">fields.senha</code>, "Confirmar
            Senha" is <code class="font-mono text-ink-2">fields.confirmarSenha</code>. <code class="font-mono text-ink-2"
              >options</code
            > reflects whatever knobs you declare for this generator in its own "Options schema" panel below the code editor
            — empty by default until you add one.
          </p>
        {:else}
          <div class="space-y-3">
            {#each draft.customGenerators as generator (generator.id)}
              <CustomGeneratorCard
                {generator}
                memberCompletions={generatorCompletions}
                expanded={expandedGeneratorOptions.has(generator.id)}
                optionsError={generatorOptionsError[generator.id] ?? null}
                onToggleOptions={() => toggleGeneratorOptions(generator.id)}
                onSetOptionsSchemaText={(text) => setGeneratorOptionsSchemaText(generator, text)}
                onRemove={() => removeCustomGenerator(generator.id)}
              />
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
  open={deleteScriptGate.open}
  title="Delete this script?"
  message={`"${draft.name}" and all its fields and generators will be permanently deleted.`}
  onConfirm={() => deleteScriptGate.confirm(() => onDelete(draft.id))}
  onCancel={deleteScriptGate.cancel}
/>

<ConfirmDialog
  open={resetFlowGate.open}
  title="Reset this flow?"
  message="Every shared variable and the correlated identity (name/email/address/etc.) for this flow will be cleared. Scripts in it will generate fresh values next run."
  confirmLabel="Reset"
  onConfirm={() => resetFlowGate.confirm(resetFlow)}
  onCancel={resetFlowGate.cancel}
/>

{#if editingFileTemplate}
  <FileTemplateEditor
    template={editingFileTemplate}
    publishedFlowVariableKeys={allPublishedFlowVariableKeys}
    onSave={saveFileTemplateFromEditor}
    onDelete={assignTemplateToFieldIndex === null ? deleteFileTemplateFromEditor : undefined}
    onClose={closeFileTemplateEditor}
  />
{/if}
