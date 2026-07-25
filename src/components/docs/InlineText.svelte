<script lang="ts">
  import { parseInline } from '../../lib/docs/inline';

  interface Props {
    text: string;
  }

  let { text }: Props = $props();

  const tokens = $derived(parseInline(text));
</script>

{#each tokens as token, index (index)}
  {#if token.kind === 'text'}{token.value}{:else if token.kind === 'code'}<code
      class="rounded bg-white/8 px-1 py-0.5 font-mono text-[0.9em] text-ink-1">{token.value}</code
    >{:else if token.kind === 'bold'}<strong class="font-semibold text-ink-1">{token.value}</strong
    >{:else}<a href={token.href} class="text-accent-500 underline decoration-accent-500/40 underline-offset-2 hover:text-accent-400"
      >{token.value}</a
    >{/if}
{/each}
