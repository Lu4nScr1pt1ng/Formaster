import type { SelectorCandidate } from '../schema/script';

/**
 * Builds a cascade of selector candidates for an element, most reliable
 * first. The filler tries each in order until one resolves to a unique
 * element, so sites that change classes/positions don't break the mapping.
 */
export function generateSelectorCandidates(element: Element): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];

  const id = element.getAttribute('id');
  if (id && isStable(id)) {
    candidates.push({ strategy: 'id', value: id, enabled: true });
  }

  const name = element.getAttribute('name');
  if (name) {
    candidates.push({ strategy: 'name', value: name, enabled: true });
  }

  const testId =
    element.getAttribute('data-testid') ??
    element.getAttribute('data-test-id') ??
    element.getAttribute('data-test');
  if (testId) {
    candidates.push({ strategy: 'data-testid', value: testId, enabled: true });
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    candidates.push({ strategy: 'aria-label', value: ariaLabel, enabled: true });
  }

  candidates.push({ strategy: 'css', value: buildCssPath(element), enabled: true });
  candidates.push({ strategy: 'xpath', value: buildXPath(element), enabled: true });

  return candidates;
}

/** Heuristic: ids like "field-x7f3a" or auto-generated hashes are unstable across reloads. */
function isStable(id: string): boolean {
  const looksGenerated = /^[a-z]*[-_:]?[0-9a-f]{6,}$/i.test(id) || /^:r[0-9a-z]+:$/.test(id);
  return !looksGenerated;
}

function buildCssPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
    let selector = current.tagName.toLowerCase();
    const parentEl: Element | null = current.parentElement;

    if (parentEl) {
      const siblings = Array.from(parentEl.children).filter((el) => el.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    if (current.id && isStable(current.id)) {
      parts[0] = `${current.tagName.toLowerCase()}#${CSS.escape(current.id)}`;
      break;
    }
    current = parentEl;
  }

  return parts.join(' > ');
}

function buildXPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }

  return `/${parts.join('/')}`;
}
