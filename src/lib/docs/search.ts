import type { DocBlock, DocSection } from './content';
import { stripInline } from './inline';

export interface SearchResult {
  section: DocSection;
  snippet: string;
}

interface IndexedSection {
  section: DocSection;
  titleLower: string;
  bodyLower: string;
  /** Plain text (markup stripped) kept around only to slice a snippet for display. */
  bodyPlain: string;
}

function blockText(block: DocBlock): string {
  switch (block.type) {
    case 'p':
    case 'callout':
      return stripInline(block.text);
    case 'h3':
      return block.text;
    case 'list':
      return block.items.map(stripInline).join(' ');
    case 'table':
      return [...block.headers, ...block.rows.flat()].map(stripInline).join(' ');
    case 'code':
      return block.code;
  }
}

/**
 * Built once per docs-page load, off the small static `DOC_SECTIONS` array
 * (a few dozen short sections) — a linear scan over this is sub-millisecond,
 * so there's no need for an inverted index or a search dependency here.
 */
function buildIndex(sections: DocSection[]): IndexedSection[] {
  return sections.map((section) => {
    const bodyPlain = section.blocks.map(blockText).join(' ');
    return {
      section,
      titleLower: section.title.toLowerCase(),
      bodyLower: bodyPlain.toLowerCase(),
      bodyPlain,
    };
  });
}

let cachedIndex: IndexedSection[] | null = null;
let cachedFor: DocSection[] | null = null;

function getIndex(sections: DocSection[]): IndexedSection[] {
  if (cachedFor !== sections) {
    cachedIndex = buildIndex(sections);
    cachedFor = sections;
  }
  return cachedIndex!;
}

/**
 * Occurrences of `needle` at the **start of a word**, not anywhere at all.
 *
 * A plain substring count made short words catastrophic: the letter "a"
 * matched inside every word containing one — some 3600 hits across these
 * sections, worth thousands of points — so any query holding a stopword
 * drowned out even an exact title match. Searching a section's own title
 * ("What a script is", "Previewing a value") failed to return it.
 *
 * Anchoring to word starts keeps the useful half of substring matching —
 * typing "gener" still finds "generators" — while making "a" cost about what
 * it's worth.
 */
function countWordStarts(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const preceding = index === 0 ? '' : haystack[index - 1];
    if (!/[a-z0-9]/.test(preceding)) count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * How much one term can ever earn from a body, no matter how often it appears.
 * Without a ceiling, a long section that happens to repeat a common word
 * still outranks the section actually titled after the query.
 */
const MAX_BODY_HITS_PER_TERM = 4;

function buildSnippet(bodyPlain: string, bodyLower: string, term: string): string {
  const at = term ? bodyLower.indexOf(term) : -1;
  const radius = 60;
  if (at === -1) return bodyPlain.slice(0, radius * 2).trim();
  const start = Math.max(0, at - radius);
  const end = Math.min(bodyPlain.length, at + term.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < bodyPlain.length ? '…' : '';
  return `${prefix}${bodyPlain.slice(start, end).trim()}${suffix}`;
}

export function search(sections: DocSection[], query: string, limit = 8): SearchResult[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const normalizedQuery = terms.join(' ');

  const scored = getIndex(sections).map((indexed) => {
    let score = indexed.titleLower === normalizedQuery ? 50 : 0;
    for (const term of terms) {
      if (countWordStarts(indexed.titleLower, term) > 0) score += 20;
      score += Math.min(countWordStarts(indexed.bodyLower, term), MAX_BODY_HITS_PER_TERM) * 3;
    }
    return { indexed, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ indexed }) => ({
      section: indexed.section,
      snippet: buildSnippet(indexed.bodyPlain, indexed.bodyLower, terms[0]),
    }));
}
