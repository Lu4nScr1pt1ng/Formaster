/**
 * Minimal inline markup for doc content: `code`, **bold**, *italic*, and
 * [label](#anchor) links. Deliberately not a general markdown parser — this
 * only ever runs against our own static `content.ts` data, never user input,
 * so a tiny hand-rolled tokenizer is enough and keeps the docs page free of
 * a markdown dependency.
 *
 * Bold and link content is parsed again rather than kept as raw text, so the
 * combinations the content actually uses — **`code` inside bold**, or a link
 * whose label names a `symbol` — render as both instead of showing their
 * backticks and asterisks literally.
 */
export type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'bold'; children: InlineToken[] }
  | { kind: 'italic'; children: InlineToken[] }
  | { kind: 'link'; children: InlineToken[]; href: string };

// Bold is listed before italic so `**x**` is never read as an empty italic
// followed by a stray `*`. Every alternative is anchored on a delimiter pair,
// so an unpaired marker is simply left as text rather than eating the rest of
// the sentence.
const TOKEN_RE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ kind: 'text', value: text.slice(lastIndex, index) });
    // Recursion terminates on its own: bold and italic content can't contain
    // `*` and a link label can't contain `]`, so none can nest inside itself,
    // and `code` is always a leaf. Two levels is the most this can ever go.
    if (match[1] !== undefined) tokens.push({ kind: 'code', value: match[1] });
    else if (match[2] !== undefined) tokens.push({ kind: 'bold', children: parseInline(match[2]) });
    else if (match[3] !== undefined) tokens.push({ kind: 'italic', children: parseInline(match[3]) });
    else tokens.push({ kind: 'link', children: parseInline(match[4]), href: match[5] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) tokens.push({ kind: 'text', value: text.slice(lastIndex) });
  return tokens;
}

/** Plain-text rendering of inline markup — used for the search index and result snippets. */
export function stripInline(text: string): string {
  return flatten(parseInline(text));
}

function flatten(tokens: InlineToken[]): string {
  return tokens.map((token) => ('children' in token ? flatten(token.children) : token.value)).join('');
}
