<script lang="ts">
  import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
  import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
  import type { DocBlock } from '../../lib/docs/content';
  import CodeBlock from './CodeBlock.svelte';
  import InlineText from './InlineText.svelte';

  interface Props {
    block: DocBlock;
  }

  let { block }: Props = $props();
</script>

{#if block.type === 'p'}
  <p class="my-2 text-[13.5px] leading-relaxed text-ink-2"><InlineText text={block.text} /></p>
{:else if block.type === 'h3'}
  <h3 id={block.id} class="mb-1.5 mt-4 scroll-mt-6 text-[13px] font-semibold text-ink-1">{block.text}</h3>
{:else if block.type === 'list'}
  {#if block.ordered}
    <ol class="my-2 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-2">
      {#each block.items as item, index (index)}
        <li><InlineText text={item} /></li>
      {/each}
    </ol>
  {:else}
    <ul class="my-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-2">
      {#each block.items as item, index (index)}
        <li><InlineText text={item} /></li>
      {/each}
    </ul>
  {/if}
{:else if block.type === 'code'}
  <CodeBlock code={block.code} lang={block.lang ?? 'text'} />
{:else if block.type === 'table'}
  <div class="my-2 overflow-x-auto rounded-lg border border-hair">
    <table class="w-full min-w-[32rem] border-collapse text-left text-[12.5px]">
      <thead>
        <tr class="border-b border-hair bg-surface">
          {#each block.headers as header, index (index)}
            <th class="px-3 py-1.5 font-semibold text-ink-1">{header}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each block.rows as row, rowIndex (rowIndex)}
          <tr class="border-b border-hair last:border-b-0 odd:bg-white/[0.015]">
            {#each row as cell, cellIndex (cellIndex)}
              <td class="px-3 py-1.5 align-top leading-relaxed text-ink-2"><InlineText text={cell} /></td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else if block.type === 'callout'}
  <div
    class="my-2.5 flex gap-2 rounded-lg border px-3 py-2 text-[13px] leading-relaxed {block.kind === 'tip'
      ? 'border-accent-500/25 bg-accent-500/8 text-ink-1'
      : 'border-red-500/25 bg-red-500/8 text-ink-1'}"
  >
    {#if block.kind === 'tip'}
      <InfoIcon size={15} weight="bold" class="mt-0.5 shrink-0 text-accent-500" />
    {:else}
      <WarningIcon size={15} weight="bold" class="mt-0.5 shrink-0 text-red-400" />
    {/if}
    <p><InlineText text={block.text} /></p>
  </div>
{/if}
