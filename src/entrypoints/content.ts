import { fillScript } from '../lib/filler/fill-script';
import type { CustomGeneratorRunResult, PickedField, RuntimeMessage } from '../lib/messaging/types';
import { PickerOverlay } from '../lib/picker/overlay';
import type { FormScript } from '../lib/schema/script';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    let overlay: PickerOverlay | null = null;
    let pickedFields: PickedField[] = [];

    function startPicker(): void {
      overlay?.stop();
      pickedFields = [];
      overlay = new PickerOverlay(
        (field) => {
          pickedFields.push(field);
        },
        () => finishPicking(),
      );
      overlay.start();
    }

    function finishPicking(): void {
      overlay?.stop();
      overlay = null;
      if (pickedFields.length === 0) return;
      browser.runtime.sendMessage({
        type: 'picker/finished',
        fields: pickedFields,
        pageUrl: location.href,
      } satisfies RuntimeMessage);
      pickedFields = [];
    }

    async function runFillScript(script: FormScript) {
      const results = await fillScript(script, async (generatorId, activeScript, context, generatorRunContext) => {
        const generator = activeScript.customGenerators.find((entry) => entry.id === generatorId);
        if (!generator) throw new Error(`Custom generator "${generatorId}" not found`);
        // Delegated to the background script rather than run here: the QuickJS
        // WASM interpreter otherwise loads inside this page's isolated world,
        // where a strict (nonce-based) host CSP can still interfere with it.
        // The background service worker is never subject to any website's CSP.
        const response = (await browser.runtime.sendMessage({
          type: 'customGenerator/run',
          code: generator.code,
          fields: context,
          runContext: generatorRunContext,
        } satisfies RuntimeMessage)) as CustomGeneratorRunResult;
        // The background ran on a structured-cloned *copy* of generatorRunContext
        // (e.g. a correlated cep/city/state/neighborhood record a `helpers.*`
        // call inside the custom generator just picked) — merge it back so
        // later builtin-generator fields in this same run agree with it too.
        Object.assign(generatorRunContext, response.runContext);
        return response.value;
      });
      // Broadcast for the background's badge flash, independent of the direct reply below.
      browser.runtime.sendMessage({ type: 'fill/result', results } satisfies RuntimeMessage);
      return results;
    }

    browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
      switch (message.type) {
        case 'picker/start':
          startPicker();
          return;
        case 'fill/run':
          // Returning the promise sends the fill results back as the reply
          // to whoever called tabs.sendMessage, so the popup can show real
          // "N of M filled" feedback instead of a blind timeout.
          return runFillScript(message.script);
        default:
          return;
      }
    });
  },
});
