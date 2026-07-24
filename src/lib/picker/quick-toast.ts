const HOST_ID = 'formaster-quick-toast-root';

/**
 * A single, self-dismissing badge near an element — the feedback for the
 * right-click "Fill this field" action, which has no persistent UI of its
 * own to report through (unlike the picker overlay or the popup). Own
 * shadow-DOM host, same as the picker overlay, so it can't collide with or
 * be styled by the host page.
 *
 * Kept intentionally brief for a *successful* fill — the field itself
 * already shows the generated value, so a checkmark is just a "done" pulse,
 * not something meant to be read. The "no match" cases (`neutral`) are
 * actual information the user doesn't get anywhere else, so those stay up
 * long enough to read.
 */
export function showQuickToast(anchor: Element, message: string, tone: 'success' | 'neutral' = 'success'): void {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .pill {
      position: fixed;
      background: ${tone === 'success' ? '#34d399' : '#eea63c'};
      color: #17130a;
      font: 600 12px/1.4 ui-sans-serif, system-ui, sans-serif;
      padding: 5px 10px;
      border-radius: 999px;
      box-shadow: 0 4px 14px rgba(0,0,0,.35);
      white-space: nowrap;
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0;
      transition: opacity 100ms ease;
    }
    .pill.show { opacity: 1; }
  `;
  shadow.appendChild(style);

  const pill = document.createElement('div');
  pill.className = 'pill';
  pill.textContent = tone === 'success' ? '✓' : message;
  shadow.appendChild(pill);

  // `position: fixed` pins the pill to the viewport, not to `anchor` — on
  // its own it'd stay frozen at the field's pick-time screen position while
  // the page scrolls underneath it, drifting away from the field it's
  // actually about. Re-reading the anchor's rect every frame for as long as
  // the pill is visible (same technique as the picker overlay's mapped-box
  // tracking) keeps it glued to the field instead.
  function track(): void {
    const rect = anchor.getBoundingClientRect();
    pill.style.left = `${Math.max(rect.left, 4)}px`;
    pill.style.top = `${Math.max(rect.top - 32, 4)}px`;
    if (host.isConnected) requestAnimationFrame(track);
  }
  track();

  requestAnimationFrame(() => pill.classList.add('show'));
  setTimeout(() => host.remove(), tone === 'success' ? 100 : 2200);
}
