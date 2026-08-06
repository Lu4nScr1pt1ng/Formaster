<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
  import { json } from '@codemirror/lang-json';
  import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
  import { EditorState } from '@codemirror/state';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorView, basicSetup } from 'codemirror';

  /** One suggestion under an object, e.g. `cpf` under `helpers`. */
  export interface MemberCompletion {
    label: string;
    /** Shown greyed beside the name — a human label, a signature, a current value. */
    detail?: string;
  }

  interface Props {
    value: string;
    language: 'javascript' | 'json';
    onChange: (value: string) => void;
    minHeight?: string;
    maxHeight?: string;
    readOnly?: boolean;
    /**
     * `{ helpers: [...], fields: [...] }` — typing `helpers.` then offers
     * those. JavaScript only; the JSON editors pass nothing.
     */
    memberCompletions?: Record<string, MemberCompletion[]>;
  }

  let {
    value,
    language,
    onChange,
    minHeight = '8rem',
    maxHeight = '24rem',
    readOnly = false,
    memberCompletions,
  }: Props = $props();

  let container = $state<HTMLDivElement | undefined>();
  let view: EditorView | undefined;

  // The extension array is built once at mount, but the suggestions change
  // as the user edits the script (new fields, new flow variables). The
  // source below closes over this instead, so it always reads the current
  // set without needing to reconfigure the editor.
  let currentCompletions = $state<Record<string, MemberCompletion[]>>({});
  $effect(() => {
    currentCompletions = memberCompletions ?? {};
  });

  /**
   * Completes members after `<object>.`, for the handful of objects a custom
   * generator gets in scope. Registered through the language's own data
   * facet rather than a second `autocompletion()` — `basicSetup` already
   * installs one, and this way these compose with JavaScript's built-in
   * completions instead of replacing them.
   */
  function memberCompletionSource(context: CompletionContext): CompletionResult | null {
    const before = context.matchBefore(/[A-Za-z_$][\w$]*\.[\w$]*$/);
    if (!before) return null;
    const objectName = before.text.slice(0, before.text.indexOf('.'));
    const options = currentCompletions[objectName];
    if (!options || options.length === 0) return null;
    return {
      from: before.from + objectName.length + 1,
      options: options.map((option) => ({ label: option.label, detail: option.detail, type: 'property' })),
      validFor: /^[\w$]*$/,
    };
  }

  // `language` picks the CodeMirror extension once, at mount — every caller
  // passes a fixed language for the instance's whole lifetime, it's never
  // toggled on a mounted editor.
  // svelte-ignore state_referenced_locally
  const languageExtension =
    language === 'json' ? [json()] : [javascript(), javascriptLanguage.data.of({ autocomplete: memberCompletionSource })];

  onMount(() => {
    if (!container) return;
    view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          ...languageExtension,
          oneDark,
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange(update.state.doc.toString());
          }),
          EditorView.theme({
            '&': { fontSize: '12px' },
            // minHeight/maxHeight go on the scroller, not the editor root, so
            // a large pasted script scrolls *inside* the editor instead of
            // growing the whole page (or dialog) past the viewport.
            '.cm-scroller': { fontFamily: 'var(--font-mono)', minHeight, maxHeight, overflow: 'auto' },
            '.cm-content': { minHeight },
          }),
        ],
      }),
    });
  });

  onDestroy(() => view?.destroy());

  // Resync when `value` changes from outside (e.g. switching to a different
  // generator, or the live JSON <-> form sync writing a new document) —
  // guarded so we don't fight the user's own cursor while they're typing.
  $effect(() => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  });
</script>

<div bind:this={container} class="overflow-hidden rounded-lg border border-hair"></div>
