import { z } from 'zod';

/**
 * A named container every `FormScript` belongs to (see `flowId` on
 * `formScriptSchema`) — even a single, standalone script gets its own Flow.
 * Deliberately lightweight: no pre-declared variable list. Cross-script
 * sharing happens two ways, both scoped by `flowId` at fill time, not here:
 * - an automatic, zero-config correlated identity (name/email/address/etc.),
 *   persisted via `src/lib/storage/flow-identity-store.ts`;
 * - free-text named variables a field opts into publishing/reading
 *   (`FieldMapping.options.saveAsFlowVariable`), persisted via
 *   `src/lib/storage/flow-values-store.ts`.
 */
export const flowSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Flow = z.infer<typeof flowSchema>;

export function createEmptyFlow(name: string): Flow {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  };
}
