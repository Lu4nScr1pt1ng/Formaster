/**
 * Minimal inline markup for doc content: `code`, **bold**, and
 * [label](#anchor) links. Deliberately not a general markdown parser — this
 * only ever runs against our own static `content.ts` data, never user input,
 * so a tiny hand-rolled tokenizer is enough and keeps the docs page free of
 * a markdown dependency.
 */
export type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'link'; value: string; href: string };

const TOKEN_RE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ kind: 'text', value: text.slice(lastIndex, index) });
    if (match[1] !== undefined) tokens.push({ kind: 'code', value: match[1] });
    else if (match[2] !== undefined) tokens.push({ kind: 'bold', value: match[2] });
    else tokens.push({ kind: 'link', value: match[3], href: match[4] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) tokens.push({ kind: 'text', value: text.slice(lastIndex) });
  return tokens;
}

/** Plain-text rendering of inline markup — used for the search index and result snippets. */
export function stripInline(text: string): string {
  return parseInline(text)
    .map((token) => token.value)
    .join('');
}
