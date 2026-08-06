<script lang="ts">
  import { parseInline, type InlineToken } from '../../lib/docs/inline';

  interface Props {
    text: string;
  }

  let { text }: Props = $props();

  const tokens = $derived(parseInline(text));
</script>

<!-- A recursive snippet rather than a self-importing component: bold and link
     tokens carry parsed children (see `inline.ts`), so **`code` inside bold**
     renders as both instead of showing its backticks. Tag boundaries are kept
     tight against the text on purpose — a newline between them would render
     as a stray space mid-sentence. -->
{#snippet render(list: InlineToken[])}
  {#each list as token, index (index)}
    {#if token.kind === 'text'}{token.value}{:else if token.kind === 'code'}<code
        class="rounded bg-white/8 px-1 py-0.5 font-mono text-[0.9em] text-ink-1">{token.value}</code
      >{:else if token.kind === 'bold'}<strong class="font-semibold text-ink-1">{@render render(token.children)}</strong
      >{:else if token.kind === 'italic'}<em class="italic">{@render render(token.children)}</em
      >{:else}<a href={token.href} class="text-accent-500 underline decoration-accent-500/40 underline-offset-2 hover:text-accent-400"
        >{@render render(token.children)}</a
      >{/if}
  {/each}
{/snippet}

{@render render(tokens)}
