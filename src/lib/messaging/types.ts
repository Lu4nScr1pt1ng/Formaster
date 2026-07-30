import type { FillResult } from '../filler/fill-script';
import type { GeneratorRunContext } from '../generators';
import type { DetectedGenerator } from '../picker/detect-generator';
import type { FieldElementType, FormScript, SelectorCandidate } from '../schema/script';

/** Runtime messages passed between background, content script, popup, and options. */
export type RuntimeMessage =
  | { type: 'picker/start'; existingFields?: ExistingPickedField[] }
  | { type: 'picker/finished'; fields: PickedField[]; removedFieldIds?: string[]; pageUrl: string }
  | { type: 'picker/start-for-script'; scriptId: string; urlPatterns: string[] }
  | { type: 'fill/run'; script: FormScript }
  | { type: 'fill/result'; results: FillFieldResult[] }
  | { type: 'scripts/refresh'; scriptId: string }
  // Sent by the "Fill this field" context-menu item's onClicked handler —
  // content.ts fills whatever element its own `contextmenu` listener last
  // saw, since a DOM element itself can't cross the messaging boundary.
  | { type: 'contextmenu/fill-field' }
  // Sent by the "Run script for this page" context-menu item's onClicked
  // handler when no saved script's URL pattern matches the page — a
  // successful run needs no separate message (the existing fill/result
  // broadcast already flashes the toolbar badge), only this "nothing to
  // run" case needs its own feedback.
  | { type: 'contextmenu/no-script-found' }
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
  /** Best-effort guess at this field's generator, from its own id/name/autocomplete/label — see detect-generator.ts. */
  suggestedGenerator?: DetectedGenerator;
}

/** A script's already-saved field, sent to the picker so it can pre-mark the matching element as mapped. */
export interface ExistingPickedField {
  id: string;
  selectors: SelectorCandidate[];
}

/** Same shape produced by `fillScript()` — kept as one alias so the message boundary and the filler share a single source of truth. */
export type FillFieldResult = FillResult;
