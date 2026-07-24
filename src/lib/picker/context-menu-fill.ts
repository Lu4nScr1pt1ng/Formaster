import { browser } from 'wxt/browser';
import { applyValue } from '../filler/fill-script';
import { runBuiltinGenerator } from '../generators';
import type { RuntimeMessage } from '../messaging/types';
import { detectElementType } from './detect-element-type';
import { detectGeneratorForElement } from './detect-generator';
import { showQuickToast } from './quick-toast';

/**
 * Wires up the right-click "Fill this field" context-menu action: tracks
 * which element was last right-clicked (the background's `onClicked`
 * handler only gets a tab id, never a DOM reference, so this has to live in
 * the same realm the element does) and fills it when the click message
 * arrives.
 *
 * Called from both `content.ts` (every ordinary page) and the Playground's
 * own page (`src/entrypoints/playground/App.svelte`) — content scripts
 * never run on `chrome-extension://` pages, including the extension's own,
 * so the Playground has to wire this up itself to get the same feature on
 * its demo form. Returns a cleanup function for callers (like Svelte's
 * `onMount`) that need to unregister listeners on teardown; content.ts, a
 * script that lives for the page's whole lifetime anyway, just ignores it.
 */
export function initContextMenuFill(): () => void {
  let lastTarget: Element | null = null;
  const handleContextMenu = (event: Event): void => {
    lastTarget = event.target as Element;
  };
  document.addEventListener('contextmenu', handleContextMenu, true);

  const handleMessage = (message: RuntimeMessage): void => {
    if (message.type === 'contextmenu/no-script-found') {
      showQuickToast(lastTarget ?? document.body, 'No script for this page', 'neutral');
      return;
    }
    if (message.type !== 'contextmenu/fill-field') return;
    const target = lastTarget;
    if (!target) return;

    const detected = detectGeneratorForElement(target);
    if (!detected) {
      showQuickToast(target, 'Input type not identified', 'neutral');
      return;
    }

    const value = runBuiltinGenerator(detected.id, detected.options, {});
    void applyValue(target, { elementType: detectElementType(target) }, value);
    showQuickToast(target, String(value), 'success');
  };
  browser.runtime.onMessage.addListener(handleMessage);

  return () => {
    document.removeEventListener('contextmenu', handleContextMenu, true);
    browser.runtime.onMessage.removeListener(handleMessage);
  };
}
