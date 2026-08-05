<script lang="ts" module>
  import type { FlowBundlePlan } from '../lib/storage/flow-bundle-store';
  import type { FormScript } from '../lib/schema/script';

  /** One dispatch point for both shapes the dialog accepts, so the caller handles them exhaustively. */
  export type ImportPayload = { kind: 'script'; script: FormScript } | { kind: 'flow'; plan: FlowBundlePlan };
</script>

<script lang="ts">
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import UploadSimpleIcon from 'phosphor-svelte/lib/UploadSimpleIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
  import CodeEditor from './CodeEditor.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { useEscapeToClose } from '../lib/dismiss-on-outside.svelte';
  import { isFlowBundleShape, parseFlowBundle, type FlowBundle } from '../lib/schema/flow-bundle';
  import { formScriptSchema, formatValidationError } from '../lib/schema/script';
  import { planFlowBundleImport, planHasCollisions } from '../lib/storage/flow-bundle-store';

  interface Props {
    open: boolean;
    existingScripts: FormScript[];
    onImport: (payload: ImportPayload) => void | Promise<void>;
    onCancel: () => void;
  }

  let { open, existingScripts, onImport, onCancel }: Props = $props();

  let text = $state('');
  let fileInput = $state<HTMLInputElement>();

  // Set when confirmImport() finds an id collision — the collision confirm
  // dialog stays on top of this one until the user decides, so the pasted/
  // loaded text (and the option to go back and edit it) isn't lost either way.
  //
  // Anything parked in `$state` here is handed back out through
  // `$state.snapshot`: `$state` deep-proxies arrays, and Chrome serializes a
  // proxied array into `{"0": …}` on its way into `storage.local` — the
  // record then fails `safeParse` on the next read and is silently dropped.
  let pendingScript = $state<FormScript | null>(null);
  let collisionName = $state('');
  let pendingPlan = $state<FlowBundlePlan | null>(null);
  let planning = $state(false);

  type Validation =
    | { status: 'empty' }
    | { status: 'valid'; script: FormScript }
    | { status: 'validFlow'; bundle: FlowBundle }
    | { status: 'invalid'; message: string };

  const validation = $derived(validate(text));

  function validate(value: string): Validation {
    if (!value.trim()) return { status: 'empty' };
    try {
      const data = JSON.parse(value);
      // Discriminated by an explicit `kind` check rather than a zod union:
      // a union failure collapses into one `invalid_union` issue with an
      // empty path, which would replace every useful "name: Required"-style
      // message with a generic one.
      if (isFlowBundleShape(data)) return { status: 'validFlow', bundle: parseFlowBundle(data) };
      const script = formScriptSchema.parse({ ...data, id: typeof data?.id === 'string' ? data.id : crypto.randomUUID() });
      return { status: 'valid', script };
    } catch (error) {
      return { status: 'invalid', message: error instanceof SyntaxError ? `Invalid JSON: ${error.message}` : formatValidationError(error) };
    }
  }

  // The plan is computed as soon as a bundle validates, not on the Import
  // click: its warnings (a template imported under a new id, a template the
  // bundle never carried) are exactly what the user needs *before* deciding.
  // Importing then applies this same plan, so what was shown is what's written.
  let previewPlan = $state<FlowBundlePlan | null>(null);
  let planRequest = 0;

  $effect(() => {
    const current = validation;
    const token = ++planRequest;
    if (current.status !== 'validFlow') {
      previewPlan = null;
      return;
    }
    void planFlowBundleImport(current.bundle, existingScripts).then((plan) => {
      // Ignore a plan whose text has already been replaced by newer input.
      if (token === planRequest) previewPlan = plan;
    });
  });

  const bundleWarnings = $derived(previewPlan?.warnings ?? []);

  async function handleFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    text = await file.text();
    input.value = '';
  }

  async function confirmImport(): Promise<void> {
    if (validation.status === 'valid') {
      const collision = existingScripts.find((script) => script.id === validation.script.id);
      if (collision) {
        pendingScript = validation.script;
        collisionName = collision.name;
        return;
      }
      await onImport({ kind: 'script', script: validation.script });
      text = '';
      return;
    }

    if (validation.status !== 'validFlow') return;
    planning = true;
    try {
      // Normally already computed by the effect above; re-planned only if the
      // user clicked before it settled.
      const plan = previewPlan ?? (await planFlowBundleImport(validation.bundle, existingScripts));
      if (planHasCollisions(plan)) {
        pendingPlan = plan;
        return;
      }
      await onImport({ kind: 'flow', plan: $state.snapshot(plan) });
      text = '';
    } finally {
      planning = false;
    }
  }

  async function confirmReplace(): Promise<void> {
    if (pendingScript) {
      await onImport({ kind: 'script', script: $state.snapshot(pendingScript) });
      text = '';
      pendingScript = null;
      return;
    }
    if (!pendingPlan) return;
    await onImport({ kind: 'flow', plan: $state.snapshot(pendingPlan) });
    text = '';
    pendingPlan = null;
  }

  function cancelReplace(): void {
    // Revert to the pre-confirmation state: nothing is imported, and the
    // text stays in the editor so the user can inspect or edit it further.
    pendingScript = null;
    pendingPlan = null;
  }

  function cancel(): void {
    text = '';
    onCancel();
  }

  const flowCollisionMessage = $derived.by(() => {
    if (!pendingPlan) return '';
    const scriptCount = pendingPlan.collisions.scripts.length;
    const overwritten = scriptCount === 0 ? '' : ` ${scriptCount} script${scriptCount === 1 ? '' : 's'} will be overwritten: ${pendingPlan.collisions.scripts.map((script) => `"${script.name}"`).join(', ')}.`;
    return (
      `A flow named "${pendingPlan.flow.name}" already exists here.${overwritten}` +
      ' Its shared variables and generated identity are kept as they are — use "Reset flow" afterwards if you want a clean start.'
    );
  });

  // Skipped while a confirm dialog is up so Escape closes that one first
  // instead of also discarding the pasted/loaded text underneath.
  useEscapeToClose(() => open && !pendingScript && !pendingPlan, cancel);
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
    <div class="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-xl bg-surface p-5 shadow-2xl">
      <h2 class="text-sm font-semibold text-ink-1">Import script or flow</h2>
      <p class="mt-1 text-xs text-ink-3">Choose a JSON file — a single script, or a whole exported flow — or paste it below.</p>

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

      <div class="mt-2 min-h-[1.25rem] space-y-1">
        {#if validation.status === 'valid'}
          <p class="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircleIcon size={13} weight="fill" />
            Valid — "{validation.script.name}" ({validation.script.steps.length} step{validation.script.steps
              .length === 1
              ? ''
              : 's'})
          </p>
        {:else if validation.status === 'validFlow'}
          <p class="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircleIcon size={13} weight="fill" />
            Valid — flow "{validation.bundle.flow.name}" ({validation.bundle.scripts.length} script{validation.bundle.scripts.length === 1
              ? ''
              : 's'}, {validation.bundle.fileTemplates.length} file template{validation.bundle.fileTemplates.length === 1 ? '' : 's'})
          </p>
        {:else if validation.status === 'invalid'}
          <p class="flex items-center gap-1.5 text-xs text-red-400">
            <WarningCircleIcon size={13} weight="fill" />
            {validation.message}
          </p>
        {/if}
        {#each bundleWarnings as warning (warning)}
          <p class="flex items-start gap-1.5 text-xs text-amber-400">
            <WarningIcon size={13} weight="bold" class="mt-0.5 shrink-0" />
            {warning}
          </p>
        {/each}
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
          disabled={(validation.status !== 'valid' && validation.status !== 'validFlow') || planning}
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

<ConfirmDialog
  open={pendingPlan !== null}
  title="Flow already exists"
  message={flowCollisionMessage}
  confirmLabel="Replace"
  cancelLabel="Cancel"
  danger={true}
  onConfirm={confirmReplace}
  onCancel={cancelReplace}
/>
