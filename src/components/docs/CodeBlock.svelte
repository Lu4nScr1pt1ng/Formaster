<script lang="ts">
  import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
  import CopyIcon from 'phosphor-svelte/lib/CopyIcon';

  interface Props {
    code: string;
    lang?: string;
  }

  let { code, lang = 'text' }: Props = $props();

  let copied = $state(false);

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(code);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="group relative my-2 overflow-hidden rounded-lg border border-hair bg-canvas">
  <div class="flex items-center justify-between border-b border-hair px-3 py-1">
    <span class="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{lang}</span>
    <button
      type="button"
      class="flex items-center gap-1 rounded p-1 text-[10px] text-ink-3 opacity-0 transition hover:bg-surface-hover hover:text-ink-1 group-hover:opacity-100"
      onclick={copy}
    >
      {#if copied}
        <CheckIcon size={11} weight="bold" class="text-accent-500" />
        Copied
      {:else}
        <CopyIcon size={11} weight="bold" />
        Copy
      {/if}
    </button>
  </div>
  <pre class="overflow-x-auto px-3 py-2 text-[12px] leading-relaxed text-ink-2"><code class="font-mono">{code}</code></pre>
</div>
