/**
 * Minimal implementation of the WebExtension match-pattern syntax
 * (scheme://host/path, "*" wildcards) so scripts can be matched against a
 * tab URL at runtime — this is separate from `content_scripts.matches` in
 * the manifest, which only handles static injection.
 *
 * Extension beyond the spec: an optional trailing `#fragment` segment is
 * matched against the URL's hash. Real match patterns can't do this (the
 * spec explicitly ignores the fragment), but hash-based SPA routers (e.g.
 * `#/checkout`) put the actual "page" identity there, so our own matcher
 * (used for auto-detection, never for manifest `content_scripts.matches`)
 * understands it.
 */
function splitFragment(pattern: string): { base: string; fragment: string | null } {
  const hashIndex = pattern.indexOf('#');
  if (hashIndex === -1) return { base: pattern, fragment: null };
  return { base: pattern.slice(0, hashIndex), fragment: pattern.slice(hashIndex) };
}

function compilePatternRegExp(pattern: string): RegExp {
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

// Scripts are re-matched against every tab-update/activation event, so the
// same handful of saved patterns get compiled over and over — cache by the
// (small, user-authored) pattern string instead of rebuilding the RegExp
// every call.
const patternRegExpCache = new Map<string, RegExp>();

function patternToRegExp(pattern: string): RegExp {
  let regex = patternRegExpCache.get(pattern);
  if (!regex) {
    regex = compilePatternRegExp(pattern);
    patternRegExpCache.set(pattern, regex);
  }
  return regex;
}

const fragmentRegExpCache = new Map<string, RegExp>();

function fragmentToRegExp(fragment: string): RegExp {
  let regex = fragmentRegExpCache.get(fragment);
  if (!regex) {
    const escaped = escapeRegExp(fragment).replace(/\\\*/g, '.*');
    regex = new RegExp(`^${escaped}`);
    fragmentRegExpCache.set(fragment, regex);
  }
  return regex;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesPattern(url: string, pattern: string): boolean {
  try {
    const { base, fragment } = splitFragment(pattern);
    if (!fragment) {
      return patternToRegExp(base).test(url);
    }
    const target = new URL(url);
    const urlWithoutHash = target.href.slice(0, target.href.length - target.hash.length);
    return patternToRegExp(base).test(urlWithoutHash) && fragmentToRegExp(fragment).test(target.hash);
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

  const { base, fragment } = splitFragment(pattern);
  const suffix = fragment ? fragment.replace(/\*+$/, '') : '';

  const fileMatch = base.match(/^file:\/\/(\/[^*]*)/);
  if (fileMatch) return `file://${fileMatch[1]}${suffix}`;

  const match = base.match(/^(\*|https?|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)(\/.*)$/);
  if (!match) return null;
  const [, scheme, host, path] = match;
  if (host === '*') return null;

  const resolvedScheme = scheme === '*' ? 'https' : scheme;
  const resolvedHost = host.startsWith('*.') ? host.slice(2) : host;
  const resolvedPath = path.replace(/\*+$/, '') || '/';
  return `${resolvedScheme}://${resolvedHost}${resolvedPath}${suffix}`;
}

/**
 * Suggests a script name + match pattern scoped to the *specific page* a
 * script was mapped from (e.g. `example.com/checkout/form.html`), not the
 * whole site — so a script for one form doesn't get offered on every other
 * page of the same domain. Falls back to the bare hostname when the path is
 * just `/`. Also captures a hash-based SPA route (`#/checkout`) when present,
 * since the pathname alone often can't tell those routes apart.
 */
export function suggestScriptTarget(pageUrl: string): { name: string; urlPattern: string } {
  try {
    const url = new URL(pageUrl);
    const routeHash = /^#!?\//.test(url.hash) ? url.hash.replace(/\?.*$/, '') + '*' : '';

    // file: URLs have no host component at all ("file:///path"), so the "*"
    // scheme wildcard (which only expands to http/https) can't be used here.
    if (url.protocol === 'file:') {
      const fileLabel = url.pathname.split('/').filter(Boolean).pop() || url.pathname;
      return { name: `${fileLabel} script`, urlPattern: `file://${url.pathname}*${routeHash}` };
    }

    const hasPath = url.pathname !== '/' && url.pathname !== '';
    const pattern = `*://${url.hostname}${hasPath ? url.pathname : '/'}*${routeHash}`;
    const label = hasPath ? `${url.hostname}${url.pathname}` : url.hostname;
    return { name: `${label} script`, urlPattern: pattern };
  } catch {
    return { name: 'New script', urlPattern: '*://*/*' };
  }
}
