import { browser } from 'wxt/browser';

/**
 * Firefox for Android has no `windows` API at all — calling it throws.
 * Focusing a window is a desktop-only nicety anyway (there's no
 * multi-window concept to focus on mobile), so this just skips it there
 * instead of letting the call abort whatever flow it's part of.
 */
export async function focusWindowIfSupported(windowId: number | undefined): Promise<void> {
  if (windowId == null || !browser.windows) return;
  await browser.windows.update(windowId, { focused: true }).catch(() => {});
}
