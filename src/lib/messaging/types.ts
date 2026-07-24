import type { GeneratorRunContext } from '../generators';
import type { FieldElementType, FormScript, SelectorCandidate } from '../schema/script';

/** Runtime messages passed between background, content script, popup, and options. */
export type RuntimeMessage =
  | { type: 'picker/start'; existingFields?: ExistingPickedField[] }
  | { type: 'picker/finished'; fields: PickedField[]; removedFieldIds?: string[]; pageUrl: string }
  | { type: 'picker/start-for-script'; scriptId: string; urlPatterns: string[] }
  | { type: 'fill/run'; script: FormScript }
  | { type: 'fill/result'; results: FillFieldResult[] }
  | { type: 'scripts/refresh'; scriptId: string }
  | {
      type: 'customGenerator/run';
      code: string;
      options?: Record<string, unknown>;
      fields: Record<string, string | number | boolean>;
      // Correlated-generator state (see GeneratorRunContext) accumulated so
      // far in this fill run. Structured-cloned across the message boundary,
      // so the background's response carries back whatever this call adds to
      // it — content.ts merges that back into its own copy afterwards.
      runContext: GeneratorRunContext;
    };

export interface CustomGeneratorRunResult {
  value: string | number | boolean;
  runContext: GeneratorRunContext;
}

export interface PickedField {
  selectors: SelectorCandidate[];
  elementType: FieldElementType;
  label?: string;
}

/** A script's already-saved field, sent to the picker so it can pre-mark the matching element as mapped. */
export interface ExistingPickedField {
  id: string;
  selectors: SelectorCandidate[];
}

export interface FillFieldResult {
  fieldId: string;
  status: 'filled' | 'not-found' | 'error';
  message?: string;
}
