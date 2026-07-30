<script lang="ts">
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import CodeEditor from './CodeEditor.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { useEscapeToClose } from '../lib/dismiss-on-outside.svelte';
  import { formScriptSchema, formatValidationError, type FormScript } from '../lib/schema/script';

  interface Props {
    open: boolean;
    existingScripts: FormScript[];
    onImport: (script: FormScript) => void;
    onCancel: () => void;
  }

  let { open, existingScripts, onImport, onCancel }: Props = $props();

  let text = $state('');
  let fileInput = $state<HTMLInputElement>();

  // Set when confirmImport() finds an id collision — the collision confirm
  // dialog stays on top of this one until the user decides, so the pasted/
  // loaded text (and the option to go back and edit it) isn't lost either way.
  let pendingScript = $state<FormScript | null>(null);
  let collisionName = $state('');

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
    const collision = existingScripts.find((script) => script.id === validation.script.id);
    if (collision) {
      pendingScript = validation.script;
      collisionName = collision.name;
      return;
    }
    onImport(validation.script);
    text = '';
  }

  function confirmReplace(): void {
    if (!pendingScript) return;
    onImport(pendingScript);
    text = '';
    pendingScript = null;
  }

  function cancelReplace(): void {
    // Revert to the pre-confirmation state: nothing is imported, and the
    // text stays in the editor so the user can inspect or edit it further.
    pendingScript = null;
  }

  function cancel(): void {
    text = '';
    onCancel();
  }

  // Skipped while the collision confirm dialog is up so Escape closes that
  // one first instead of also discarding the pasted/loaded text underneath.
  useEscapeToClose(() => open && !pendingScript, cancel);
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
    <div class="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-xl bg-surface p-5 shadow-2xl">
      <h2 class="text-sm font-semibold text-ink-1">Import script</h2>
      <p class="mt-1 text-xs text-ink-3">Choose a JSON file, or paste script code directly below.</p>

      <div class="mt-3 flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-hair px-3 py-1.5 text-xs font-medium text-ink-1 transition active:scale-[0.97] hover:bg-surface-hover"
          onclick={() => fileInput?.click()}
        >
          <UploadSimpleIcon size={13} weight="bold" />
          Choose file…
        </button>
        <input bind:this={fileInput} type="file" accept="application/json" class="hidden" onchange={handleFile} />
        <span class="text-xs text-ink-3">or paste JSON in the editor below</span>
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
          class="rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-1 transition active:scale-[0.97] hover:bg-surface-hover"
          onclick={cancel}
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-accent-500 px-4 py-1.5 text-sm font-semibold text-accent-ink transition active:scale-[0.97] hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={validation.status !== 'valid'}
          onclick={confirmImport}
        >
          Import
        </button>
      </div>
    </div>
  </div>
{/if}

<ConfirmDialog
  open={pendingScript !== null}
  title="Script ID already exists"
  message={`A script named "${collisionName}" already uses this ID. Replacing it will overwrite "${collisionName}" with the imported script. Replace it?`}
  confirmLabel="Replace"
  cancelLabel="Cancel"
  danger={true}
  onConfirm={confirmReplace}
  onCancel={cancelReplace}
/>
