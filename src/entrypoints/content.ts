import { fillScript } from '../lib/filler/fill-script';
import { runCustomCode } from '../lib/generators/quickjs-runner';
import type { PickedField, RuntimeMessage } from '../lib/messaging/types';
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
      const results = await fillScript(script, async (generatorId, activeScript, context) => {
        const generator = activeScript.customGenerators.find((entry) => entry.id === generatorId);
        if (!generator) throw new Error(`Custom generator "${generatorId}" not found`);
        return runCustomCode(generator.code, undefined, context);
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
