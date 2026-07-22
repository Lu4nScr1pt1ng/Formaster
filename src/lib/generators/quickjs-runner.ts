import type { InterruptHandler, QuickJSContext, QuickJSHandle, QuickJSWASMModule } from 'quickjs-emscripten-core';
import { BUILTIN_GENERATORS } from './index';

const EXECUTION_TIMEOUT_MS = 3000;

interface QuickJSHandles {
  module: QuickJSWASMModule;
  shouldInterruptAfterDeadline: (deadline: number) => InterruptHandler;
}

let loadPromise: Promise<QuickJSHandles> | null = null;

// Dynamically imported so the ~700KB WASM engine is only fetched the first
// time a script actually runs a custom generator — most page loads (no
// script, or a script with only built-in/fixed generators) never pay for it,
// instead of it being injected into every single page via the content script.
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
 * interpreted sandbox, not `eval`/`new Function`. This sidesteps MV3's CSP
 * entirely: WebAssembly compilation is governed by the `wasm-unsafe-eval`
 * directive, which is part of the *default* extension CSP on both Chrome and
 * Firefox, so no custom manifest CSP or sandboxed page is needed anywhere.
 */
export async function runCustomCode(
  code: string,
  options: Record<string, unknown> | undefined,
  fields: Record<string, string | number | boolean>,
): Promise<string | number | boolean> {
  const { module, shouldInterruptAfterDeadline } = await loadQuickJS();
  const vm = module.newContext();

  try {
    vm.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + EXECUTION_TIMEOUT_MS));

    setHelpers(vm);
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

function setHelpers(vm: QuickJSContext): void {
  const helpers = vm.newObject();
  for (const [name, fn] of Object.entries(BUILTIN_GENERATORS)) {
    const fnHandle = vm.newFunction(name, (optionsHandle?: QuickJSHandle) => {
      const generatorOptions = optionsHandle ? (vm.dump(optionsHandle) as Record<string, unknown>) : undefined;
      const value = fn(generatorOptions);
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

// Exposed for callers that want to pre-warm the WASM module (e.g. on content script init).
export function preloadQuickJS(): void {
  void loadQuickJS();
}
