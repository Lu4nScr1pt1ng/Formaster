import type { FieldElementType, FormScript, SelectorCandidate } from '../schema/script';

/** Runtime messages passed between background, content script, popup, and options. */
export type RuntimeMessage =
  | { type: 'picker/start' }
  | { type: 'picker/finished'; fields: PickedField[]; pageUrl: string }
  | { type: 'picker/start-for-script'; scriptId: string; urlPatterns: string[] }
  | { type: 'fill/run'; script: FormScript }
  | { type: 'fill/result'; results: FillFieldResult[] }
  | { type: 'scripts/refresh'; scriptId: string };

export interface PickedField {
  selectors: SelectorCandidate[];
  elementType: FieldElementType;
  label?: string;
}

export interface FillFieldResult {
  fieldId: string;
  status: 'filled' | 'not-found' | 'error';
  message?: string;
}
