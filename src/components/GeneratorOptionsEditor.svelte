<script lang="ts">
  import SearchableSelect from './SearchableSelect.svelte';
  import type { GeneratorOptionField } from '../lib/generators/option-fields';

  interface Props {
    fields: GeneratorOptionField[];
    value: Record<string, unknown> | undefined;
    onChange: (patch: Record<string, unknown>) => void;
  }

  let { fields, value, onChange }: Props = $props();

  function currentValue(field: GeneratorOptionField): string | number | boolean {
    const raw = value?.[field.key];
    return raw === undefined ? field.default : (raw as string | number | boolean);
  }
</script>

{#each fields as field (field.key)}
  {#if field.type === 'boolean'}
    <label
      class="flex shrink-0 items-center gap-1.5 rounded-md border border-hair bg-canvas px-2 py-1 text-xs text-ink-2"
    >
      <input
        type="checkbox"
        class="h-3 w-3 accent-accent-500"
        checked={currentValue(field) as boolean}
        onchange={(event) => onChange({ [field.key]: (event.currentTarget as HTMLInputElement).checked })}
      />
      {field.label}
    </label>
  {:else if field.type === 'number'}
    <label class="flex shrink-0 items-center gap-1.5 text-xs text-ink-2">
      {field.label}
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        class="w-16 rounded-md border border-hair bg-canvas px-1.5 py-1 text-right text-xs text-ink-1 outline-none focus:border-accent-500"
        value={currentValue(field) as number}
        oninput={(event) => {
          const raw = (event.currentTarget as HTMLInputElement).value;
          const num = raw === '' ? field.default : Number(raw);
          onChange({ [field.key]: Number.isNaN(num) ? field.default : num });
        }}
      />
    </label>
  {:else}
    <SearchableSelect
      ariaLabel={field.label}
      value={String(currentValue(field))}
      options={field.choices}
      onChange={(chosen) => onChange({ [field.key]: chosen === '' ? undefined : chosen })}
    />
  {/if}
{/each}
