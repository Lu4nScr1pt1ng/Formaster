import { z } from 'zod';

/**
 * A named container every `FormScript` belongs to (see `flowId` on
 * `formScriptSchema`) — even a single, standalone script gets its own Flow.
 * Deliberately lightweight: no pre-declared variable list.
 *
 * Exactly one thing crosses from one script to the next, scoped by `flowId`
 * at fill time rather than declared here: free-text named variables a field
 * opts into publishing (`FieldMapping.options.saveAsFlowVariable`), persisted
 * via `src/lib/storage/flow-values-store.ts`.
 *
 * Nothing else is carried over — notably not the correlated identity that
 * makes a run's name/email/address agree with each other, which lives and
 * dies inside a single fill. A Flow holding a hidden person and address would
 * be state the user never asked for and can't see; if two pages need the same
 * name, one publishes it as a variable and the other reads it, which is
 * visible and explicit.
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
