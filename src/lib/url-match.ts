/**
 * Minimal implementation of the WebExtension match-pattern syntax
 * (scheme://host/path, "*" wildcards) so scripts can be matched against a
 * tab URL at runtime — this is separate from `content_scripts.matches` in
 * the manifest, which only handles static injection.
 */
function patternToRegExp(pattern: string): RegExp {
  if (pattern === '<all_urls>') {
    return /^(https?|file|ftp):\/\/.*$/;
  }

  // file: URLs have no host component ("file:///path", not "file://host/path").
  const fileMatch = pattern.match(/^file:\/\/(\/.*)$/);
  if (fileMatch) {
    const pathPart = escapeRegExp(fileMatch[1]).replace(/\\\*/g, '.*');
    return new RegExp(`^file:\\/\\/${pathPart}$`);
  }

  const match = pattern.match(/^(\*|https?|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/);
  if (!match) {
    throw new Error(`Invalid match pattern: ${pattern}`);
  }
  const [, scheme, host, path] = match;

  const schemePart = scheme === '*' ? '(https?)' : scheme;
  let hostPart: string;
  if (host === '*') {
    hostPart = '[^/]*';
  } else if (host.startsWith('*.')) {
    hostPart = `(?:[^/]*\\.)?${escapeRegExp(host.slice(2))}`;
  } else {
    hostPart = escapeRegExp(host);
  }
  const pathPart = escapeRegExp(path).replace(/\\\*/g, '.*');

  return new RegExp(`^${schemePart}:\\/\\/${hostPart}${pathPart}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesPattern(url: string, pattern: string): boolean {
  try {
    return patternToRegExp(pattern).test(url);
  } catch {
    return false;
  }
}

export function matchesAnyPattern(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(url, pattern));
}

/**
 * Best-effort conversion of a match pattern into a real, navigable URL, for
 * opening a tab when no matching tab is already open. Returns null for
 * patterns too broad to guess a sensible destination from (`<all_urls>`,
 * wildcard host).
 */
export function patternToNavigableUrl(pattern: string): string | null {
  if (pattern === '<all_urls>') return null;

  const fileMatch = pattern.match(/^file:\/\/(\/[^*]*)/);
  if (fileMatch) return `file://${fileMatch[1]}`;

  const match = pattern.match(/^(\*|https?|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/);
  if (!match) return null;
  const [, scheme, host] = match;
  if (host === '*') return null;

  const resolvedScheme = scheme === '*' ? 'https' : scheme;
  const resolvedHost = host.startsWith('*.') ? host.slice(2) : host;
  return `${resolvedScheme}://${resolvedHost}/`;
}
