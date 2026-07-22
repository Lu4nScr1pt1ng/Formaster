import type { PickedField } from '../messaging/types';
import { generateSelectorCandidates } from '../selector/generate-selector';
import { detectElementType } from './detect-element-type';

const HOST_ID = 'formaster-picker-root';

/**
 * Visual "inspector" overlay: highlights the element under the cursor and
 * reports each one clicked. Stays active across multiple picks — the caller
 * decides when picking is done (e.g. a "Finish" click or Escape), since the
 * popup that triggered it may already be closed by then.
 */
export class PickerOverlay {
  private host: HTMLDivElement | null = null;
  private highlightBox: HTMLDivElement | null = null;
  private labelBadge: HTMLDivElement | null = null;
  private counterLabel: HTMLSpanElement | null = null;
  private hoveredElement: Element | null = null;
  private active = false;
  private pickedCount = 0;

  constructor(
    private readonly onPick: (field: PickedField) => void,
    private readonly onFinish: () => void,
  ) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    this.mount();
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown, true);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener('mousemove', this.handleMouseMove, true);
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

    const style = document.createElement('style');
    style.textContent = `
      .box { position: fixed; border: 2px solid #eea63c; background: rgba(238,166,60,.15); border-radius: 4px; pointer-events: none; }
      .badge { position: fixed; background: #eea63c; color: #17130a; font: 600 11px/1.4 ui-sans-serif, system-ui, sans-serif; padding: 2px 6px; border-radius: 4px; pointer-events: none; white-space: nowrap; }
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
  }

  private unmount(): void {
    this.host?.remove();
    this.host = null;
    this.highlightBox = null;
    this.labelBadge = null;
    this.counterLabel = null;
    this.hoveredElement = null;
    this.pickedCount = 0;
  }

  private renderCounter(): void {
    if (!this.counterLabel) return;
    this.counterLabel.textContent =
      this.pickedCount === 0
        ? 'Click a field to map it · Esc to finish'
        : `${this.pickedCount} field${this.pickedCount === 1 ? '' : 's'} mapped · Esc to finish`;
  }

  private handleMouseMove = (event: MouseEvent): void => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target === this.hoveredElement || target.id === HOST_ID) return;
    this.hoveredElement = target;
    this.paintHighlight(target);
  };

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

  private handleClick = (event: MouseEvent): void => {
    // Clicks on our own toolbar (e.g. the Stop button) must not be treated as a pick.
    if (this.host && event.composedPath().includes(this.host)) return;

    const target = this.hoveredElement;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();

    const field: PickedField = {
      selectors: generateSelectorCandidates(target),
      elementType: detectElementType(target),
      label: inferLabel(target),
    };
    this.pickedCount += 1;
    this.renderCounter();
    this.onPick(field);
  };

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
