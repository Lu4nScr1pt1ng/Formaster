<script lang="ts">
  import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
  import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import CustomGeneratorCard from './CustomGeneratorCard.svelte';
  import FlowVariableInput from './FlowVariableInput.svelte';
  import FileTemplateCanvasPreview from './FileTemplateCanvasPreview.svelte';
  import GeneratorOptionsEditor from './GeneratorOptionsEditor.svelte';
  import SearchableSelect, { type SearchableSelectOption } from './SearchableSelect.svelte';
  import { createConfirmGate } from '../lib/confirm-gate.svelte';
  import { useEscapeToClose } from '../lib/dismiss-on-outside.svelte';
  import { extractFlowVariableKeys } from '../lib/flow-variables';
  import { BUILTIN_GENERATOR_LABELS, type GeneratorRunContext } from '../lib/generators';
  import { BUILTIN_GENERATOR_OPTION_FIELDS } from '../lib/generators/option-fields';
  import { resolveTemplateTexts } from '../lib/generators/file-generators/resolve-template-texts';
  import { resolveTextSource, type TextResolutionDeps } from '../lib/generators/file-generators/resolve-text-sources';
  import { runCustomCode } from '../lib/generators/quickjs-runner';
  import type { FileTemplate, FileTemplateBackground, TextLayer } from '../lib/schema/file-template';
  import {
    formatValidationError,
    generatorOptionFieldSchema,
    type BuiltinGeneratorId,
    type CustomGenerator,
  } from '../lib/schema/script';

  interface Props {
    template: FileTemplate;
    /** Every `saveAsFlowVariable` key published anywhere, for the orphan-key warning — a template is global, not scoped to one Flow. */
    publishedFlowVariableKeys: string[];
    /**
     * The generators of the script this editor was opened from — a live
     * `$state` array, so editing a generator's name or code in a card below
     * writes straight back to that script's draft. A `custom` text layer
     * names one of these rather than something the template owns: it's the
     * same list the script's fields pick from, so a generator written once
     * serves a field and a document alike.
     */
    customGenerators: CustomGenerator[];
    /** Appends a generator to that script and returns it, so a layer can point at it immediately. */
    onCreateGenerator: () => CustomGenerator;
    onRemoveGenerator: (id: string) => void;
    onSave: (template: FileTemplate) => Promise<void>;
    onDelete?: (id: string) => void;
    onClose: () => void;
  }

  let {
    template,
    publishedFlowVariableKeys,
    customGenerators,
    onCreateGenerator,
    onRemoveGenerator,
    onSave,
    onDelete,
    onClose,
  }: Props = $props();

  // Local editable copy so cancelling leaves the stored template untouched.
  // `$state.snapshot`, not `structuredClone`: `template` is itself a reactive
  // proxy (it comes straight from ScriptEditor's `$state`), and
  // `structuredClone` throws outright on a proxy — which silently took the
  // whole editor down, so neither "+ New template…" nor "Edit template"
  // opened at all. Same reason ScriptEditor snapshots its own `script` prop.
  // svelte-ignore state_referenced_locally
  let draft = $state<FileTemplate>($state.snapshot(template));
  let saving = $state(false);
  let previewing = $state(false);
  let previewError = $state<string | null>(null);
  let imageError = $state<string | null>(null);
  /** Last "Preview" result per layer id — kept until the layer is previewed again, so a generator can be tweaked and re-run side by side. */
  let layerPreviews = $state<Record<string, { text: string; error: boolean }>>({});
  const deleteGate = createConfirmGate();

  useEscapeToClose(() => true, () => onClose());

  const FORMAT_OPTIONS: SearchableSelectOption[] = [
    { value: 'png', label: 'PNG image' },
    { value: 'pdf', label: 'PDF document' },
  ];
  const BACKGROUND_OPTIONS: SearchableSelectOption[] = $derived(
    draft.format === 'png'
      ? [
          { value: 'blank', label: 'Solid color' },
          { value: 'image', label: 'Uploaded image' },
        ]
      : [
          { value: 'blank', label: 'Blank page' },
          { value: 'pdf', label: 'Uploaded PDF' },
        ],
  );
  const ALIGN_OPTIONS: SearchableSelectOption[] = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
  ];
  const WEIGHT_OPTIONS: SearchableSelectOption[] = [
    { value: 'normal', label: 'Normal' },
    { value: 'bold', label: 'Bold' },
  ];
  // The same four choices a form field has. A document that can only print
  // what some other field happened to publish is a much narrower tool than
  // one that can generate its own values — a certificate number, a formatted
  // date, a name for a flow whose earlier page never asked for one.
  const SOURCE_KIND_OPTIONS: SearchableSelectOption[] = [
    { value: 'literal', label: 'Fixed text' },
    { value: 'flowVariable', label: 'Flow variable' },
    { value: 'builtin', label: 'Built-in generator' },
    { value: 'custom', label: 'Custom script' },
  ];
  const BUILTIN_SELECT_OPTIONS: SearchableSelectOption[] = (
    Object.entries(BUILTIN_GENERATOR_LABELS) as [BuiltinGeneratorId, string][]
  ).map(([id, label]) => ({ value: id, label }));

  const NEW_GENERATOR_VALUE = '__new_generator__';

  const customGeneratorOptions = $derived<SearchableSelectOption[]>([
    ...(customGenerators.length === 0 ? [{ value: '', label: 'No custom generators yet' }] : []),
    ...customGenerators.map((generator) => ({ value: generator.id, label: generator.name })),
    { value: NEW_GENERATOR_VALUE, label: '+ New generator…' },
  ]);

  /**
   * What generator code gets in scope, as editor completions. `fields` is
   * deliberately absent here even though it exists at fill time: the script's
   * own editor lists its fields, and duplicating that list inside a modal
   * about a *global* template would suggest the template is tied to them.
   */
  const generatorCompletions = $derived({
    helpers: (Object.entries(BUILTIN_GENERATOR_LABELS) as [BuiltinGeneratorId, string][]).map(([id, label]) => ({
      label: `${id}()`,
      detail: label,
    })),
    flowVars: publishedFlowVariableKeys.map((key) => ({ label: key, detail: 'flow variable' })),
  });

  function setFormat(format: string): void {
    if (format === draft.format) return;
    if (format === 'png') {
      draft = { ...draft, format: 'png', canvas: draft.canvas ?? { width: 800, height: 600 }, background: { kind: 'blank', color: '#ffffff' } };
    } else {
      draft = { ...draft, format: 'pdf', background: { kind: 'blank', color: '#ffffff' } };
    }
  }

  function setBackgroundKind(kind: string): void {
    if (kind === 'blank') draft.background = { kind: 'blank', color: '#ffffff' };
    else if (kind === 'image') draft.background = { kind: 'image', dataUrl: '' };
    else if (kind === 'pdf') draft.background = { kind: 'pdf', dataUrl: '' };
  }

  function addLayer(): void {
    const layer: TextLayer = {
      id: crypto.randomUUID(),
      pageIndex: 0,
      x: 40,
      y: 40,
      fontSizePx: 24,
      fontWeight: 'normal',
      color: '#000000',
      align: 'left',
      source: { kind: 'literal', value: '' },
    };
    draft.textLayers = [...draft.textLayers, layer];
  }

  function removeLayer(id: string): void {
    draft.textLayers = draft.textLayers.filter((layer) => layer.id !== id);
  }

  function updateLayer(id: string, patch: Partial<TextLayer>): void {
    draft.textLayers = draft.textLayers.map((layer) => (layer.id === id ? ({ ...layer, ...patch } as TextLayer) : layer));
  }

  function setLayerSourceKind(layer: TextLayer, kind: string): void {
    if (kind === 'literal') updateLayer(layer.id, { source: { kind: 'literal', value: '' } });
    else if (kind === 'flowVariable') updateLayer(layer.id, { source: { kind: 'flowVariable', key: '' } });
    else if (kind === 'builtin') updateLayer(layer.id, { source: { kind: 'builtin', id: 'fullName' } });
    else if (customGenerators.length === 0) {
      // Same courtesy as a field's generator picker: choosing "Custom script"
      // with nothing to choose from would otherwise be a dead end.
      createAndAssignGenerator(layer.id);
    } else {
      updateLayer(layer.id, { source: { kind: 'custom', generatorId: customGenerators[0].id } });
    }
  }

  function setLayerSourceOptions(layer: TextLayer, patch: Record<string, unknown>): void {
    const source = layer.source;
    if (source.kind !== 'builtin' && source.kind !== 'custom') return;
    updateLayer(layer.id, { source: { ...source, options: { ...source.options, ...patch } } });
  }

  function setLayerCustomGenerator(layer: TextLayer, generatorId: string): void {
    if (generatorId === NEW_GENERATOR_VALUE) {
      createAndAssignGenerator(layer.id);
      return;
    }
    updateLayer(layer.id, { source: { kind: 'custom', generatorId } });
  }

  function optionFieldsForLayer(layer: TextLayer) {
    if (layer.source.kind === 'builtin') return BUILTIN_GENERATOR_OPTION_FIELDS[layer.source.id] ?? [];
    if (layer.source.kind !== 'custom') return [];
    const generatorId = layer.source.generatorId;
    return customGenerators.find((entry) => entry.id === generatorId)?.optionsSchema ?? [];
  }

  /**
   * A `custom` layer whose generator isn't on the script this editor was
   * opened from. Worth flagging rather than leaving to fail at fill time:
   * the template is global, so the usual cause is that it was authored
   * against a different script's generator.
   */
  function missingGeneratorInLayer(layer: TextLayer): boolean {
    return layer.source.kind === 'custom' && !customGenerators.some((entry) => entry.id === (layer.source as { generatorId: string }).generatorId);
  }

  // --- The script's custom generators, edited in place ----------------------
  // `customGenerators` is the script draft's own live array, so a card below
  // writes name/code straight back to it — there is one list, reachable from
  // both the script editor and here, rather than two that can disagree.

  let expandedGeneratorOptions = $state(new Set<string>());
  let generatorOptionsError = $state<Record<string, string | null>>({});
  // Opens itself only when there's already something to look at — an initial
  // seed, not a rule, so toggling it afterwards sticks.
  // svelte-ignore state_referenced_locally
  let generatorsOpen = $state(customGenerators.length > 0);

  function addCustomGenerator(): void {
    onCreateGenerator();
    generatorsOpen = true;
  }

  function createAndAssignGenerator(layerId: string): void {
    const generator = onCreateGenerator();
    updateLayer(layerId, { source: { kind: 'custom', generatorId: generator.id } });
    generatorsOpen = true;
    requestAnimationFrame(() => focusGenerator(generator.id));
  }

  function focusGenerator(id: string): void {
    const card = document.getElementById(`template-generator-${id}`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card?.querySelector<HTMLElement>('.cm-content')?.focus();
  }

  function removeCustomGenerator(id: string): void {
    onRemoveGenerator(id);
    // Layers here pointing at it fall back to empty fixed text rather than
    // keeping a reference that would throw at fill time. The script's own
    // fields are repointed by the script editor, which owns that list.
    draft.textLayers = draft.textLayers.map((layer) =>
      layer.source.kind === 'custom' && layer.source.generatorId === id
        ? { ...layer, source: { kind: 'literal', value: '' } }
        : layer,
    );
  }

  function toggleGeneratorOptions(id: string): void {
    const next = new Set(expandedGeneratorOptions);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedGeneratorOptions = next;
  }

  function setGeneratorOptionsSchemaText(generator: CustomGenerator, text: string): void {
    try {
      generator.optionsSchema = generatorOptionFieldSchema.array().parse(JSON.parse(text || '[]'));
      generatorOptionsError = { ...generatorOptionsError, [generator.id]: null };
    } catch (error) {
      generatorOptionsError = { ...generatorOptionsError, [generator.id]: formatValidationError(error) };
    }
  }

  const MAX_IMAGE_DIMENSION = 2000;

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = dataUrl;
    });
  }

  /** Downscales to at most `MAX_IMAGE_DIMENSION` on the longer side — a full-resolution photo blows up `storage.local`'s per-item quota for no visual benefit at typical template sizes. */
  async function loadDownscaledImageDataUrl(file: File): Promise<string> {
    const raw = await readFileAsDataUrl(file);
    const image = await loadImageElement(raw);
    if (image.width <= MAX_IMAGE_DIMENSION && image.height <= MAX_IMAGE_DIMENSION) return raw;
    const scale = MAX_IMAGE_DIMENSION / Math.max(image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return raw;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }

  async function handleBackgroundImageUpload(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    imageError = null;
    try {
      const dataUrl = await loadDownscaledImageDataUrl(file);
      draft.background = { kind: 'image', dataUrl };
    } catch (error) {
      imageError = error instanceof Error ? error.message : 'Failed to load image';
    }
  }

  async function handleBackgroundPdfUpload(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    imageError = null;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      draft.background = { kind: 'pdf', dataUrl };
    } catch (error) {
      imageError = error instanceof Error ? error.message : 'Failed to load PDF';
    }
  }

  function isOrphanKey(key: string): boolean {
    return key.length > 0 && !publishedFlowVariableKeys.includes(key);
  }

  /**
   * Keys a layer references but nobody publishes — covers a `flowVariable`
   * source and any `{{key}}` spliced into a `literal` one. A generator-backed
   * layer produces its own value and so can't have an orphan key at all.
   */
  function orphanKeysInLayer(layer: TextLayer): string[] {
    if (layer.source.kind === 'flowVariable') return isOrphanKey(layer.source.key) ? [layer.source.key] : [];
    if (layer.source.kind !== 'literal') return [];
    return extractFlowVariableKeys(layer.source.value).filter(isOrphanKey);
  }

  /**
   * Stand-in Flow variables for previewing: every referenced key resolves to
   * its own `{{key}}` placeholder. There's no "current" Flow while authoring
   * a template meant to be reused across many, and a preview that threw
   * "variable not set" for every layer would be useless.
   *
   * Generator-backed layers need no such treatment — they generate a real
   * value here exactly as they would during a fill.
   */
  function placeholderFlowVars(template: FileTemplate): Record<string, string> {
    const keys = new Set(extractFlowVariableKeys(template.outputFilename));
    for (const layer of template.textLayers) {
      if (layer.source.kind === 'flowVariable') {
        if (layer.source.key) keys.add(layer.source.key);
      } else if (layer.source.kind === 'literal') {
        for (const key of extractFlowVariableKeys(layer.source.value)) keys.add(key);
      }
    }
    return Object.fromEntries([...keys].map((key) => [key, `{{${key}}}`]));
  }

  /** The resolution scope a preview runs in — one shared `runContext`, so two builtin layers previewing a name and an email agree on the person. */
  function previewDeps(template: FileTemplate): TextResolutionDeps {
    const flowVars = placeholderFlowVars(template);
    const runContext: GeneratorRunContext = {};
    return {
      flowVars,
      runContext,
      customGenerators: $state.snapshot(customGenerators) as CustomGenerator[],
      // No `fields`: a preview has filled nothing, so there are no earlier
      // field values to offer. They're populated for real at fill time by
      // whichever script runs the template.
      runCustom: (code: string, options: Record<string, unknown> | undefined) => runCustomCode(code, options, {}, runContext, flowVars),
    };
  }

  /**
   * Runs one layer's source and shows what it produced — the only way to
   * check a custom generator written here without saving the template,
   * wiring it to a field, and running a whole fill.
   */
  async function previewLayer(layerId: string): Promise<void> {
    const snapshot = $state.snapshot(draft);
    const layer = snapshot.textLayers.find((entry) => entry.id === layerId);
    if (!layer) return;
    layerPreviews = { ...layerPreviews, [layerId]: { text: '…', error: false } };
    try {
      const text = await resolveTextSource(layer.source, previewDeps(snapshot));
      layerPreviews = { ...layerPreviews, [layerId]: { text, error: false } };
    } catch (error) {
      layerPreviews = {
        ...layerPreviews,
        [layerId]: { text: error instanceof Error ? error.message : 'Preview failed', error: true },
      };
    }
  }

  /**
   * Renders a real PDF via the same `renderPdf()` the filler uses at fill
   * time, so this preview can't drift from actual output.
   */
  async function openPdfPreview(): Promise<void> {
    if (draft.format !== 'pdf') return;
    previewing = true;
    previewError = null;
    try {
      const snapshot = $state.snapshot(draft);
      const texts = await resolveTemplateTexts(snapshot, previewDeps(snapshot));
      // Imported here rather than at the top so pdf-lib (~400KB) isn't part
      // of the options-page bundle for everyone who never opens a PDF
      // template preview.
      const { renderPdf } = await import('../lib/generators/file-generators/render-pdf');
      const file = await renderPdf(snapshot, texts);
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
    } catch (error) {
      previewError = error instanceof Error ? error.message : 'Failed to render preview';
    } finally {
      previewing = false;
    }
  }

  async function save(): Promise<void> {
    saving = true;
    try {
      await onSave($state.snapshot(draft));
    } finally {
      saving = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
  <div class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-2xl">
    <div class="flex items-center justify-between border-b border-hair px-5 py-3">
      <h2 class="text-sm font-semibold text-ink-1">File template</h2>
      <button type="button" class="rounded-md p-1.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1" onclick={onClose} aria-label="Close">
        <XIcon size={16} weight="bold" />
      </button>
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto px-5 py-4 md:grid-cols-2">
      <div class="space-y-4">
        <label class="block">
          <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-3">Name</span>
          <input
            class="w-full rounded-lg border border-hair bg-canvas px-3 py-1.5 text-sm text-ink-1 outline-none focus:border-accent-500"
            bind:value={draft.name}
            placeholder="e.g. Valid document"
          />
        </label>

        <div class="flex items-center gap-3">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Format</span>
          <SearchableSelect ariaLabel="Format" value={draft.format} options={FORMAT_OPTIONS} onChange={setFormat} />
        </div>

        {#if draft.format === 'png'}
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Canvas</span>
            <input
              type="number"
              min="1"
              class="w-20 rounded-md border border-hair bg-canvas px-2 py-1 text-xs text-ink-1 outline-none focus:border-accent-500"
              value={draft.canvas?.width ?? 800}
              oninput={(event) =>
                (draft.canvas = { width: Number((event.currentTarget as HTMLInputElement).value) || 1, height: draft.canvas?.height ?? 600 })}
            />
            <span class="text-xs text-ink-3">×</span>
            <input
              type="number"
              min="1"
              class="w-20 rounded-md border border-hair bg-canvas px-2 py-1 text-xs text-ink-1 outline-none focus:border-accent-500"
              value={draft.canvas?.height ?? 600}
              oninput={(event) =>
                (draft.canvas = { width: draft.canvas?.width ?? 800, height: Number((event.currentTarget as HTMLInputElement).value) || 1 })}
            />
            <span class="text-xs text-ink-3">px</span>
          </div>
        {/if}

        <div class="space-y-2">
          <div class="flex items-center gap-3">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Background</span>
            <SearchableSelect
              ariaLabel="Background"
              value={draft.background.kind}
              options={BACKGROUND_OPTIONS}
              onChange={setBackgroundKind}
            />
          </div>
          {#if draft.background.kind === 'blank'}
            <input
              type="color"
              class="h-7 w-14 rounded border border-hair bg-canvas"
              value={draft.background.color}
              oninput={(event) => (draft.background = { kind: 'blank', color: (event.currentTarget as HTMLInputElement).value })}
            />
          {:else if draft.background.kind === 'image'}
            <label
              class="flex w-fit items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-ink-1 transition hover:bg-surface-hover"
            >
              <UploadSimpleIcon size={13} weight="bold" />
              Upload image…
              <input type="file" accept="image/*" class="hidden" onchange={handleBackgroundImageUpload} />
            </label>
          {:else if draft.background.kind === 'pdf'}
            <label
              class="flex w-fit items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-ink-1 transition hover:bg-surface-hover"
            >
              <UploadSimpleIcon size={13} weight="bold" />
              Upload base PDF…
              <input type="file" accept="application/pdf" class="hidden" onchange={handleBackgroundPdfUpload} />
            </label>
          {/if}
          {#if imageError}
            <p class="text-xs text-red-400">{imageError}</p>
          {/if}
        </div>

        <label class="block">
          <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-3">Output filename</span>
          <FlowVariableInput
            mode="template"
            keys={publishedFlowVariableKeys}
            value={draft.outputFilename}
            onInput={(value) => (draft.outputFilename = value)}
            class="w-full rounded-lg border border-hair bg-canvas px-3 py-1.5 font-mono text-sm text-ink-1 outline-none focus:border-accent-500"
            placeholder="document.png"
          />
          <span class="mt-1 block text-[11px] text-ink-3">Accepts {'{{key}}'} placeholders, resolved the same way as a flow-variable layer.</span>
        </label>
      </div>

      <div class="flex flex-col items-center gap-2">
        {#if draft.format === 'png'}
          <FileTemplateCanvasPreview template={draft} {customGenerators} />
        {:else}
          <div class="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hair p-6">
            <p class="text-center text-xs text-ink-3">PDF templates don't get a thumbnail — open a real render instead.</p>
            <button
              type="button"
              class="rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-ink-1 transition hover:bg-surface-hover disabled:opacity-50"
              onclick={openPdfPreview}
              disabled={previewing}
            >
              {previewing ? 'Rendering…' : 'Open preview'}
            </button>
            {#if previewError}
              <p class="text-xs text-red-400">{previewError}</p>
            {/if}
          </div>
        {/if}
      </div>

      <div class="md:col-span-2">
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Text layers ({draft.textLayers.length})</h3>
          <button type="button" class="flex items-center gap-1 text-xs font-medium text-accent-500 hover:underline" onclick={addLayer}>
            <PlusIcon size={12} weight="bold" />
            Add layer
          </button>
        </div>

        {#if draft.textLayers.length === 0}
          <p class="text-sm text-ink-3">No text layers yet — this template will just render its background as-is.</p>
        {:else}
          <div class="space-y-2">
            {#each draft.textLayers as layer (layer.id)}
              <div class="rounded-lg bg-canvas p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <SearchableSelect
                    ariaLabel="Text source"
                    value={layer.source.kind}
                    options={SOURCE_KIND_OPTIONS}
                    onChange={(kind) => setLayerSourceKind(layer, kind)}
                  />
                  {#if layer.source.kind === 'literal'}
                    <FlowVariableInput
                      mode="template"
                      keys={publishedFlowVariableKeys}
                      value={layer.source.value}
                      onInput={(value) => updateLayer(layer.id, { source: { kind: 'literal', value } })}
                      wrapperClass="min-w-0 flex-1"
                      class="w-full rounded-md border border-hair bg-surface px-2 py-1 text-xs text-ink-1 outline-none focus:border-accent-500"
                      placeholder="Text, may include {'{{flowVariable}}'}"
                    />
                  {:else if layer.source.kind === 'flowVariable'}
                    <FlowVariableInput
                      mode="key"
                      keys={publishedFlowVariableKeys}
                      value={layer.source.key}
                      onInput={(key) => updateLayer(layer.id, { source: { kind: 'flowVariable', key } })}
                      wrapperClass="min-w-0 flex-1"
                      class="w-full rounded-md border border-hair bg-surface px-2 py-1 font-mono text-xs text-ink-1 outline-none focus:border-accent-500"
                      placeholder="Flow variable key"
                    />
                  {:else if layer.source.kind === 'builtin'}
                    <SearchableSelect
                      ariaLabel="Built-in generator"
                      value={layer.source.id}
                      options={BUILTIN_SELECT_OPTIONS}
                      onChange={(id) => updateLayer(layer.id, { source: { kind: 'builtin', id: id as BuiltinGeneratorId } })}
                    />
                  {:else}
                    <SearchableSelect
                      ariaLabel="Custom generator"
                      value={layer.source.generatorId}
                      options={customGeneratorOptions}
                      onChange={(generatorId) => setLayerCustomGenerator(layer, generatorId)}
                    />
                    {#if layer.source.generatorId}
                      {@const generatorId = layer.source.generatorId}
                      <button
                        type="button"
                        class="rounded-md p-1.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1"
                        title="Edit generator code"
                        aria-label="Edit generator code"
                        onclick={() => focusGenerator(generatorId)}
                      >
                        <PencilSimpleIcon size={13} weight="bold" />
                      </button>
                    {/if}
                  {/if}
                  <button
                    type="button"
                    class="ml-auto rounded-md p-1.5 text-ink-3 hover:bg-red-500/10 hover:text-red-400"
                    title="Remove layer"
                    aria-label="Remove layer"
                    onclick={() => removeLayer(layer.id)}
                  >
                    <TrashIcon size={13} weight="bold" />
                  </button>
                </div>

                {#if optionFieldsForLayer(layer).length > 0}
                  <div class="mt-2 flex flex-wrap items-center gap-3">
                    <GeneratorOptionsEditor
                      fields={optionFieldsForLayer(layer)}
                      value={layer.source.kind === 'builtin' || layer.source.kind === 'custom' ? layer.source.options : undefined}
                      onChange={(patch) => setLayerSourceOptions(layer, patch)}
                    />
                  </div>
                {/if}

                {#if missingGeneratorInLayer(layer)}
                  <p class="mt-1.5 flex items-center gap-1 text-[11px] text-amber-400">
                    <WarningIcon size={11} weight="bold" />
                    This script has no such generator — the layer will error until you pick one, or add it to the script.
                  </p>
                {/if}

                {#if orphanKeysInLayer(layer).length > 0}
                  {@const orphans = orphanKeysInLayer(layer)}
                  <p class="mt-1.5 flex items-center gap-1 text-[11px] text-amber-400">
                    <WarningIcon size={11} weight="bold" />
                    No field currently saves {orphans.map((key) => `"${key}"`).join(', ')} — the layer will show an error until one does.
                  </p>
                {/if}

                <!-- Resolving one layer on demand is the only way to check a
                     generator written here without saving the template,
                     attaching it to a field and running a whole fill. -->
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="flex items-center gap-1 rounded-md border border-hair px-2 py-1 text-[11px] text-ink-2 transition hover:border-accent-500 hover:text-accent-500"
                    onclick={() => previewLayer(layer.id)}
                  >
                    <PlayIcon size={10} weight="fill" />
                    Preview
                  </button>
                  {#if layerPreviews[layer.id]}
                    <span
                      class="max-w-64 truncate rounded-md px-2 py-1 font-mono text-[11px] {layerPreviews[layer.id].error
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-accent-500/10 text-accent-500'}"
                    >
                      {layerPreviews[layer.id].text || '(empty string)'}
                    </span>
                  {/if}
                </div>

                <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-2">
                  <label class="flex items-center gap-1">
                    x
                    <input
                      type="number"
                      class="w-16 rounded-md border border-hair bg-surface px-1.5 py-1 text-right text-ink-1 outline-none focus:border-accent-500"
                      value={layer.x}
                      oninput={(event) => updateLayer(layer.id, { x: Number((event.currentTarget as HTMLInputElement).value) || 0 })}
                    />
                  </label>
                  <label class="flex items-center gap-1">
                    y
                    <input
                      type="number"
                      class="w-16 rounded-md border border-hair bg-surface px-1.5 py-1 text-right text-ink-1 outline-none focus:border-accent-500"
                      value={layer.y}
                      oninput={(event) => updateLayer(layer.id, { y: Number((event.currentTarget as HTMLInputElement).value) || 0 })}
                    />
                  </label>
                  <label class="flex items-center gap-1">
                    Size
                    <input
                      type="number"
                      min="1"
                      class="w-16 rounded-md border border-hair bg-surface px-1.5 py-1 text-right text-ink-1 outline-none focus:border-accent-500"
                      value={layer.fontSizePx}
                      oninput={(event) =>
                        updateLayer(layer.id, { fontSizePx: Number((event.currentTarget as HTMLInputElement).value) || 1 })}
                    />
                  </label>
                  <label class="flex items-center gap-1">
                    Max width
                    <input
                      type="number"
                      min="0"
                      class="w-16 rounded-md border border-hair bg-surface px-1.5 py-1 text-right text-ink-1 outline-none focus:border-accent-500"
                      value={layer.maxWidthPx ?? ''}
                      placeholder="—"
                      oninput={(event) => {
                        const raw = (event.currentTarget as HTMLInputElement).value;
                        updateLayer(layer.id, { maxWidthPx: raw === '' ? undefined : Number(raw) || undefined });
                      }}
                    />
                  </label>
                  <input
                    type="color"
                    class="h-6 w-8 rounded border border-hair bg-surface"
                    value={layer.color}
                    oninput={(event) => updateLayer(layer.id, { color: (event.currentTarget as HTMLInputElement).value })}
                  />
                  <SearchableSelect
                    ariaLabel="Alignment"
                    value={layer.align}
                    options={ALIGN_OPTIONS}
                    onChange={(align) => updateLayer(layer.id, { align: align as TextLayer['align'] })}
                  />
                  <SearchableSelect
                    ariaLabel="Weight"
                    value={layer.fontWeight}
                    options={WEIGHT_OPTIONS}
                    onChange={(weight) => updateLayer(layer.id, { fontWeight: weight as TextLayer['fontWeight'] })}
                  />
                  {#if draft.format === 'pdf'}
                    <label class="flex items-center gap-1">
                      Page
                      <input
                        type="number"
                        min="0"
                        class="w-12 rounded-md border border-hair bg-surface px-1.5 py-1 text-right text-ink-1 outline-none focus:border-accent-500"
                        value={layer.pageIndex}
                        oninput={(event) =>
                          updateLayer(layer.id, { pageIndex: Number((event.currentTarget as HTMLInputElement).value) || 0 })}
                      />
                    </label>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="md:col-span-2">
        <div class="mb-2 flex items-center justify-between">
          <button
            type="button"
            class="text-[11px] font-semibold uppercase tracking-wider text-ink-3 transition hover:text-ink-1"
            aria-expanded={generatorsOpen}
            onclick={() => (generatorsOpen = !generatorsOpen)}
          >
            Custom generators ({customGenerators.length})
          </button>
          <button type="button" class="flex items-center gap-1 text-xs font-medium text-accent-500 hover:underline" onclick={addCustomGenerator}>
            <PlusIcon size={12} weight="bold" />
            Add generator
          </button>
        </div>

        {#if generatorsOpen}
          <p class="mb-2 text-[11px] text-ink-3">
            These belong to the script you opened this template from — the same ones its fields use. Editing one here edits it there, and it
            saves with the script, not with this template.
          </p>
          {#if customGenerators.length === 0}
            <p class="text-sm text-ink-3">None yet — add one to have a layer compute its own text.</p>
          {:else}
            <div class="space-y-2">
              {#each customGenerators as generator (generator.id)}
                <CustomGeneratorCard
                  {generator}
                  idPrefix="template-generator"
                  expanded={expandedGeneratorOptions.has(generator.id)}
                  optionsError={generatorOptionsError[generator.id] ?? null}
                  onToggleOptions={() => toggleGeneratorOptions(generator.id)}
                  onSetOptionsSchemaText={(text) => setGeneratorOptionsSchemaText(generator, text)}
                  onRemove={() => removeCustomGenerator(generator.id)}
                  memberCompletions={generatorCompletions}
                />
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <div class="flex items-center justify-between border-t border-hair px-5 py-3">
      {#if onDelete}
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-500/10"
          onclick={() => deleteGate.request(true)}
        >
          <TrashIcon size={14} weight="bold" />
          Delete
        </button>
      {:else}
        <span></span>
      {/if}
      <div class="flex gap-2">
        <button type="button" class="rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-1 transition hover:bg-surface-hover" onclick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-accent-500 px-4 py-1.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-600 disabled:opacity-50"
          onclick={save}
          disabled={saving || !draft.name.trim()}
        >
          {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  </div>
</div>

<ConfirmDialog
  open={deleteGate.open}
  title="Delete this template?"
  message={`"${draft.name}" will be permanently deleted. Fields using it will show an error until reassigned.`}
  onConfirm={() => deleteGate.confirm(() => onDelete?.(draft.id))}
  onCancel={deleteGate.cancel}
/>
