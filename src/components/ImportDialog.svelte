<script lang="ts">
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import CodeEditor from './CodeEditor.svelte';
  import { formScriptSchema, formatValidationError, type FormScript } from '../lib/schema/script';

  interface Props {
    open: boolean;
    onImport: (script: FormScript) => void;
    onCancel: () => void;
  }

  let { open, onImport, onCancel }: Props = $props();

  let text = $state('');
  let fileInput = $state<HTMLInputElement>();

  type Validation = { status: 'empty' } | { status: 'valid'; script: FormScript } | { status: 'invalid'; message: string };

  const validation = $derived(validate(text));

  function validate(value: string): Validation {
    if (!value.trim()) return { status: 'empty' };
    try {
      const data = JSON.parse(value);
      const script = formScriptSchema.parse({ ...data, id: typeof data?.id === 'string' ? data.id : crypto.randomUUID() });
      return { status: 'valid', script };
    } catch (error) {
      return { status: 'invalid', message: error instanceof SyntaxError ? `Invalid JSON: ${error.message}` : formatValidationError(error) };
    }
  }

  async function handleFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    text = await file.text();
    input.value = '';
  }

  function confirmImport(): void {
    if (validation.status !== 'valid') return;
    onImport(validation.script);
    text = '';
  }

  function cancel(): void {
    text = '';
    onCancel();
  }

  // Capture phase, and on window rather than a local element, so Escape
  // closes the dialog even while focus is inside CodeMirror (which binds
  // its own keymap and would otherwise swallow the keydown before it bubbles).
  $effect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    }
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  });
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
    <div
      class="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl"
    >
      <h2 class="text-sm font-semibold text-neutral-100">Import script</h2>
      <p class="mt-1 text-xs text-neutral-400">Choose a JSON file, or paste script code directly below.</p>

      <div class="mt-3 flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 transition active:scale-[0.97] hover:bg-neutral-900"
          onclick={() => fileInput?.click()}
        >
          <UploadSimpleIcon size={13} weight="bold" />
          Choose file…
        </button>
        <input bind:this={fileInput} type="file" accept="application/json" class="hidden" onchange={handleFile} />
        <span class="text-xs text-neutral-500">or paste JSON in the editor below</span>
      </div>

      <div class="mt-3">
        <CodeEditor value={text} language="json" onChange={(value) => (text = value)} minHeight="12rem" />
      </div>

      <div class="mt-2 min-h-[1.25rem]">
        {#if validation.status === 'valid'}
          <p class="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircleIcon size={13} weight="fill" />
            Valid — "{validation.script.name}" ({validation.script.steps.length} step{validation.script.steps
              .length === 1
              ? ''
              : 's'})
          </p>
        {:else if validation.status === 'invalid'}
          <p class="flex items-center gap-1.5 text-xs text-red-400">
            <WarningCircleIcon size={13} weight="fill" />
            {validation.message}
          </p>
        {/if}
      </div>

      <div class="mt-3 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition active:scale-[0.97] hover:bg-neutral-900"
          onclick={cancel}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-accent-600 px-4 py-1.5 text-sm font-semibold text-white transition active:scale-[0.97] hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={validation.status !== 'valid'}
          onclick={confirmImport}
        >
          Import
        </button>
      </div>
    </div>
  </div>
{/if}
