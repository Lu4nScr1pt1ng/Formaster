<script lang="ts">
  import type { DocSection } from '../../lib/docs/content';
  import DocBlock from './DocBlock.svelte';

  interface Props {
    section: DocSection;
  }

  let { section }: Props = $props();
</script>

<section id={section.id} class="scroll-mt-6 border-b border-hair px-5 py-6 last:border-b-0 md:px-8">
  <p class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">{section.category}</p>
  <h2 class="mb-2 text-lg font-bold text-ink-1">{section.title}</h2>
  {#each section.blocks as block, index (index)}
    <DocBlock {block} />
  {/each}
</section>
