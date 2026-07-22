import { runCustomCode } from '../lib/generators/quickjs-runner';
import type { CustomGeneratorRunResult, FillFieldResult, PickedField, RuntimeMessage } from '../lib/messaging/types';
import { setDraft } from '../lib/storage/draft-store';
import { clearPendingPickerScriptId, getPendingPickerScriptId, setPendingPickerScriptId } from '../lib/storage/pending-picker-store';
import { setReturnTabId } from '../lib/storage/return-tab-store';
import { getScript, listScripts, saveScript } from '../lib/storage/scripts-store';
import { matchesAnyPattern, patternToNavigableUrl } from '../lib/url-match';

const MATCH_BADGE_COLOR = '#eea63c';
const RESULT_BADGE_COLOR = '#10b981';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    if (message.type === 'picker/finished') {
      void handlePickerFinished(message.pageUrl, message.fields, sender.tab?.id);
    } else if (message.type === 'picker/start-for-script') {
      void handleStartForScript(message.scriptId, message.urlPatterns);
    } else if (message.type === 'fill/result') {
      void flashResultBadge(sender.tab?.id, message.results);
    } else if (message.type === 'customGenerator/run') {
      // Run in the background instead of the content script: the WASM
      // interpreter's own loading (fetch + WebAssembly.instantiate) has
      // nothing to do with the target page, but running it *inside* a page's
      // isolated world still means the page's own CSP is the ambient one —
      // some sites' strict (nonce-based) CSPs have been seen blocking it
      // there. The background service worker is never subject to any
      // website's CSP, only the extension's own, so this always works.
      //
      // `runContext` is mutated in place by runCustomCode() — sent back
      // alongside the value so the caller (a different JS realm, past the
      // structured-clone boundary) can merge the update into its own copy,
      // instead of losing it the moment this message resolves.
      const runContext = message.runContext;
      return runCustomCode(message.code, message.options, message.fields, runContext).then(
        (value): CustomGeneratorRunResult => ({ value, runContext }),
      );
    }
  });

  // Extensions can't force their popup open on navigation — only a user
  // gesture (clicking the toolbar icon) can do that, in every browser. The
  // badge count is the standard stand-in: it tells you at a glance that
  // scripts exist for the page you just landed on, without popping open a
  // window you didn't ask for.
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') void updateMatchBadge(tabId, tab.url);
  });
  browser.tabs.onActivated.addListener(({ tabId }) => {
    void browser.tabs.get(tabId).then((tab) => updateMatchBadge(tabId, tab.url));
  });

  async function updateMatchBadge(tabId: number, url: string | undefined): Promise<void> {
    if (!url) {
      await browser.action.setBadgeText({ tabId, text: '' });
      return;
    }
    const scripts = await listScripts();
    const count = scripts.filter((script) => matchesAnyPattern(url, script.urlPatterns)).length;
    await browser.action.setBadgeText({ tabId, text: count > 0 ? String(count) : '' });
    if (count > 0) await browser.action.setBadgeBackgroundColor({ tabId, color: MATCH_BADGE_COLOR });
  }

  async function handleStartForScript(scriptId: string, urlPatterns: string[]): Promise<void> {
    const allTabs = await browser.tabs.query({});
    const matchingTab = allTabs.find((tab) => tab.url && matchesAnyPattern(tab.url, urlPatterns));

    let targetTabId: number | undefined;
    if (matchingTab?.id != null) {
      targetTabId = matchingTab.id;
      await browser.tabs.update(targetTabId, { active: true });
      if (matchingTab.windowId != null) await browser.windows.update(matchingTab.windowId, { focused: true });
    } else {
      const navigableUrl = urlPatterns.map(patternToNavigableUrl).find((url) => url != null);
      if (!navigableUrl) return; // Pattern too broad to guess a URL; the user needs to open the site manually.
      const created = await browser.tabs.create({ url: navigableUrl });
      targetTabId = created.id;
      await waitForTabComplete(created.id);
    }

    if (targetTabId == null) return;
    await setPendingPickerScriptId(scriptId);
    await browser.tabs.sendMessage(targetTabId, { type: 'picker/start' } satisfies RuntimeMessage);
  }

  function waitForTabComplete(tabId: number | undefined): Promise<void> {
    if (tabId == null) return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 8000);
      function onUpdated(updatedTabId: number, info: { status?: string }) {
        if (updatedTabId === tabId && info.status === 'complete') {
          clearTimeout(timeout);
          browser.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      }
      browser.tabs.onUpdated.addListener(onUpdated);
    });
  }

  async function handlePickerFinished(pageUrl: string, fields: PickedField[], sourceTabId: number | undefined): Promise<void> {
    // Remember the page just picked from, so a "Close" click in the options
    // tab this opens/focuses can jump straight back to it.
    if (sourceTabId != null) await setReturnTabId(sourceTabId);

    const pendingScriptId = await getPendingPickerScriptId();
    if (pendingScriptId) {
      await clearPendingPickerScriptId();
      const script = await getScript(pendingScriptId);
      if (script) {
        script.steps = [
          ...script.steps,
          ...fields.map((field) => ({
            type: 'field' as const,
            field: {
              id: crypto.randomUUID(),
              label: field.label,
              selectors: field.selectors,
              elementType: field.elementType,
              generator: { kind: 'fixed' as const, value: '' },
            },
          })),
        ];
        await saveScript(script);
        await focusOrOpenOptions(pendingScriptId);
        return;
      }
    }

    await setDraft({ pageUrl, fields });
    await focusOrOpenOptions();
  }

  async function focusOrOpenOptions(scriptId?: string): Promise<void> {
    const optionsUrl = browser.runtime.getURL('/options.html');
    const openTabs = await browser.tabs.query({ url: `${optionsUrl}*` });

    if (openTabs[0]?.id != null) {
      await browser.tabs.update(openTabs[0].id, { active: true });
      if (openTabs[0].windowId != null) await browser.windows.update(openTabs[0].windowId, { focused: true });
      if (scriptId) {
        // The options page is an extension page, not a content script, so it
        // must be reached with an untargeted runtime broadcast, not tabs.sendMessage.
        await browser.runtime.sendMessage({ type: 'scripts/refresh', scriptId } satisfies RuntimeMessage);
      }
      return;
    }

    await browser.tabs.create({ url: scriptId ? `${optionsUrl}?script=${scriptId}` : optionsUrl });
  }

  async function flashResultBadge(tabId: number | undefined, results: FillFieldResult[]): Promise<void> {
    if (tabId == null) return;
    const filled = results.filter((result) => result.status === 'filled').length;
    await browser.action.setBadgeText({ tabId, text: String(filled) });
    await browser.action.setBadgeBackgroundColor({ tabId, color: RESULT_BADGE_COLOR });
    setTimeout(async () => {
      // Revert to the persistent "N scripts match this page" badge rather
      // than just blanking it — the fill-result flash is temporary, the
      // match count underneath it isn't.
      const tab = await browser.tabs.get(tabId).catch(() => undefined);
      await updateMatchBadge(tabId, tab?.url);
    }, 3000);
  }
});
