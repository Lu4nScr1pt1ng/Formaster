<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { json } from '@codemirror/lang-json';
  import { javascript } from '@codemirror/lang-javascript';
  import { EditorState } from '@codemirror/state';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { EditorView, basicSetup } from 'codemirror';

  interface Props {
    value: string;
    language: 'javascript' | 'json';
    onChange: (value: string) => void;
    minHeight?: string;
    maxHeight?: string;
    readOnly?: boolean;
  }

  let { value, language, onChange, minHeight = '8rem', maxHeight = '24rem', readOnly = false }: Props = $props();

  let container = $state<HTMLDivElement | undefined>();
  let view: EditorView | undefined;

  // `language` picks the CodeMirror extension once, at mount — every caller
  // passes a fixed language for the instance's whole lifetime, it's never
  // toggled on a mounted editor.
  // svelte-ignore state_referenced_locally
  const languageExtension = language === 'json' ? json() : javascript();

  onMount(() => {
    if (!container) return;
    view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          languageExtension,
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
