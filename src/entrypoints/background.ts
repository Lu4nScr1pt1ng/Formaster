import { focusWindowIfSupported } from '../lib/focus-window';
import { runCustomCode } from '../lib/generators/quickjs-runner';
import type {
  CustomGeneratorRunResult,
  ExistingPickedField,
  FillFieldResult,
  PickedField,
  RuntimeMessage,
} from '../lib/messaging/types';
import { generatorRefFromSuggestion } from '../lib/picker/detect-generator';
import { clearPendingPickerSession, getPendingPickerSession, setPendingPickerSession } from '../lib/storage/pending-picker-store';
import { setReturnTabId } from '../lib/storage/return-tab-store';
import { getScript, listScripts, saveScript } from '../lib/storage/scripts-store';
import { createEmptyScript, type FormScript, type ScriptStep } from '../lib/schema/script';
import { matchesAnyPattern, patternToNavigableUrl, suggestScriptTarget } from '../lib/url-match';

const MATCH_BADGE_COLOR = '#eea63c';
const RESULT_BADGE_COLOR = '#10b981';
const FILL_FIELD_MENU_ID = 'formaster-fill-field';
const RUN_SCRIPT_MENU_ID = 'formaster-run-script';

// Every genuinely fire-and-forget call below (event handlers can't await a
// response) used to just get `void`-prefixed, which silences the "unhandled
// promise" TS/lint warning but not the runtime: a real failure still surfaces
// only as a generic, contextless "Unhandled promise rejection" in the
// console. Routing them through here instead means a failure is at least
// traceable to which handler caused it.
function logAsyncError(promise: Promise<unknown>, context: string): void {
  promise.catch((error) => console.error(`formaster: ${context} failed`, error));
}

export default defineBackground(() => {
  // `onInstalled` only fires on an actual install/update/browser-update, not
  // on every service-worker wake — the right place to register context menu
  // items once. `removeAll()` first makes this idempotent regardless
  // (dev-mode extension reloads have been known to trigger it more than
  // once), instead of throwing on a duplicate id.
  // Firefox for Android has no contextMenus API at all (there's no
  // right-click to hang it off), so `browser.contextMenus` is undefined
  // there — skip registration instead of throwing on every install.
  if (browser.contextMenus) {
    browser.runtime.onInstalled.addListener(async () => {
      await browser.contextMenus.removeAll();
      // No "Formaster:" prefix on either title — the browser already groups
      // an extension's context-menu items under its own name/icon, so
      // repeating it here would just be noise.
      browser.contextMenus.create({
        id: FILL_FIELD_MENU_ID,
        title: 'Fill this field',
        contexts: ['editable'],
      });
      browser.contextMenus.create({
        id: RUN_SCRIPT_MENU_ID,
        title: 'Run script for this page',
        // Not scoped to 'editable' like the item above — running a script is a
        // whole-page action, not tied to whatever specific element was
        // right-clicked, so it should show up anywhere on the page.
        contexts: ['all'],
      });
    });

    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (tab?.id == null) return;
      if (info.menuItemId === FILL_FIELD_MENU_ID) {
        logAsyncError(
          browser.tabs.sendMessage(tab.id, { type: 'contextmenu/fill-field' } satisfies RuntimeMessage),
          'contextmenu/fill-field',
        );
      } else if (info.menuItemId === RUN_SCRIPT_MENU_ID) {
        logAsyncError(handleRunFirstMatchingScript(tab.id, tab.url), 'handleRunFirstMatchingScript');
      }
    });
  }

  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    if (message.type === 'picker/finished') {
      logAsyncError(
        handlePickerFinished(message.pageUrl, message.fields, message.removedFieldIds, sender.tab?.id),
        'handlePickerFinished',
      );
    } else if (message.type === 'picker/cancelled') {
      // A picker session ended with nothing picked or removed (e.g. Escape
      // pressed right away) — content.ts sends this instead of staying
      // silent so a pending "append to script X" marker (see
      // pending-picker-store.ts) doesn't linger and get picked up by a
      // later, unrelated picker session in the same tab.
      logAsyncError(clearPendingSessionForTab(sender.tab?.id), 'clearPendingSessionForTab');
    } else if (message.type === 'scripts/refresh') {
      invalidateScriptsCache();
    } else if (message.type === 'picker/start-for-script') {
      logAsyncError(handleStartForScript(message.scriptId, message.urlPatterns), 'handleStartForScript');
    } else if (message.type === 'fill/result') {
      logAsyncError(flashResultBadge(sender.tab?.id, message.results), 'flashResultBadge');
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
    if (changeInfo.status === 'complete') logAsyncError(updateMatchBadge(tabId, tab.url), 'updateMatchBadge');
  });
  browser.tabs.onActivated.addListener(({ tabId }) => {
    logAsyncError(
      browser.tabs.get(tabId).then((tab) => updateMatchBadge(tabId, tab.url)),
      'updateMatchBadge (onActivated)',
    );
  });

  // A picker session's "append to this script" marker is scoped to the tab it
  // was started on (see pending-picker-store.ts) — if that tab is closed
  // outright instead of the picker session ending normally, there's no other
  // signal telling us to clear it, so it would otherwise linger until a
  // completely unrelated later session on a reused tab id picked it up.
  browser.tabs.onRemoved.addListener((tabId) => {
    logAsyncError(clearPendingSessionForTab(tabId), 'clearPendingSessionForTab (onRemoved)');
  });

  async function clearPendingSessionForTab(tabId: number | undefined): Promise<void> {
    if (tabId == null) return;
    const pending = await getPendingPickerSession();
    if (pending?.tabId === tabId) await clearPendingPickerSession();
  }

  // Cached in module scope and only reset when a script is actually
  // saved/deleted (via the same `scripts/refresh` broadcast every save/delete
  // already sends, see scripts-store.ts) — without this, every single
  // tab-complete/tab-activate event across every open tab re-read the whole
  // `formaster:scripts` blob from storage and re-ran full Zod validation over
  // it just to count matches for one badge.
  let cachedScripts: FormScript[] | null = null;

  async function getCachedScripts(): Promise<FormScript[]> {
    cachedScripts ??= await listScripts();
    return cachedScripts;
  }

  function invalidateScriptsCache(): void {
    cachedScripts = null;
  }

  async function updateMatchBadge(tabId: number, url: string | undefined): Promise<void> {
    if (!url) {
      await browser.action.setBadgeText({ tabId, text: '' });
      return;
    }
    const scripts = await getCachedScripts();
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
      await focusWindowIfSupported(matchingTab.windowId);
    } else {
      const navigableUrl = urlPatterns.map(patternToNavigableUrl).find((url) => url != null);
      if (!navigableUrl) return; // Pattern too broad to guess a URL; the user needs to open the site manually.
      const created = await browser.tabs.create({ url: navigableUrl });
      targetTabId = created.id;
      await waitForTabComplete(created.id);
    }

    if (targetTabId == null) return;
    await setPendingPickerSession({ scriptId, tabId: targetTabId });
    const script = await getScript(scriptId);
    const existingFields: ExistingPickedField[] =
      script?.steps
        .filter((step) => step.type === 'field')
        .map((step) => ({ id: step.field.id, selectors: step.field.selectors })) ?? [];
    await browser.tabs.sendMessage(targetTabId, { type: 'picker/start', existingFields } satisfies RuntimeMessage);
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

  function fieldsToSteps(fields: PickedField[]): ScriptStep[] {
    return fields.map((field) => ({
      type: 'field' as const,
      field: {
        id: crypto.randomUUID(),
        label: field.label,
        selectors: field.selectors,
        elementType: field.elementType,
        generator: generatorRefFromSuggestion(field.suggestedGenerator),
      },
    }));
  }

  function buildNewScriptFromFields(pageUrl: string, fields: PickedField[]): FormScript {
    const { name, urlPattern } = suggestScriptTarget(pageUrl);
    const script = createEmptyScript(name, urlPattern);
    script.steps = fieldsToSteps(fields);
    return script;
  }

  async function handlePickerFinished(
    pageUrl: string,
    fields: PickedField[],
    removedFieldIds: string[] | undefined,
    sourceTabId: number | undefined,
  ): Promise<void> {
    // Remember the page just picked from, so a "Close" click in the options
    // tab this opens/focuses can jump straight back to it.
    if (sourceTabId != null) await setReturnTabId(sourceTabId);

    // Only trust the pending marker if it was set for *this* tab — a marker
    // left over from a different, already-abandoned session must never be
    // applied to an unrelated picker session just because nobody got around
    // to clearing it yet (see pending-picker-store.ts and the
    // `picker/cancelled` / `tabs.onRemoved` cleanup above).
    const pending = await getPendingPickerSession();
    const pendingScriptId = pending && pending.tabId === sourceTabId ? pending.scriptId : undefined;
    let script: FormScript | undefined;
    if (pendingScriptId) {
      await clearPendingPickerSession();
      script = await getScript(pendingScriptId);
      if (script) {
        const remainingSteps =
          removedFieldIds && removedFieldIds.length > 0
            ? script.steps.filter((step) => step.type !== 'field' || !removedFieldIds.includes(step.field.id))
            : script.steps;
        script.steps = [...remainingSteps, ...fieldsToSteps(fields)];
      }
      // else: the script this picker session was appending to got deleted
      // while picking — fall through and create a fresh one instead of
      // silently losing the fields the user just picked.
    }
    script ??= buildNewScriptFromFields(pageUrl, fields);

    // Always a real, saved script from here on — no more "draft" concept.
    // That used to mean stashing picked fields in storage and hoping the
    // options tab this opens would notice on its own next mount, which
    // silently did nothing when an options tab was *already* open (focusing
    // an existing tab doesn't remount it, so it never re-read the draft).
    // Saving for real up front means the already-open-tab case just works —
    // saveScript() itself broadcasts scripts/refresh (see scripts-store.ts),
    // so any open Options tab picks this up regardless of who saved it.
    await saveScript(script);
    invalidateScriptsCache();
    await focusOrOpenOptions(script.id);
  }

  async function focusOrOpenOptions(scriptId: string): Promise<void> {
    const optionsUrl = browser.runtime.getURL('/options.html');
    const openTabs = await browser.tabs.query({ url: `${optionsUrl}*` });

    if (openTabs[0]?.id != null) {
      await browser.tabs.update(openTabs[0].id, { active: true });
      await focusWindowIfSupported(openTabs[0].windowId);
      return;
    }

    await browser.tabs.create({ url: `${optionsUrl}?script=${scriptId}` });
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

  /** The "Run script for this page" context-menu action — same fill/run mechanism the popup's Run button uses. */
  async function handleRunFirstMatchingScript(tabId: number, url: string | undefined): Promise<void> {
    if (!url) return;
    const scripts = await getCachedScripts();
    const script = scripts.find((entry) => matchesAnyPattern(url, entry.urlPatterns));
    if (!script) {
      await browser.tabs.sendMessage(tabId, { type: 'contextmenu/no-script-found' } satisfies RuntimeMessage).catch(() => {});
      return;
    }
    // content.ts's own runFillScript() already broadcasts `fill/result` on
    // completion regardless of who triggered it, which is what flashes the
    // toolbar badge — no separate success feedback needed here. A tab with
    // no content script (e.g. a chrome:// page) just fails silently, same
    // as the popup's own Run button does today.
    await browser.tabs.sendMessage(tabId, { type: 'fill/run', script } satisfies RuntimeMessage).catch(() => {});
  }
});
