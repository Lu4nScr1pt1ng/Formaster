import type { InterruptHandler, QuickJSContext, QuickJSHandle, QuickJSWASMModule } from 'quickjs-emscripten-core';
import { BUILTIN_GENERATORS, type GeneratorRunContext } from './index';

const EXECUTION_TIMEOUT_MS = 3000;
const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;
const MAX_STACK_SIZE_BYTES = 1024 * 1024;

interface QuickJSHandles {
  module: QuickJSWASMModule;
  shouldInterruptAfterDeadline: (deadline: number) => InterruptHandler;
}

let loadPromise: Promise<QuickJSHandles> | null = null;

// Dynamically imported so the ~700KB WASM engine is only fetched the first
// time a script actually runs a custom generator, and only once for the
// lifetime of the background service worker (shared across every tab) —
// most sessions (no script, or a script with only built-in/fixed generators)
// never pay for it at all.
function loadQuickJS(): Promise<QuickJSHandles> {
  if (!loadPromise) {
    loadPromise = Promise.all([
      import('quickjs-emscripten-core'),
      import('@jitl/quickjs-wasmfile-release-sync'),
    ]).then(([core, variant]) =>
      core.newQuickJSWASMModuleFromVariant(variant.default).then((module) => ({
        module,
        shouldInterruptAfterDeadline: core.shouldInterruptAfterDeadline,
      })),
    );
  }
  return loadPromise;
}

/**
 * Runs user-authored generator code inside a QuickJS WASM VM — a real
 * interpreted sandbox, not `eval`/`new Function`. WebAssembly compilation is
 * governed by the `wasm-unsafe-eval` directive, part of the *default*
 * extension CSP on both Chrome and Firefox, so no custom manifest CSP or
 * sandboxed page is needed.
 *
 * Only ever called from the background script (see `entrypoints/background.ts`'s
 * `customGenerator/run` handler and `entrypoints/content.ts`), never directly
 * from a content script: a content script executes inside the isolated world
 * of whatever page it's on, and some sites' strict (nonce-based) CSPs have
 * been observed interfering with loading the WASM module there. The
 * background service worker isn't part of any page and is never subject to a
 * website's CSP, only the extension's own.
 */
export async function runCustomCode(
  code: string,
  options: Record<string, unknown> | undefined,
  fields: Record<string, string | number | boolean>,
  // Mutated in place (not returned) — callers in the same JS realm (e.g. the
  // options page's live preview) just read it back afterwards; callers
  // crossing a message-passing boundary (content script -> background) need
  // to send the updated object back explicitly, since structured cloning
  // breaks the object-identity trick this otherwise relies on.
  runContext: GeneratorRunContext = {},
): Promise<string | number | boolean> {
  const { module, shouldInterruptAfterDeadline } = await loadQuickJS();
  const vm = module.newContext();

  try {
    vm.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + EXECUTION_TIMEOUT_MS));
    // The interrupt handler only bounds wall-clock time — without these, a
    // generator that allocates in a tight loop (e.g. an ever-growing array)
    // could exhaust memory before the deadline check ever fires.
    vm.runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
    vm.runtime.setMaxStackSize(MAX_STACK_SIZE_BYTES);

    setHelpers(vm, code, runContext);
    setJsonGlobal(vm, 'options', options ?? {});
    setJsonGlobal(vm, 'fields', fields);

    const wrapped = `(function (helpers, options, fields) {\n${code}\n})(helpers, options, fields)`;
    const result = vm.evalCode(wrapped);

    if (result.error) {
      const dumped = vm.dump(result.error);
      result.error.dispose();
      const message = dumped && typeof dumped === 'object' && 'message' in dumped ? String(dumped.message) : String(dumped);
      throw new Error(message);
    }

    const value = vm.dump(result.value);
    result.value.dispose();
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error('Custom generator must return a string, number, or boolean');
    }
    return value as string | number | boolean;
  } finally {
    vm.dispose();
  }
}

// Only binds the builtins the generator's own source actually references
// (a plain substring check — safe to over-match, e.g. a name mentioned only
// in a comment, but it can never under-match a real `helpers.xyz()` call,
// since that call has to spell the name out literally). A generator that
// calls one or two helpers no longer pays for marshaling all ~29 of them
// into fresh QuickJS function handles on every single invocation.
function setHelpers(vm: QuickJSContext, code: string, runContext: GeneratorRunContext): void {
  const helpers = vm.newObject();
  for (const [name, fn] of Object.entries(BUILTIN_GENERATORS)) {
    if (!code.includes(name)) continue;
    const fnHandle = vm.newFunction(name, (optionsHandle?: QuickJSHandle) => {
      const generatorOptions = optionsHandle ? (vm.dump(optionsHandle) as Record<string, unknown>) : undefined;
      const value = fn(generatorOptions, runContext);
      return marshalPrimitive(vm, value);
    });
    vm.setProp(helpers, name, fnHandle);
    fnHandle.dispose();
  }
  vm.setProp(vm.global, 'helpers', helpers);
  helpers.dispose();
}

function setJsonGlobal(vm: QuickJSContext, name: string, data: unknown): void {
  const handle = vm.unwrapResult(vm.evalCode(`(${JSON.stringify(data)})`));
  vm.setProp(vm.global, name, handle);
  handle.dispose();
}

function marshalPrimitive(vm: QuickJSContext, value: string | number | boolean): QuickJSHandle {
  if (typeof value === 'string') return vm.newString(value);
  if (typeof value === 'number') return vm.newNumber(value);
  return value ? vm.true : vm.false;
}
