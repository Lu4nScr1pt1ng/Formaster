import { extractFlowVariableKeys, flowVariableMissingMessage, interpolateFlowVariables } from '../../flow-variables';
import type { CustomGenerator } from '../../schema/script';
import type { TextSource } from '../../schema/file-template';
import { runBuiltinGenerator, type GeneratorRunContext } from '../index';

/**
 * Everything a text layer might need to become a string.
 *
 * Passed in rather than read from storage, because resolution no longer
 * happens inside the renderers: a `custom` layer needs QuickJS (background
 * only) while a PNG needs a real canvas (content script only), so nothing
 * could satisfy both. The filler resolves first and hands the renderer
 * finished strings — see `resolve-template-texts.ts`.
 */
export interface TextResolutionDeps {
  /** Named flow variables published so far in this run. */
  flowVars: Record<string, string>;
  /** The run's correlated identity, so a generated name matches the fields filled around it. Scoped to one fill, never persisted. */
  runContext: GeneratorRunContext;
  /** The running script's generators — a `custom` layer names one of these, the same list its fields pick from. */
  customGenerators: CustomGenerator[];
  /**
   * Runs generator code wherever QuickJS is available (the background, in a
   * real fill). The caller closes over the rest of a generator's scope
   * (`fields`, `flowVars`, the run context), so those aren't listed here.
   */
  runCustom: (code: string, options: Record<string, unknown> | undefined) => Promise<string | number | boolean>;
}

/** Resolves one layer's source. Throws rather than returning empty text — a document with a blank name is worse than a visible failure. */
export async function resolveTextSource(source: TextSource, deps: TextResolutionDeps): Promise<string> {
  switch (source.kind) {
    case 'literal':
      // A literal may still splice variables in — the only way to get more
      // than one value onto a single line.
      return interpolate(source.value, deps.flowVars);
    case 'flowVariable': {
      const value = deps.flowVars[source.key];
      if (value === undefined) throw new Error(flowVariableMissingMessage(source.key));
      return value;
    }
    case 'builtin':
      return String(runBuiltinGenerator(source.id, source.options, deps.runContext));
    case 'custom': {
      const generator = deps.customGenerators.find((entry) => entry.id === source.generatorId);
      // A template is global but this reference isn't: it names a generator
      // on whichever script is running. Say so, because the likely cause is
      // rendering this template from a script that doesn't define it.
      if (!generator) {
        throw new Error(`This script has no custom generator "${source.generatorId}", which one of the template's text layers needs.`);
      }
      return String(await deps.runCustom(generator.code, source.options));
    }
  }
}

/** Resolves `{{key}}` placeholders — used for `outputFilename` and inside a literal layer. */
export function interpolate(text: string, flowVars: Record<string, string>): string {
  if (extractFlowVariableKeys(text).length === 0) return text;
  return interpolateFlowVariables(text, flowVars);
}
