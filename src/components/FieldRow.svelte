<script lang="ts">
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';
  import CheckSquareIcon from 'phosphor-svelte/lib/CheckSquareIcon';
  import CodeIcon from 'phosphor-svelte/lib/CodeIcon';
  import CopySimpleIcon from 'phosphor-svelte/lib/CopySimpleIcon';
  import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import SquareIcon from 'phosphor-svelte/lib/SquareIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import SearchableSelect, { type SearchableSelectOption } from './SearchableSelect.svelte';
  import { BUILTIN_GENERATOR_LABELS } from '../lib/generators';
  import {
    fieldElementTypeSchema,
    type BuiltinGeneratorId,
    type CustomGenerator,
    type FieldElementType,
    type FieldMapping,
    type GeneratorRef,
    type SelectorCandidate,
  } from '../lib/schema/script';

  const SELECTOR_STRATEGIES: SelectorCandidate['strategy'][] = [
    'id',
    'name',
    'data-testid',
    'aria-label',
    'css',
    'xpath',
  ];
  const SELECTOR_STRATEGY_OPTIONS: SearchableSelectOption[] = SELECTOR_STRATEGIES.map((strategy) => ({
    value: strategy,
    label: strategy,
  }));

  const FIELD_ELEMENT_TYPES = fieldElementTypeSchema.options;
  const FIELD_ELEMENT_TYPE_OPTIONS: SearchableSelectOption[] = FIELD_ELEMENT_TYPES.map((type) => ({
    value: type,
    label: type,
  }));

  const GENERATOR_KIND_OPTIONS: SearchableSelectOption[] = [
    { value: 'builtin', label: 'Built-in generator' },
    { value: 'fixed', label: 'Fixed value' },
    { value: 'custom', label: 'Custom script' },
  ];

  const NEW_GENERATOR_VALUE = '__new__';

  interface Props {
    field: FieldMapping;
    customGenerators: CustomGenerator[];
    canMoveUp: boolean;
    canMoveDown: boolean;
    startExpanded?: boolean;
    onChange: (field: FieldMapping) => void;
    onRemove: () => void;
    onDuplicate: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onPreview: () => Promise<string>;
    onCreateGenerator: () => void;
    onFocusGenerator: (id: string) => void;
  }

  let {
    field,
    customGenerators,
    canMoveUp,
    canMoveDown,
    startExpanded = false,
    onChange,
    onRemove,
    onDuplicate,
    onMoveUp,
    onMoveDown,
    onPreview,
    onCreateGenerator,
    onFocusGenerator,
  }: Props = $props();

  let previewValue = $state<string | null>(null);
  let previewError = $state(false);
  let previewing = $state(false);
  // `startExpanded` only seeds the initial state (auto-expand a field just
  // added from the picker) — after that, `expanded` toggles independently
  // via the "Show selector" button, not by following the prop.
  // svelte-ignore state_referenced_locally
  let expanded = $state(startExpanded);
  let confirmRemoveOpen = $state(false);
  let newSelectorStrategy = $state<SelectorCandidate['strategy']>('css');
  let newSelectorValue = $state('');

  const builtinOptions = Object.entries(BUILTIN_GENERATOR_LABELS) as [BuiltinGeneratorId, string][];
  const builtinSelectOptions: SearchableSelectOption[] = builtinOptions.map(([id, label]) => ({ value: id, label }));

  const customGeneratorOptions = $derived<SearchableSelectOption[]>([
    ...(customGenerators.length === 0 ? [{ value: '', label: 'No custom generators yet' }] : []),
    ...customGenerators.map((generator) => ({ value: generator.id, label: generator.name })),
    { value: NEW_GENERATOR_VALUE, label: '+ New generator…' },
  ]);

  function setGeneratorKind(kind: GeneratorRef['kind']): void {
    let generator: GeneratorRef;
    if (kind === 'builtin') {
      generator = { kind: 'builtin', id: 'fullName' };
    } else if (kind === 'fixed') {
      generator = { kind: 'fixed', value: '' };
    } else {
      generator = { kind: 'custom', generatorId: customGenerators[0]?.id ?? '' };
    }
    onChange({ ...field, generator });
    if (kind === 'custom' && customGenerators.length === 0) {
      onCreateGenerator();
    }
  }

  function setBuiltinId(id: BuiltinGeneratorId): void {
    onChange({ ...field, generator: { kind: 'builtin', id } });
  }

  function setFixedValue(value: string): void {
    onChange({ ...field, generator: { kind: 'fixed', value } });
  }

  function setCustomId(value: string): void {
    if (value === NEW_GENERATOR_VALUE) {
      onCreateGenerator();
      return;
    }
    onChange({ ...field, generator: { kind: 'custom', generatorId: value } });
  }

  function confirmRemove(): void {
    confirmRemoveOpen = false;
    onRemove();
  }

  function toggleSelectorEnabled(index: number): void {
    const selectors = field.selectors.map((candidate, i) =>
      i === index ? { ...candidate, enabled: candidate.enabled === false } : candidate,
    );
    onChange({ ...field, selectors });
  }

  function updateSelectorValue(index: number, value: string): void {
    const selectors = field.selectors.map((candidate, i) => (i === index ? { ...candidate, value } : candidate));
    onChange({ ...field, selectors });
  }

  function removeSelector(index: number): void {
    if (field.selectors.length <= 1) return; // at least one candidate must remain
    onChange({ ...field, selectors: field.selectors.filter((_, i) => i !== index) });
  }

  function addSelector(): void {
    const value = newSelectorValue.trim();
    if (!value) return;
    onChange({
      ...field,
      selectors: [...field.selectors, { strategy: newSelectorStrategy, value, enabled: true }],
    });
    newSelectorValue = '';
  }

  async function preview(): Promise<void> {
    previewing = true;
    previewError = false;
    try {
      previewValue = await onPreview();
    } catch (error) {
      previewValue = error instanceof Error ? error.message : 'Preview failed';
      previewError = true;
    } finally {
      previewing = false;
      setTimeout(() => (previewValue = null), 5000);
    }
  }
</script>

<div id={`field-${field.id}`} class="rounded-xl bg-surface p-3">
  <div class="flex flex-wrap items-center gap-y-1.5 gap-x-2">
    <div class="flex shrink-0 flex-col">
      <button
        type="button"
        class="rounded p-0.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1 disabled:pointer-events-none disabled:opacity-25"
        title="Move up"
        aria-label="Move up"
        disabled={!canMoveUp}
        onclick={onMoveUp}
      >
        <CaretUpIcon size={11} weight="bold" />
      </button>
      <button
        type="button"
        class="rounded p-0.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1 disabled:pointer-events-none disabled:opacity-25"
        title="Move down"
        aria-label="Move down"
        disabled={!canMoveDown}
        onclick={onMoveDown}
      >
        <CaretDownIcon size={11} weight="bold" />
      </button>
    </div>

    <SearchableSelect
      compact
      ariaLabel="Field type"
      value={field.elementType}
      options={FIELD_ELEMENT_TYPE_OPTIONS}
      onChange={(elementType) => onChange({ ...field, elementType: elementType as FieldElementType })}
    />

    <div class="group relative flex min-w-[7rem] flex-1 items-center">
      <input
        class="min-w-0 flex-1 rounded-t-[5px] border-b border-dashed border-white/15 bg-transparent px-1 py-0.5 text-sm text-ink-1 outline-none transition placeholder:text-ink-3 hover:border-white/30 hover:bg-surface-hover focus:border-solid focus:border-accent-500 focus:bg-surface-hover"
        value={field.label ?? ''}
        placeholder="Field label"
        oninput={(event) => onChange({ ...field, label: (event.currentTarget as HTMLInputElement).value })}
      />
      <PencilSimpleIcon
        size={11}
        class="pointer-events-none ml-1 shrink-0 text-ink-3 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
      />
    </div>

    <button
      type="button"
      class="rounded-md p-1.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1 {expanded ? 'bg-surface-hover text-accent-500' : ''}"
      title="Show selector"
      aria-label="Show selector"
      onclick={() => (expanded = !expanded)}
    >
      <CodeIcon size={15} weight="bold" />
    </button>
    <button
      type="button"
      class="rounded-md p-1.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1"
      title="Duplicate field"
      aria-label="Duplicate field"
      onclick={onDuplicate}
    >
      <CopySimpleIcon size={15} weight="bold" />
    </button>
    <button
      type="button"
      class="rounded-md p-1.5 text-ink-3 hover:bg-red-500/10 hover:text-red-400"
      title="Remove field"
      aria-label="Remove field"
      onclick={() => (confirmRemoveOpen = true)}
    >
      <TrashIcon size={15} weight="bold" />
    </button>
  </div>

  {#if expanded}
    <div class="mt-2.5 space-y-1.5 border-t border-hair pt-2.5">
      <p class="px-0.5 text-[10px] text-ink-3">
        Tried top to bottom until one matches. Disable ones that look unstable (e.g. a generated id).
      </p>
      {#each field.selectors as candidate, index}
        {@const isEnabled = candidate.enabled !== false}
        <div class="flex items-center gap-1.5 font-mono text-[11px]">
          <button
            type="button"
            class="shrink-0 p-0.5 {isEnabled ? 'text-accent-500' : 'text-ink-3'}"
            title={isEnabled ? 'Disable this candidate' : 'Enable this candidate'}
            aria-label={isEnabled ? 'Disable selector candidate' : 'Enable selector candidate'}
            onclick={() => toggleSelectorEnabled(index)}
          >
            {#if isEnabled}
              <CheckSquareIcon size={13} weight="fill" />
            {:else}
              <SquareIcon size={13} />
            {/if}
          </button>
          <span class="w-16 shrink-0 uppercase tracking-wide {isEnabled ? 'text-ink-2' : 'text-ink-3'}">
            {candidate.strategy}
          </span>
          <input
            class="min-w-0 flex-1 rounded-md border border-hair bg-canvas px-1.5 py-1 text-ink-1 outline-none focus:bg-surface-hover {isEnabled
              ? ''
              : 'text-ink-3 line-through'}"
            value={candidate.value}
            oninput={(event) => updateSelectorValue(index, (event.currentTarget as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="shrink-0 p-0.5 text-ink-3 hover:text-red-400 disabled:pointer-events-none disabled:opacity-30"
            title="Remove candidate"
            aria-label="Remove selector candidate"
            disabled={field.selectors.length <= 1}
            onclick={() => removeSelector(index)}
          >
            <TrashIcon size={12} weight="bold" />
          </button>
        </div>
      {/each}

      <div class="mt-1.5 flex items-center gap-1.5 border-t border-hair pt-1.5">
        <SearchableSelect
          compact
          ariaLabel="New selector strategy"
          value={newSelectorStrategy}
          options={SELECTOR_STRATEGY_OPTIONS}
          onChange={(strategy) => (newSelectorStrategy = strategy as SelectorCandidate['strategy'])}
        />
        <input
          class="min-w-0 flex-1 rounded border border-dashed border-white/20 bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-ink-1 outline-none placeholder:text-ink-3"
          placeholder="Type a value to match this by…"
          bind:value={newSelectorValue}
          onkeydown={(event) => event.key === 'Enter' && addSelector()}
        />
        <button
          type="button"
          class="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-accent-500 hover:bg-accent-500/10"
          onclick={addSelector}
        >
          <PlusIcon size={11} weight="bold" />
          Add
        </button>
      </div>
    </div>
  {/if}

  <div class="mt-2.5 flex flex-wrap items-center gap-2">
    <SearchableSelect
      ariaLabel="Generator kind"
      value={field.generator.kind}
      options={GENERATOR_KIND_OPTIONS}
      onChange={(kind) => setGeneratorKind(kind as GeneratorRef['kind'])}
    />

    {#if field.generator.kind === 'builtin'}
      <SearchableSelect
        ariaLabel="Built-in generator"
        value={field.generator.id}
        options={builtinSelectOptions}
        onChange={(id) => setBuiltinId(id as BuiltinGeneratorId)}
      />
    {:else if field.generator.kind === 'fixed'}
      <input
        class="rounded-md border border-hair bg-canvas px-2 py-1 text-xs text-ink-1 outline-none focus:border-accent-500"
        value={field.generator.value}
        oninput={(event) => setFixedValue((event.currentTarget as HTMLInputElement).value)}
      />
    {:else}
      <SearchableSelect
        ariaLabel="Custom generator"
        value={field.generator.generatorId}
        options={customGeneratorOptions}
        onChange={setCustomId}
      />
      {#if field.generator.generatorId}
        <button
          type="button"
          class="rounded-md p-1.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1"
          title="Edit generator code"
          aria-label="Edit generator code"
          onclick={() => onFocusGenerator((field.generator as { generatorId: string }).generatorId)}
        >
          <PencilSimpleIcon size={14} weight="bold" />
        </button>
      {/if}
    {/if}
  </div>

  <div class="mt-2.5 flex flex-wrap items-center gap-y-1.5 gap-x-2 border-t border-hair pt-2.5">
    <button
      type="button"
      class="flex items-center gap-1 rounded-md border border-hair px-2 py-1 text-xs text-ink-2 transition hover:border-accent-500 hover:text-accent-500 disabled:opacity-50"
      onclick={preview}
      disabled={previewing}
    >
      {#if previewing}
        <span class="h-2.5 w-2.5 animate-spin rounded-full border-2 border-ink-3/40 border-t-ink-1"></span>
      {:else}
        <PlayIcon size={11} weight="fill" />
      {/if}
      {previewing ? 'Running…' : 'Preview value'}
    </button>
    {#if previewValue !== null}
      <span
        class="max-w-52 truncate rounded-md px-2 py-1 font-mono text-xs {previewError
          ? 'bg-red-500/10 text-red-400'
          : 'bg-accent-500/10 text-accent-500'}"
      >
        {previewValue || '(empty string)'}
      </span>
    {:else}
      <span class="text-xs text-ink-3">See what this field will generate</span>
    {/if}
  </div>
</div>

<ConfirmDialog
  open={confirmRemoveOpen}
  title="Remove this field?"
  message={`"${field.label || field.elementType}" will no longer be filled by this script.`}
  confirmLabel="Remove"
  onConfirm={confirmRemove}
  onCancel={() => (confirmRemoveOpen = false)}
/>
