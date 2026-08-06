<script lang="ts">
  import PencilSimpleIcon from 'phosphor-svelte/lib/PencilSimpleIcon';
  import SlidersHorizontalIcon from 'phosphor-svelte/lib/SlidersHorizontalIcon';
  import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
  import CodeEditor, { type MemberCompletion } from './CodeEditor.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { createConfirmGate } from '../lib/confirm-gate.svelte';
  import type { CustomGenerator } from '../lib/schema/script';

  interface Props {
    /** A live $state proxy element from `draft.customGenerators` — mutated directly (name/code), same as every other field in this array. */
    generator: CustomGenerator;
    expanded: boolean;
    optionsError: string | null;
    onToggleOptions: () => void;
    onSetOptionsSchemaText: (text: string) => void;
    onRemove: () => void;
    /** What's in scope for generator code — `helpers`/`fields`/`flowVars`, from the script around this card. */
    memberCompletions?: Record<string, MemberCompletion[]>;
    /**
     * Namespaces this card's DOM id. The File Template editor renders the
     * same script's generators inside its modal while the script editor's own
     * copies are still mounted behind it — without this they'd collide, and
     * "scroll to this generator" would land on the one nobody can see.
     */
    idPrefix?: string;
  }

  let {
    generator,
    expanded,
    optionsError,
    onToggleOptions,
    onSetOptionsSchemaText,
    onRemove,
    memberCompletions,
    idPrefix = 'generator',
  }: Props = $props();

  const removeGate = createConfirmGate();

  // `options` is the one scope object that's specific to this generator, so
  // it's built here from its own declared knobs rather than passed in.
  const completions = $derived({
    ...memberCompletions,
    options: generator.optionsSchema.map((option) => ({ label: option.key, detail: option.label })),
  });
</script>

<div id={`${idPrefix}-${generator.id}`} class="rounded-xl bg-surface p-3">
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
      onclick={() => removeGate.request(true)}
    >
      <TrashIcon size={13} weight="bold" />
    </button>
  </div>
  <p class="mb-1.5 text-[11px] text-ink-3">
    Function body — <code class="font-mono text-ink-2">helpers</code>, <code class="font-mono text-ink-2">options</code>,
    <code class="font-mono text-ink-2">fields</code> are in scope, <code class="font-mono text-ink-2">return</code> a
    string/number/boolean. E.g. <code class="font-mono text-ink-2">return helpers.cpf();</code> or
    <code class="font-mono text-ink-2">return fields.firstName + "@example.com";</code>
    <code class="font-mono text-ink-2">fields</code> keys are each earlier field's <strong class="text-ink-2">label</strong>
    camelCased — "Senha" → <code class="font-mono text-ink-2">fields.senha</code>.
  </p>
  <CodeEditor
    value={generator.code}
    language="javascript"
    onChange={(value) => (generator.code = value)}
    minHeight="5rem"
    memberCompletions={completions}
  />

  <button
    type="button"
    class="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-3 transition hover:text-accent-500"
    onclick={onToggleOptions}
  >
    <SlidersHorizontalIcon size={11} weight="bold" />
    Options schema
    {generator.optionsSchema.length > 0 ? `(${generator.optionsSchema.length})` : ''}
  </button>
  {#if expanded}
    <div class="mt-1.5">
      <p class="mb-1.5 text-[11px] text-ink-3">
        JSON list of knobs this generator exposes on <code class="font-mono text-ink-2">options.*</code> — each field using
        it gets a matching control. E.g. <code class="font-mono text-ink-2"
          >[&#123;"key":"length","type":"number","label":"Length","default":16&#125;]</code
        >.
      </p>
      <CodeEditor
        value={JSON.stringify(generator.optionsSchema, null, 2)}
        language="json"
        onChange={onSetOptionsSchemaText}
        minHeight="3rem"
      />
      {#if optionsError}
        <p class="mt-1 text-[11px] text-red-400">{optionsError}</p>
      {/if}
    </div>
  {/if}
</div>

<ConfirmDialog
  open={removeGate.open}
  title="Delete this generator?"
  message={`Fields using "${generator.name}" will fall back to an empty fixed value.`}
  onConfirm={() => removeGate.confirm(onRemove)}
  onCancel={removeGate.cancel}
/>
