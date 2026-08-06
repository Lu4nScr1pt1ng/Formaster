<script lang="ts">
  import CodeIcon from 'phosphor-svelte/lib/CodeIcon';
  import FlagIcon from 'phosphor-svelte/lib/FlagIcon';
  import CopySimpleIcon from 'phosphor-svelte/lib/CopySimpleIcon';
  import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import XIcon from 'phosphor-svelte/lib/XIcon';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import FlowVariableInput from './FlowVariableInput.svelte';
  import GeneratorOptionsEditor from './GeneratorOptionsEditor.svelte';
  import SearchableSelect, { type SearchableSelectOption } from './SearchableSelect.svelte';
  import SelectorCandidateEditor from './SelectorCandidateEditor.svelte';
  import StepMoveButtons from './StepMoveButtons.svelte';
  import { createConfirmGate } from '../lib/confirm-gate.svelte';
  import { createFlashTimer } from '../lib/flash-timer';
  import { BUILTIN_GENERATOR_LABELS } from '../lib/generators';
  import { BUILTIN_GENERATOR_OPTION_FIELDS } from '../lib/generators/option-fields';
  import type { FileTemplate } from '../lib/schema/file-template';
  import {
    fieldElementTypeSchema,
    type BuiltinGeneratorId,
    type CustomGenerator,
    type FieldElementType,
    type FieldMapping,
    type GeneratorRef,
  } from '../lib/schema/script';

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
  const NEW_TEMPLATE_VALUE = '__new_template__';

  interface Props {
    field: FieldMapping;
    customGenerators: CustomGenerator[];
    fileTemplates: FileTemplate[];
    /** Every `saveAsFlowVariable` key already used by another field in the same Flow — offered as datalist suggestions. */
    flowVariableKeys: string[];
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
    onCreateFileTemplate: () => void;
    onEditFileTemplate: (templateId: string) => void;
  }

  let {
    field,
    customGenerators,
    fileTemplates,
    flowVariableKeys,
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
    onCreateFileTemplate,
    onEditFileTemplate,
  }: Props = $props();


  let previewValue = $state<string | null>(null);
  let previewError = $state(false);
  let previewing = $state(false);
  // `startExpanded` only seeds the initial state (auto-expand a field just
  // added from the picker) — after that, `expanded` toggles independently
  // via the "Show selector" button, not by following the prop.
  // svelte-ignore state_referenced_locally
  let expanded = $state(startExpanded);
  const removeGate = createConfirmGate();
  const previewClearFlash = createFlashTimer(() => (previewValue = null));

  const builtinOptions = Object.entries(BUILTIN_GENERATOR_LABELS) as [BuiltinGeneratorId, string][];
  const builtinSelectOptions: SearchableSelectOption[] = builtinOptions.map(([id, label]) => ({ value: id, label }));

  const customGeneratorOptions = $derived<SearchableSelectOption[]>([
    ...(customGenerators.length === 0 ? [{ value: '', label: 'No custom generators yet' }] : []),
    ...customGenerators.map((generator) => ({ value: generator.id, label: generator.name })),
    { value: NEW_GENERATOR_VALUE, label: '+ New generator…' },
  ]);

  const fileTemplateOptions = $derived<SearchableSelectOption[]>([
    ...(fileTemplates.length === 0 ? [{ value: '', label: 'No templates yet' }] : []),
    ...fileTemplates.map((template) => ({ value: template.id, label: template.name })),
    { value: NEW_TEMPLATE_VALUE, label: '+ New template…' },
  ]);

  const selectedCustomGeneratorFields = $derived.by(() => {
    // Narrowed into a local first — `field` is a reactive prop, so TS can't
    // carry the `kind === 'custom'` narrowing through a closure that reads
    // `field.generator` again inside it.
    const generator = field.generator;
    if (generator.kind !== 'custom') return [];
    return customGenerators.find((entry) => entry.id === generator.generatorId)?.optionsSchema ?? [];
  });

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

  function setFileTemplateId(value: string): void {
    if (value === NEW_TEMPLATE_VALUE) {
      onCreateFileTemplate();
      return;
    }
    onChange({ ...field, generator: { kind: 'file', templateId: value } });
  }

  function setBuiltinId(id: BuiltinGeneratorId): void {
    onChange({ ...field, generator: { kind: 'builtin', id } });
  }

  function setBuiltinOptions(patch: Record<string, unknown>): void {
    if (field.generator.kind !== 'builtin') return;
    onChange({ ...field, generator: { ...field.generator, options: { ...field.generator.options, ...patch } } });
  }

  function setCustomOptions(patch: Record<string, unknown>): void {
    if (field.generator.kind !== 'custom') return;
    onChange({ ...field, generator: { ...field.generator, options: { ...field.generator.options, ...patch } } });
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

  function enableSaveAsFlowVariable(): void {
    onChange({ ...field, options: { ...field.options, saveAsFlowVariable: { key: '' } } });
  }

  function disableSaveAsFlowVariable(): void {
    const { saveAsFlowVariable: _drop, ...rest } = field.options ?? {};
    onChange({ ...field, options: Object.keys(rest).length > 0 ? rest : undefined });
  }

  function setSaveAsFlowVariableKey(key: string): void {
    onChange({ ...field, options: { ...field.options, saveAsFlowVariable: { key } } });
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
      previewClearFlash.trigger(5000);
    }
  }
</script>

<div id={`field-${field.id}`} class="rounded-xl bg-surface p-3">
  <div class="flex flex-wrap items-center gap-y-1.5 gap-x-2">
    <StepMoveButtons {canMoveUp} {canMoveDown} {onMoveUp} {onMoveDown} />

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
      onclick={() => removeGate.request(true)}
    >
      <TrashIcon size={15} weight="bold" />
    </button>
  </div>

  {#if expanded}
    <div class="mt-2.5 space-y-1.5 border-t border-hair pt-2.5">
      <p class="px-0.5 text-[10px] text-ink-3">
        Tried top to bottom until one matches. Disable ones that look unstable (e.g. a generated id).
      </p>
      <SelectorCandidateEditor selectors={field.selectors} onChange={(selectors) => onChange({ ...field, selectors })} />
    </div>
  {/if}

  <div class="mt-2.5 flex flex-wrap items-center gap-2">
    {#if field.elementType === 'file'}
      <SearchableSelect
        ariaLabel="File template"
        value={field.generator.kind === 'file' ? field.generator.templateId : ''}
        options={fileTemplateOptions}
        onChange={setFileTemplateId}
      />
      {#if field.generator.kind === 'file' && field.generator.templateId}
        {@const templateId = field.generator.templateId}
        <button
          type="button"
          class="rounded-md p-1.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1"
          title="Edit template"
          aria-label="Edit template"
          onclick={() => onEditFileTemplate(templateId)}
        >
          <PencilSimpleIcon size={14} weight="bold" />
        </button>
      {/if}
    {:else}
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
        {#if BUILTIN_GENERATOR_OPTION_FIELDS[field.generator.id]}
          <GeneratorOptionsEditor
            fields={BUILTIN_GENERATOR_OPTION_FIELDS[field.generator.id] ?? []}
            value={field.generator.options}
            onChange={setBuiltinOptions}
          />
        {/if}
      {:else if field.generator.kind === 'fixed'}
        <FlowVariableInput
          mode="template"
          keys={flowVariableKeys}
          value={String(field.generator.value)}
          onInput={setFixedValue}
          class="w-full rounded-md border border-hair bg-canvas px-2 py-1 text-xs text-ink-1 outline-none focus:border-accent-500"
          placeholder="Value, or {'{{flowVariable}}'}"
          title="A {'{{key}}'} placeholder is replaced with that flow variable's value at fill time."
        />
      {:else if field.generator.kind === 'custom'}
        <SearchableSelect
          ariaLabel="Custom generator"
          value={field.generator.generatorId}
          options={customGeneratorOptions}
          onChange={setCustomId}
        />
        {#if field.generator.generatorId}
          {@const generatorId = field.generator.generatorId}
          <button
            type="button"
            class="rounded-md p-1.5 text-ink-3 hover:bg-surface-hover hover:text-ink-1"
            title="Edit generator code"
            aria-label="Edit generator code"
            onclick={() => onFocusGenerator(generatorId)}
          >
            <PencilSimpleIcon size={14} weight="bold" />
          </button>
        {/if}
        {#if selectedCustomGeneratorFields.length > 0}
          <GeneratorOptionsEditor
            fields={selectedCustomGeneratorFields}
            value={field.generator.options}
            onChange={setCustomOptions}
          />
        {/if}
      {/if}
    {/if}
  </div>

  <div class="mt-2 flex flex-wrap items-center gap-1.5">
    {#if field.options?.saveAsFlowVariable}
      {@const publishKey = field.options.saveAsFlowVariable.key}
      <!-- One chip rather than a loose label + input: it shows what the
           field publishes *and* the form other scripts read it back as, so
           the connection between the two ends is visible in place. -->
      <span
        class="flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] {publishKey
          ? 'border-hair text-ink-2'
          : 'border-red-500/50 text-red-400'}"
        title="Other scripts in this flow can read this value back as {'{{'}{publishKey || 'key'}{'}}'}"
      >
        <FlagIcon size={10} weight="fill" class="shrink-0 text-accent-500" />
        Publishes as
        <span class="font-mono text-ink-3">&#123;&#123;</span>
        <FlowVariableInput
          mode="key"
          keys={flowVariableKeys}
          value={publishKey}
          onInput={setSaveAsFlowVariableKey}
          class="w-24 rounded-sm bg-transparent font-mono text-xs text-ink-1 outline-none"
          placeholder="key"
          ariaLabel="Flow variable key"
        />
        <span class="font-mono text-ink-3">&#125;&#125;</span>
        <button
          type="button"
          class="rounded-md p-0.5 text-ink-3 hover:bg-red-500/10 hover:text-red-400"
          title="Stop publishing this field"
          aria-label="Stop saving as flow variable"
          onclick={disableSaveAsFlowVariable}
        >
          <XIcon size={11} weight="bold" />
        </button>
      </span>
      {#if !publishKey}
        <span class="text-[11px] text-red-400">Name it, or the script can't be saved.</span>
      {/if}
    {:else}
      <button
        type="button"
        class="flex items-center gap-1 text-[11px] font-medium text-ink-3 transition hover:text-accent-500"
        title="Publish this field's value so other scripts in the same flow can use it"
        onclick={enableSaveAsFlowVariable}
      >
        <PlusIcon size={10} weight="bold" />
        Save as flow variable
      </button>
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
  open={removeGate.open}
  title="Remove this field?"
  message={`"${field.label || field.elementType}" will no longer be filled by this script.`}
  confirmLabel="Remove"
  onConfirm={() => removeGate.confirm(onRemove)}
  onCancel={removeGate.cancel}
/>
