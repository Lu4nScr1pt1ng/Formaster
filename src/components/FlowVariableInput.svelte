<script lang="ts">
  import { useDismissOnOutside, useEscapeToClose } from '../lib/dismiss-on-outside.svelte';

  /**
   * A text input that suggests flow-variable keys.
   *
   * Two shapes, because the app has two kinds of field:
   * - `key` — the whole value *is* a key ("Save as flow variable", a
   *   template layer bound to one variable). Picking replaces everything.
   * - `template` — free text that may splice keys in with `{{…}}` (a fixed
   *   value, a literal layer, an output filename). Typing `{{` opens the
   *   list; picking completes just that placeholder and leaves the rest of
   *   the text alone.
   *
   * Deliberately a real `<input>` rather than a custom editable: existing
   * tests (and users) rely on `placeholder`, and `.fill()` must behave.
   */
  interface Props {
    value: string;
    onInput: (value: string) => void;
    /** Already deduped and sorted by the caller. */
    keys: string[];
    mode: 'key' | 'template';
    placeholder?: string;
    ariaLabel?: string;
    title?: string;
    class?: string;
    /** Layout for the positioning wrapper — callers inside a flex row usually need `min-w-0 flex-1`. */
    wrapperClass?: string;
    id?: string;
  }

  let { value, onInput, keys, mode, placeholder, ariaLabel, title, class: className = '', wrapperClass = '', id }: Props = $props();

  const listboxId = `flow-var-list-${crypto.randomUUID()}`;
  let root = $state<HTMLDivElement>();
  let input = $state<HTMLInputElement>();
  let open = $state(false);
  let activeIndex = $state(0);
  /** Where the `{{` that opened the list starts, in template mode. */
  let triggerIndex = $state(-1);
  let query = $state('');

  const matches = $derived(
    keys.filter((key) => key.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8),
  );

  /**
   * Finds the `{{` the caret is currently inside, if any. Scanning backwards
   * and stopping at a `}}` is what makes a *complete* placeholder not
   * re-trigger — so `.fill('Name: {{key}}')` leaves the list closed.
   */
  function findOpenPlaceholder(text: string, caret: number): { start: number; query: string } | null {
    const before = text.slice(0, caret);
    const start = before.lastIndexOf('{{');
    if (start === -1) return null;
    if (before.indexOf('}}', start) !== -1) return null;
    return { start, query: before.slice(start + 2) };
  }

  function refresh(): void {
    if (!input) return;
    if (mode === 'key') {
      query = input.value;
      triggerIndex = -1;
      open = keys.length > 0;
    } else {
      const found = findOpenPlaceholder(input.value, input.selectionStart ?? input.value.length);
      triggerIndex = found?.start ?? -1;
      query = found?.query ?? '';
      open = found !== null && keys.length > 0;
    }
    activeIndex = 0;
  }

  function choose(key: string): void {
    if (!input) return;
    if (mode === 'key') {
      onInput(key);
      open = false;
      return;
    }
    const caret = input.selectionStart ?? input.value.length;
    const after = input.value.slice(caret);
    // Don't add a second `}}` when the caret already sits inside a pair.
    const closing = after.startsWith('}}') ? '' : '}}';
    const next = `${input.value.slice(0, triggerIndex)}{{${key}${closing}${after}`;
    const caretAfter = triggerIndex + `{{${key}}}`.length;
    onInput(next);
    open = false;
    // The value round-trips through the parent, so restore the caret once
    // the new value has landed.
    requestAnimationFrame(() => input?.setSelectionRange(caretAfter, caretAfter));
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open || matches.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % matches.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + matches.length) % matches.length;
    } else if (event.key === 'Enter') {
      // Only swallowed while the list is open, so Ctrl/Cmd-S and ordinary
      // form behaviour still reach the editor the rest of the time.
      event.preventDefault();
      choose(matches[activeIndex]);
    }
  }

  useEscapeToClose(
    () => open,
    () => (open = false),
  );
  useDismissOnOutside(
    () => open,
    () => root,
    () => (open = false),
  );
</script>

<div class="relative {wrapperClass}" bind:this={root}>
  <input
    bind:this={input}
    {id}
    {placeholder}
    {title}
    class={className}
    value={value}
    role="combobox"
    aria-expanded={open}
    aria-controls={listboxId}
    aria-autocomplete="list"
    aria-label={ariaLabel}
    autocomplete="off"
    oninput={(event) => {
      onInput((event.currentTarget as HTMLInputElement).value);
      refresh();
    }}
    onfocus={refresh}
    onclick={refresh}
    onkeyup={(event) => {
      // Arrow keys move the caret in and out of a placeholder without
      // changing the text, so re-evaluate on those too.
      if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') refresh();
    }}
    onkeydown={handleKeydown}
  />

  {#if open && matches.length > 0}
    <div
      id={listboxId}
      role="listbox"
      aria-label="Flow variables"
      class="absolute left-0 top-full z-30 mt-1 max-h-44 min-w-[8rem] overflow-y-auto rounded-lg border border-hair bg-surface p-1 shadow-2xl"
    >
      {#each matches as key, index (key)}
        <button
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          class="flex w-full items-center rounded-md px-2 py-1 text-left font-mono text-xs transition {index === activeIndex
            ? 'bg-accent-500/13 text-accent-500'
            : 'text-ink-2 hover:bg-surface-hover hover:text-ink-1'}"
          onmouseenter={() => (activeIndex = index)}
          onmousedown={(event) => {
            // `mousedown`, not `click`: clicking would blur the input first
            // and the caret position we need would already be gone.
            event.preventDefault();
            choose(key);
          }}
        >
          {key}
        </button>
      {/each}
    </div>
  {/if}
</div>
