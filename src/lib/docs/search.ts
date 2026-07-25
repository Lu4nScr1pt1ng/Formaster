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

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

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

  const scored = getIndex(sections).map((indexed) => {
    let score = 0;
    for (const term of terms) {
      if (indexed.titleLower === query.toLowerCase().trim()) score += 50;
      if (indexed.titleLower.includes(term)) score += 20;
      score += countOccurrences(indexed.bodyLower, term) * 3;
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
