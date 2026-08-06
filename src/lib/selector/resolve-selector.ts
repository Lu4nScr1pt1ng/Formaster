import type { SelectorCandidate } from '../schema/script';

/**
 * Tries each candidate in order, returning the element the first enabled one
 * resolves to.
 *
 * "Resolves" means `querySelector` semantics — the *first* match, not a
 * uniqueness check. A candidate matching several elements therefore wins with
 * its first match rather than being skipped as ambiguous; narrowing it is the
 * author's call, made by editing or disabling the candidate.
 */
export function resolveSelectorCandidates(
  candidates: SelectorCandidate[],
  root: ParentNode = document,
): Element | null {
  for (const candidate of candidates) {
    if (candidate.enabled === false) continue;
    const element = resolveOne(candidate, root);
    if (element) return element;
  }
  return null;
}

function resolveOne(candidate: SelectorCandidate, root: ParentNode): Element | null {
  try {
    switch (candidate.strategy) {
      case 'id':
        return root.querySelector(`#${CSS.escape(candidate.value)}`);
      case 'name':
        return root.querySelector(`[name="${cssAttrEscape(candidate.value)}"]`);
      case 'data-testid':
        return root.querySelector(
          `[data-testid="${cssAttrEscape(candidate.value)}"], [data-test-id="${cssAttrEscape(candidate.value)}"], [data-test="${cssAttrEscape(candidate.value)}"]`,
        );
      case 'aria-label':
        return root.querySelector(`[aria-label="${cssAttrEscape(candidate.value)}"]`);
      case 'css':
        return root.querySelector(candidate.value);
      case 'xpath': {
        const doc = root instanceof Document ? root : root.ownerDocument;
        if (!doc) return null;
        const result = doc.evaluate(candidate.value, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue as Element | null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function cssAttrEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}
