/**
 * Calls `onEscape` on a window-level, capture-phase Escape keydown while
 * `active()` is true. Capture + window (not a local keydown handler) so it
 * fires regardless of which element currently has focus — including inside
 * CodeMirror, which binds its own keymap and would otherwise swallow the key
 * before a local/bubble-phase listener ever saw it.
 */
export function useEscapeToClose(active: () => boolean, onEscape: () => void): void {
  $effect(() => {
    if (!active()) return;
    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
      }
    }
    window.addEventListener('keydown', handleKeydown, true);
    return () => window.removeEventListener('keydown', handleKeydown, true);
  });
}

/**
 * Calls `onOutside` when a pointer event lands outside `root()` while
 * `active()` is true — shared by every dropdown/popover that should dismiss
 * on an outside click. Defaults to `mousedown` in the capture phase so it
 * fires before the element that opened it gets its own `click` (e.g. beating
 * a trigger button's own toggle-closed handler); pass `'pointerdown'` for
 * call sites that specifically need touch taps to register as an "outside"
 * interaction too.
 */
export function useDismissOnOutside(
  active: () => boolean,
  root: () => Element | null | undefined,
  onOutside: () => void,
  eventType: 'mousedown' | 'pointerdown' = 'mousedown',
): void {
  $effect(() => {
    if (!active()) return;
    function handlePointerDown(event: Event): void {
      const el = root();
      if (el && !el.contains(event.target as Node)) onOutside();
    }
    window.addEventListener(eventType, handlePointerDown, true);
    return () => window.removeEventListener(eventType, handlePointerDown, true);
  });
}
