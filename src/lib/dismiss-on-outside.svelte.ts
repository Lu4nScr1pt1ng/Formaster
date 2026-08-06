/**
 * Escape is handled as a **stack**: only the innermost open thing reacts.
 *
 * Every consumer used to bind its own window-level capture listener, so an
 * Escape with a suggestion popup open inside the File Template modal fired
 * both — dismissing the popup and closing the whole modal underneath it.
 * Registering into one ordered list instead means the most recently opened
 * layer wins and the ones below it never see the key.
 */
const escapeLayers: Array<() => void> = [];

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  const innermost = escapeLayers[escapeLayers.length - 1];
  if (!innermost) return;
  event.preventDefault();
  event.stopPropagation();
  innermost();
}

function setListening(shouldListen: boolean): void {
  // Capture phase and window-level so it fires regardless of what has focus,
  // including inside CodeMirror, which binds its own keymap and would
  // otherwise swallow the key before a bubble-phase listener saw it.
  if (shouldListen) window.addEventListener('keydown', handleEscape, true);
  else window.removeEventListener('keydown', handleEscape, true);
}

/** Calls `onEscape` on Escape while `active()` is true and no newer layer is open above this one. */
export function useEscapeToClose(active: () => boolean, onEscape: () => void): void {
  $effect(() => {
    if (!active()) return;
    const layer = () => onEscape();
    escapeLayers.push(layer);
    if (escapeLayers.length === 1) setListening(true);

    return () => {
      const index = escapeLayers.lastIndexOf(layer);
      if (index !== -1) escapeLayers.splice(index, 1);
      if (escapeLayers.length === 0) setListening(false);
    };
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
