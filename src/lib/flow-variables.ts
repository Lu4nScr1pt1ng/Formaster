/**
 * The `{{key}}` placeholder syntax shared by every place a flow variable can
 * be spliced into a string: a `fixed` generator's value, and a File
 * Template's `outputFilename` (see `generators/file-generators/`). Kept as
 * pure functions over a plain record so each caller can supply values from
 * wherever it already has them — the filler passes its own live in-run map,
 * the file renderers read `flow-values-store` directly.
 */
const FLOW_VARIABLE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Every `{{key}}` referenced in `text`, in order, deduped. */
export function extractFlowVariableKeys(text: string): string[] {
  return [...new Set([...text.matchAll(FLOW_VARIABLE_PATTERN)].map((match) => match[1]))];
}

export function hasFlowVariablePlaceholder(text: string): boolean {
  // `.test()` on a /g regex advances `lastIndex` between calls, so a shared
  // module-level regex would alternate true/false on the same input.
  return extractFlowVariableKeys(text).length > 0;
}

/**
 * Replaces every `{{key}}` in `text` with its value. A key with no value
 * throws rather than substituting an empty string — a document generated
 * with a blank name (or a field silently filled with "Hello ") is the exact
 * failure this feature has to make loud, not quiet.
 */
export function interpolateFlowVariables(text: string, values: Record<string, string | undefined>): string {
  return text.replace(FLOW_VARIABLE_PATTERN, (_match, rawKey: string) => {
    const key = rawKey.trim();
    const value = values[key];
    if (value === undefined) throw new Error(flowVariableMissingMessage(key));
    return value;
  });
}

/** One wording for "this key was never published", shared by every consumer so the popup/editor/docs all show the same sentence. */
export function flowVariableMissingMessage(key: string): string {
  return `Flow variable "${key}" is not set yet — run the script that saves it first.`;
}
