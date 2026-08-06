<script lang="ts">
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
  import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import FlowVariableInput from './FlowVariableInput.svelte';
  import FileTemplateCanvasPreview from './FileTemplateCanvasPreview.svelte';
  import SearchableSelect, { type SearchableSelectOption } from './SearchableSelect.svelte';
  import { createConfirmGate } from '../lib/confirm-gate.svelte';
  import { useEscapeToClose } from '../lib/dismiss-on-outside.svelte';
  import { extractFlowVariableKeys } from '../lib/flow-variables';
  import type { FileTemplate, FileTemplateBackground, TextLayer } from '../lib/schema/file-template';
  import { resetFlowValues, setFlowValue } from '../lib/storage/flow-values-store';

  interface Props {
    template: FileTemplate;
    /** Every `saveAsFlowVariable` key published anywhere, for the orphan-key warning — a template is global, not scoped to one Flow. */
    publishedFlowVariableKeys: string[];
    onSave: (template: FileTemplate) => Promise<void>;
    onDelete?: (id: string) => void;
    onClose: () => void;
  }

  let { template, publishedFlowVariableKeys, onSave, onDelete, onClose }: Props = $props();

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
  const SOURCE_KIND_OPTIONS: SearchableSelectOption[] = [
    { value: 'literal', label: 'Fixed text' },
    { value: 'flowVariable', label: 'Flow variable' },
  ];

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
    updateLayer(layer.id, { source: kind === 'literal' ? { kind: 'literal', value: '' } : { kind: 'flowVariable', key: '' } });
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

  /** Keys a layer references but nobody publishes — covers a `flowVariable` source and any `{{key}}` spliced into a `literal` one. */
  function orphanKeysInLayer(layer: TextLayer): string[] {
    if (layer.source.kind === 'flowVariable') return isOrphanKey(layer.source.key) ? [layer.source.key] : [];
    return extractFlowVariableKeys(layer.source.value).filter(isOrphanKey);
  }

  /**
   * Renders a real PDF via the same `renderPdf()` the filler uses at fill
   * time, so this preview can't drift from actual output — but against a
   * throwaway Flow with every referenced variable seeded to its own
   * `{{key}}` placeholder, since there's no "current" Flow while authoring a
   * template that's meant to be reused across many.
   */
  async function openPdfPreview(): Promise<void> {
    if (draft.format !== 'pdf') return;
    previewing = true;
    previewError = null;
    const scratchFlowId = `template-preview-${crypto.randomUUID()}`;
    try {
      const keys = new Set(extractFlowVariableKeys(draft.outputFilename));
      for (const layer of draft.textLayers) {
        if (layer.source.kind === 'flowVariable') {
          if (layer.source.key) keys.add(layer.source.key);
        } else {
          for (const key of extractFlowVariableKeys(layer.source.value)) keys.add(key);
        }
      }
      for (const key of keys) await setFlowValue(scratchFlowId, key, `{{${key}}}`);
      // Imported here rather than at the top so pdf-lib (~400KB) isn't part
      // of the options-page bundle for everyone who never opens a PDF
      // template preview.
      const { renderPdf } = await import('../lib/generators/file-generators/render-pdf');
      const file = await renderPdf($state.snapshot(draft), scratchFlowId);
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
    } catch (error) {
      previewError = error instanceof Error ? error.message : 'Failed to render preview';
    } finally {
      await resetFlowValues(scratchFlowId);
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
          <FileTemplateCanvasPreview template={draft} />
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
                  {:else}
                    <FlowVariableInput
                      mode="key"
                      keys={publishedFlowVariableKeys}
                      value={layer.source.key}
                      onInput={(key) => updateLayer(layer.id, { source: { kind: 'flowVariable', key } })}
                      wrapperClass="min-w-0 flex-1"
                      class="w-full rounded-md border border-hair bg-surface px-2 py-1 font-mono text-xs text-ink-1 outline-none focus:border-accent-500"
                      placeholder="Flow variable key"
                    />
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
                {#if orphanKeysInLayer(layer).length > 0}
                  {@const orphans = orphanKeysInLayer(layer)}
                  <p class="mt-1.5 flex items-center gap-1 text-[11px] text-amber-400">
                    <WarningIcon size={11} weight="bold" />
                    No field currently saves {orphans.map((key) => `"${key}"`).join(', ')} — the layer will show an error until one does.
                  </p>
                {/if}

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
