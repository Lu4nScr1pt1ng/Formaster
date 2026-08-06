<script lang="ts">
  import { onMount } from 'svelte';
  import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwiseIcon';
  import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
  import FlaskIcon from 'phosphor-svelte/lib/FlaskIcon';
  import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
  import WarningCircleIcon from 'phosphor-svelte/lib/WarningCircleIcon';
  import XCircleIcon from 'phosphor-svelte/lib/XCircleIcon';
  import PlaygroundForm from '../../components/PlaygroundForm.svelte';
  import ScriptEditor from '../../components/ScriptEditor.svelte';
  import ToastHost from '../../components/ToastHost.svelte';
  import { fillScript, type FieldValueContext, type FillResult, type FlowVariables } from '../../lib/filler/fill-script';
  import type { GeneratorRunContext } from '../../lib/generators';
  import { runCustomCode } from '../../lib/generators/quickjs-runner';
  import { initContextMenuFill } from '../../lib/picker/context-menu-fill';
  import { buildPlaygroundScript } from '../../lib/playground/seed-script';
  import { duplicateScript, formScriptSchema, formatValidationError, type FormScript } from '../../lib/schema/script';
  import { buildFlowBundle, downloadFlowBundle } from '../../lib/storage/flow-bundle-store';
  import { clearPlaygroundScriptId, getPlaygroundScriptId, setPlaygroundScriptId } from '../../lib/storage/playground-store';
  import { deleteScript, downloadScriptAsJson, getScript, saveScript } from '../../lib/storage/scripts-store';
  import { pushToast } from '../../lib/toast/toast-store.svelte';

  // Deliberately scoped to just this one seeded script — not a general
  // "pick any of your scripts" tool. Mixing in unrelated, real scripts here
  // was confusing (their fields don't match this form, so a run against them
  // does nothing useful) and this page's narrow editor pane isn't built to
  // comfortably show an arbitrary script anyway.
  let script = $state<FormScript | null>(null);
  let running = $state(false);
  let results = $state<FillResult[] | null>(null);

  onMount(() => {
    // Content scripts (content.ts) never run on chrome-extension:// pages,
    // including this one — the Playground has to wire up "Fill this field"
    // itself to get the same right-click behavior its demo form otherwise
    // couldn't have.
    const disposeContextMenuFill = initContextMenuFill();

    (async () => {
      const playgroundId = await getPlaygroundScriptId();
      const existing = playgroundId ? await getScript(playgroundId) : undefined;
      if (existing) {
        script = existing;
      } else {
        await seedExampleScript();
      }
    })();

    return disposeContextMenuFill;
  });

  async function seedExampleScript(): Promise<void> {
    const seeded = await saveScript(buildPlaygroundScript());
    await setPlaygroundScriptId(seeded.id);
    script = seeded;
  }

  // Reused by fillScript() for `kind: 'custom'` fields, exactly like the real
  // fill run (content.ts) does — except in-process, since this page (unlike
  // an arbitrary site) is already an extension page with no hostile CSP to
  // route around. ScriptEditor's own generator preview uses this same
  // direct approach.
  async function runCustomGeneratorInPage(
    code: string,
    options: Record<string, unknown> | undefined,
    context: FieldValueContext,
    generatorRunContext: GeneratorRunContext,
    flowVars: FlowVariables,
  ): Promise<string | number | boolean> {
    return runCustomCode(code, options, context, generatorRunContext, flowVars);
  }

  async function runOnForm(): Promise<void> {
    if (!script) return;
    // Reload from storage rather than using `script` directly: the embedded
    // ScriptEditor below keeps its own in-progress draft and only writes
    // back on Save, so this picks up whatever was last saved.
    const latest = await getScript(script.id);
    if (!latest) return;
    running = true;
    results = null;
    try {
      results = await fillScript(latest, runCustomGeneratorInPage);
    } finally {
      running = false;
    }
  }

  function resultLabel(result: FillResult): string {
    if (!script) return result.fieldId;
    const step = script.steps.find((entry) => entry.type === 'field' && entry.field.id === result.fieldId);
    return step && step.type === 'field' ? (step.field.label ?? step.field.elementType) : result.fieldId;
  }

  async function handleSave(updated: FormScript): Promise<FormScript> {
    const validation = formScriptSchema.safeParse(updated);
    if (!validation.success) {
      const message = formatValidationError(validation.error);
      pushToast(`Could not save: ${message}`, 'error', 6000);
      throw new Error(message);
    }
    const saved = await saveScript(validation.data);
    script = saved;
    pushToast(`"${saved.name}" saved`, 'success');
    return saved;
  }

  async function handleDelete(id: string): Promise<void> {
    const name = script?.name ?? 'Script';
    await deleteScript(id);
    await clearPlaygroundScriptId();
    script = null;
    results = null;
    pushToast(`"${name}" deleted`, 'info');
  }

  function handleExport(current: FormScript): void {
    downloadScriptAsJson(current);
    pushToast(`"${current.name}" exported`, 'success');
  }

  async function handleExportFlow(flowId: string): Promise<void> {
    try {
      const { bundle, missingTemplateIds } = await buildFlowBundle(flowId);
      downloadFlowBundle(bundle);
      pushToast(`"${bundle.flow.name}" exported (last saved state)`, 'success');
      if (missingTemplateIds.length > 0) {
        pushToast(`${missingTemplateIds.length} file template reference could not be found and was not included`, 'error', 6000);
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Could not export this flow', 'error', 6000);
    }
  }

  // A duplicate here isn't itself "the playground script", so it's saved as
  // a plain script instead of taking over this view — it'll show up in the
  // regular Scripts list, since its content (still pointed at the local
  // `formaster://playground` pattern) has nothing to fill on a real site.
  async function handleDuplicate(current: FormScript): Promise<void> {
    const copy = duplicateScript(current);
    await saveScript(copy);
    pushToast(`"${copy.name}" saved to your scripts list`, 'info');
  }

  function resetForm(): void {
    location.reload();
  }
</script>

<div class="flex h-screen flex-col bg-canvas text-ink-1">
  <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-3">
    <div class="flex min-w-0 items-center gap-2">
      <div class="relative flex h-[22px] w-[22px] shrink-0 items-center justify-center">
        <div class="absolute inset-[-6px] -z-10 rounded-full bg-accent-500/35 blur-[5px]"></div>
        <div class="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-accent-500 text-accent-ink">
          <FlaskIcon size={12} weight="bold" />
        </div>
      </div>
      <span class="shrink-0 text-[13px] font-bold tracking-tight">Playground</span>
      <span class="hidden truncate text-xs text-ink-3 sm:inline">— test this example script against a local form, no real site needed</span>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border border-hair px-2.5 py-1.5 text-xs transition hover:bg-surface-hover"
        onclick={resetForm}
      >
        <ArrowClockwiseIcon size={13} weight="bold" />
        Reset form
      </button>
      <button
        type="button"
        disabled={!script || running}
        class="flex items-center gap-1.5 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-accent-ink transition active:scale-[0.97] hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
        onclick={runOnForm}
      >
        <PlayIcon size={13} weight="bold" />
        {running ? 'Running…' : 'Run on this form'}
      </button>
    </div>
  </header>

  <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if results}
        <div class="mx-auto max-w-2xl px-3 pt-4 sm:px-6">
          <div class="space-y-1 rounded-xl border border-hair bg-surface p-3">
            <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Run results</p>
            {#each results as result (result.fieldId)}
              <div class="flex items-start gap-1.5 text-xs">
                {#if result.status === 'filled'}
                  <CheckCircleIcon size={13} weight="fill" class="mt-0.5 shrink-0 text-emerald-400" />
                {:else if result.status === 'not-found'}
                  <WarningCircleIcon size={13} weight="fill" class="mt-0.5 shrink-0 text-ink-3" />
                {:else}
                  <XCircleIcon size={13} weight="fill" class="mt-0.5 shrink-0 text-red-400" />
                {/if}
                <span class="min-w-0 break-words">
                  <span class="text-ink-1">{resultLabel(result)}</span>
                  <span class="text-ink-3">— {result.status}{result.message ? `: ${result.message}` : ''}</span>
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      <PlaygroundForm />
    </div>

    <div
      class="h-[55vh] w-full shrink-0 overflow-hidden border-t border-hair lg:h-auto lg:w-[46%] lg:min-w-[540px] lg:border-l lg:border-t-0"
    >
      {#if script}
        {#key script.id}
          <ScriptEditor
            {script}
            onSave={handleSave}
            onDelete={handleDelete}
            onExport={handleExport}
            onExportFlow={handleExportFlow}
            onDuplicate={handleDuplicate}
            showAddFieldsFromPage={false}
          />
        {/key}
      {:else}
        <div class="flex h-full flex-col items-center justify-center gap-3 text-sm text-ink-3">
          <p>No example script yet.</p>
          <button
            type="button"
            class="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-600"
            onclick={seedExampleScript}
          >
            Recreate example script
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<ToastHost />
