/**
 * Shared "save this object as a .json file" mechanics, used by both the
 * single-script export and the whole-Flow export. Lives outside
 * `src/lib/storage/` on purpose: triggering a download is a DOM concern, and
 * the storage modules have no other reason to touch `document`.
 */

/** Filename-safe lowercase slug, falling back when a name is empty or all punctuation. */
export function slugify(name: string, fallback: string): string {
  return name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || fallback;
}

export function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
