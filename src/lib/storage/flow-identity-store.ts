import { createKeyedStore } from './keyed-store';
import type { GeneratorRunContext } from '../generators';

// Opaque blob owned by `src/lib/generators/random.ts`'s `getOrCreate()` —
// this store just persists it per Flow across script runs so page 2 asking
// for `email` correlates with the same person page 1 already generated.
function store(flowId: string) {
  return createKeyedStore<GeneratorRunContext>(`formaster:flow-identity:${flowId}`);
}

export async function getFlowIdentity(flowId: string): Promise<GeneratorRunContext> {
  return (await store(flowId).get()) ?? {};
}

export async function setFlowIdentity(flowId: string, context: GeneratorRunContext): Promise<void> {
  await store(flowId).set(context);
}

export async function resetFlowIdentity(flowId: string): Promise<void> {
  await store(flowId).clear();
}
