<script lang="ts">
  import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
  import CaretUpIcon from 'phosphor-svelte/lib/CaretUpIcon';

  interface Props {
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
  }

  let { canMoveUp, canMoveDown, onMoveUp, onMoveDown }: Props = $props();
</script>

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
