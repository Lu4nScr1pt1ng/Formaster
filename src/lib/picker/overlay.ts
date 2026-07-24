import type { ExistingPickedField, PickedField } from '../messaging/types';
import { resolveSelectorCandidates } from '../selector/resolve-selector';
import { generateSelectorCandidates } from '../selector/generate-selector';
import { detectElementType } from './detect-element-type';

const HOST_ID = 'formaster-picker-root';

type MappedEntry =
  | { kind: 'new'; field: PickedField; box: HTMLDivElement }
  | { kind: 'existing'; existingId: string; box: HTMLDivElement };

/**
 * Visual "inspector" overlay: highlights the element under the cursor and
 * reports each one clicked. Stays active across multiple picks — the caller
 * decides when picking is done (e.g. a "Finish" click or Escape), since the
 * popup that triggered it may already be closed by then.
 *
 * Clicking an unmapped element maps it (persistent box + corner ✕ button);
 * clicking a mapped element again — on the element itself or its ✕ — unmaps
 * it. This also guarantees an element can never be picked twice.
 *
 * `start()` can be given the script's already-saved fields (`existingFields`,
 * used when re-opening the picker from an existing script rather than
 * starting a brand new one) — matching elements are pre-marked as mapped too,
 * so re-entering picking mode doesn't look like those fields were lost.
 */
export class PickerOverlay {
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private highlightBox: HTMLDivElement | null = null;
  private labelBadge: HTMLDivElement | null = null;
  private counterLabel: HTMLSpanElement | null = null;
  private hoveredElement: Element | null = null;
  private mappedElements = new Map<Element, MappedEntry>();
  private active = false;
  private rafId: number | null = null;
  private lastPointerX: number | null = null;
  private lastPointerY: number | null = null;

  constructor(
    private readonly onPick: (field: PickedField) => void,
    private readonly onUnpick: (field: PickedField) => void,
    private readonly onRemoveExisting: (id: string) => void,
    private readonly onFinish: () => void,
  ) {}

  start(existingFields: ExistingPickedField[] = []): void {
    if (this.active) return;
    this.active = true;
    this.mount();
    for (const existing of existingFields) {
      const element = resolveSelectorCandidates(existing.selectors);
      if (element) this.mapExistingElement(element, existing.id);
    }
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('mousedown', this.handleMouseDown, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('mousedown', this.handleMouseDown, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);
    this.unmount();
  }

  private mount(): void {
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    document.documentElement.appendChild(host);
    this.host = host;

    const shadow = host.attachShadow({ mode: 'open' });
    this.shadow = shadow;

    const style = document.createElement('style');
    style.textContent = `
      .box { position: fixed; border: 2px solid #eea63c; background: rgba(238,166,60,.15); border-radius: 4px; pointer-events: none; }
      .badge { position: fixed; background: #eea63c; color: #17130a; font: 600 11px/1.4 ui-sans-serif, system-ui, sans-serif; padding: 2px 6px; border-radius: 4px; pointer-events: none; white-space: nowrap; }
      .mapped-box { position: fixed; border: 2px solid #34d399; background: rgba(52,211,153,.14); border-radius: 4px; pointer-events: none; }
      .mapped-close { all: unset; box-sizing: border-box; position: absolute; top: -9px; right: -9px; width: 18px; height: 18px; border-radius: 50%; background: #dc2626; color: #fff; font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; cursor: pointer; pointer-events: auto; box-shadow: 0 1px 4px rgba(0,0,0,.4); }
      .mapped-close:hover { background: #ef4444; }
      .toolbar { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: #16161a; color: #f1efe9; font: 500 13px/1.4 ui-sans-serif, system-ui, sans-serif; padding: 8px 14px; border-radius: 999px; box-shadow: 0 8px 24px rgba(0,0,0,.45); pointer-events: auto; display: flex; gap: 10px; align-items: center; border: 1px solid rgba(255,255,255,.08); }
      .toolbar button { all: unset; cursor: pointer; padding: 4px 10px; border-radius: 999px; background: #eea63c; color: #17130a; font-weight: 600; }
    `;
    shadow.appendChild(style);

    const box = document.createElement('div');
    box.className = 'box';
    box.style.display = 'none';
    shadow.appendChild(box);
    this.highlightBox = box;

    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.style.display = 'none';
    shadow.appendChild(badge);
    this.labelBadge = badge;

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    const counter = document.createElement('span');
    toolbar.appendChild(counter);
    this.counterLabel = counter;
    const finishButton = document.createElement('button');
    finishButton.type = 'button';
    finishButton.textContent = 'Finish';
    finishButton.addEventListener('click', () => this.onFinish());
    toolbar.appendChild(finishButton);
    shadow.appendChild(toolbar);
    this.renderCounter();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private unmount(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.highlightBox = null;
    this.labelBadge = null;
    this.counterLabel = null;
    this.hoveredElement = null;
    this.lastPointerX = null;
    this.lastPointerY = null;
    this.mappedElements.clear();
  }

  private renderCounter(): void {
    if (!this.counterLabel) return;
    const count = this.mappedElements.size;
    this.counterLabel.textContent =
      count === 0
        ? 'Click a field to map it · Esc to finish'
        : `${count} field${count === 1 ? '' : 's'} mapped · click one (or ✕) to remove · Esc to finish`;
  }

  /**
   * Runs every frame while active: keeps mapped boxes glued to their elements
   * across scroll/resize/layout shifts, and re-derives what's under the
   * cursor from the last known pointer position — without this, scrolling
   * with the mouse stationary would leave the hover box floating in place
   * instead of following (or leaving) the element it was over.
   */
  private tick = (): void => {
    this.repositionMappedBoxes();
    this.updateHover();
    if (this.active) this.rafId = requestAnimationFrame(this.tick);
  };

  private repositionMappedBoxes(): void {
    this.mappedElements.forEach(({ box }, element) => {
      const rect = element.getBoundingClientRect();
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    });
  }

  private handleMouseMove = (event: MouseEvent): void => {
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    this.updateHover();
  };

  private updateHover(): void {
    if (this.lastPointerX === null || this.lastPointerY === null) return;
    const target = document.elementFromPoint(this.lastPointerX, this.lastPointerY);
    if (!target || target.id === HOST_ID) {
      if (this.hoveredElement !== null) {
        this.hoveredElement = null;
        this.hideHighlight();
      }
      return;
    }
    this.hoveredElement = target;
    this.paintHighlight(target);
  }

  private hideHighlight(): void {
    if (this.highlightBox) this.highlightBox.style.display = 'none';
    if (this.labelBadge) this.labelBadge.style.display = 'none';
  }

  private paintHighlight(element: Element): void {
    if (!this.highlightBox || !this.labelBadge) return;
    const rect = element.getBoundingClientRect();
    this.highlightBox.style.display = 'block';
    this.highlightBox.style.left = `${rect.left}px`;
    this.highlightBox.style.top = `${rect.top}px`;
    this.highlightBox.style.width = `${rect.width}px`;
    this.highlightBox.style.height = `${rect.height}px`;

    this.labelBadge.style.display = 'block';
    this.labelBadge.textContent = describeElement(element);
    this.labelBadge.style.left = `${rect.left}px`;
    this.labelBadge.style.top = `${Math.max(rect.top - 20, 0)}px`;
  }

  // A native <select> opens its dropdown on mousedown, before the click
  // handler below ever runs — preventDefault() there is too late to stop it.
  // Blocking mousedown itself heads that off (and incidentally also stops
  // other native pickers — date/color/file inputs — from popping open while
  // we're just trying to mark the element as mapped, not interact with it).
  private handleMouseDown = (event: MouseEvent): void => {
    if (this.host && event.composedPath().includes(this.host)) return;
    event.preventDefault();
  };

  private handleClick = (event: MouseEvent): void => {
    // Clicks on our own toolbar/mapped-box ✕ buttons must not be treated as a pick
    // (the ✕ button has its own click handler that runs in the bubble phase after this).
    if (this.host && event.composedPath().includes(this.host)) return;

    const target = this.hoveredElement;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();

    if (this.mappedElements.has(target)) {
      this.unmapElement(target);
      return;
    }

    const field: PickedField = {
      selectors: generateSelectorCandidates(target),
      elementType: detectElementType(target),
      label: inferLabel(target),
    };
    this.mapElement(target, field);
  };

  private buildMappedBox(element: Element, onRemove: () => void): HTMLDivElement {
    const box = document.createElement('div');
    box.className = 'mapped-box';
    const rect = element.getBoundingClientRect();
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'mapped-close';
    closeButton.textContent = '✕';
    closeButton.title = 'Remove this mapped field';
    closeButton.setAttribute('aria-label', 'Remove this mapped field');
    closeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onRemove();
    });
    box.appendChild(closeButton);
    return box;
  }

  private mapElement(element: Element, field: PickedField): void {
    if (!this.shadow) return;
    const box = this.buildMappedBox(element, () => this.unmapElement(element));
    this.shadow.appendChild(box);
    this.mappedElements.set(element, { kind: 'new', field, box });
    this.renderCounter();
    this.onPick(field);
  }

  private mapExistingElement(element: Element, existingId: string): void {
    if (!this.shadow) return;
    const box = this.buildMappedBox(element, () => this.unmapElement(element));
    this.shadow.appendChild(box);
    this.mappedElements.set(element, { kind: 'existing', existingId, box });
    this.renderCounter();
  }

  private unmapElement(element: Element): void {
    const entry = this.mappedElements.get(element);
    if (!entry) return;
    entry.box.remove();
    this.mappedElements.delete(element);
    this.renderCounter();
    if (entry.kind === 'new') this.onUnpick(entry.field);
    else this.onRemoveExisting(entry.existingId);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onFinish();
    }
  };
}

function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const type = element.getAttribute('type');
  return type ? `${tag}[type=${type}]` : tag;
}

function inferLabel(element: Element): string | undefined {
  const id = element.getAttribute('id');
  if (id) {
    const associated = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (associated?.textContent) return associated.textContent.trim();
  }
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) return placeholder;
  const closestLabel = element.closest('label');
  if (closestLabel?.textContent) return closestLabel.textContent.trim();
  return undefined;
}
