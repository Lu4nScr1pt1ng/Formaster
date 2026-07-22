import type { FillFieldResult, PickedField, RuntimeMessage } from '../lib/messaging/types';
import { setDraft } from '../lib/storage/draft-store';
import { clearPendingPickerScriptId, getPendingPickerScriptId, setPendingPickerScriptId } from '../lib/storage/pending-picker-store';
import { getScript, saveScript } from '../lib/storage/scripts-store';
import { matchesAnyPattern, patternToNavigableUrl } from '../lib/url-match';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    if (message.type === 'picker/finished') {
      void handlePickerFinished(message.pageUrl, message.fields);
    } else if (message.type === 'picker/start-for-script') {
      void handleStartForScript(message.scriptId, message.urlPatterns);
    } else if (message.type === 'fill/result') {
      void flashResultBadge(sender.tab?.id, message.results);
    }
  });

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

  async function handlePickerFinished(pageUrl: string, fields: PickedField[]): Promise<void> {
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
    await browser.action.setBadgeBackgroundColor({ tabId, color: '#10b981' });
    setTimeout(() => {
      browser.action.setBadgeText({ tabId, text: '' });
    }, 3000);
  }
});
