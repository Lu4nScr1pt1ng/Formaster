import type { FileTemplate } from '../../schema/file-template';
import { interpolate, resolveTextSource, type TextResolutionDeps } from './resolve-text-sources';

/** Finished strings for one render — every layer's text, keyed by layer id, plus the output filename. */
export interface ResolvedTemplateTexts {
  layers: Record<string, string>;
  filename: string;
}

/**
 * Turns a template into the strings a renderer needs, before any rendering
 * starts. The single place that knows how a layer becomes text — the PNG and
 * PDF renderers then only draw.
 *
 * Everything a layer resolves against comes from `deps`, not the template:
 * the flow variables, the run's identity, and the custom generators all
 * belong to the script doing the filling, which is what lets one global
 * template render differently (and correctly) for each script that uses it.
 */
export async function resolveTemplateTexts(template: FileTemplate, deps: TextResolutionDeps): Promise<ResolvedTemplateTexts> {
  const layers: Record<string, string> = {};
  for (const layer of template.textLayers) {
    layers[layer.id] = await resolveTextSource(layer.source, deps);
  }
  return { layers, filename: interpolate(template.outputFilename, deps.flowVars) };
}
