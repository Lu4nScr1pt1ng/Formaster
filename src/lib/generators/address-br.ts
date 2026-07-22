import { pick, randomDigits } from './random';

/**
 * Representative central-area CEP prefix + a couple of real neighborhoods
 * per city — not an exhaustive CEP database (Correios doesn't publish one
 * for free), but internally consistent: the prefix's leading digit matches
 * that city's real Correios macro-region, so cep/city/state/neighborhood
 * generated from the same record always agree with each other.
 */
interface AddressBrCity {
  city: string;
  state: string;
  cepPrefix: string;
  neighborhoods: string[];
}

const ADDRESS_BR_CITIES: AddressBrCity[] = [
  { city: 'Sao Paulo', state: 'SP', cepPrefix: '01310', neighborhoods: ['Centro', 'Bela Vista', 'Pinheiros'] },
  { city: 'Rio de Janeiro', state: 'RJ', cepPrefix: '22041', neighborhoods: ['Copacabana', 'Centro', 'Tijuca'] },
  { city: 'Belo Horizonte', state: 'MG', cepPrefix: '30130', neighborhoods: ['Centro', 'Savassi', 'Lourdes'] },
  { city: 'Curitiba', state: 'PR', cepPrefix: '80010', neighborhoods: ['Centro', 'Batel', 'Agua Verde'] },
  { city: 'Porto Alegre', state: 'RS', cepPrefix: '90010', neighborhoods: ['Centro Historico', 'Moinhos de Vento', 'Cidade Baixa'] },
  { city: 'Salvador', state: 'BA', cepPrefix: '40015', neighborhoods: ['Centro', 'Barra', 'Pituba'] },
  { city: 'Recife', state: 'PE', cepPrefix: '50010', neighborhoods: ['Centro', 'Boa Viagem', 'Casa Forte'] },
  { city: 'Fortaleza', state: 'CE', cepPrefix: '60010', neighborhoods: ['Centro', 'Meireles', 'Aldeota'] },
  { city: 'Brasilia', state: 'DF', cepPrefix: '70040', neighborhoods: ['Asa Sul', 'Asa Norte', 'Lago Sul'] },
  { city: 'Manaus', state: 'AM', cepPrefix: '69005', neighborhoods: ['Centro', 'Adrianopolis', 'Ponta Negra'] },
];

export interface AddressBrRecord {
  city: string;
  state: string;
  neighborhood: string;
  /** Unmasked 8 digits. */
  cep: string;
}

function pickAddressBrRecord(): AddressBrRecord {
  const entry = pick(ADDRESS_BR_CITIES);
  return {
    city: entry.city,
    state: entry.state,
    neighborhood: pick(entry.neighborhoods),
    cep: `${entry.cepPrefix}${randomDigits(3).join('')}`,
  };
}

const RUN_CONTEXT_KEY = 'addressBr';

/**
 * Returns the address record for the current fill run, generating and
 * caching one on first use so every field pulling from this (cep, city,
 * state, neighborhood) resolves to the *same* address instead of each
 * picking an unrelated random one. Falls back to a fresh one-off record
 * when there's no run context to cache into (e.g. called directly, outside
 * a script run).
 */
function currentAddressBrRecord(runContext?: Record<string, unknown>): AddressBrRecord {
  if (!runContext) return pickAddressBrRecord();
  const cached = runContext[RUN_CONTEXT_KEY];
  if (isAddressBrRecord(cached)) return cached;
  const record = pickAddressBrRecord();
  runContext[RUN_CONTEXT_KEY] = record;
  return record;
}

function isAddressBrRecord(value: unknown): value is AddressBrRecord {
  return typeof value === 'object' && value !== null && 'cep' in value && 'city' in value;
}

export interface AddressCepOptions {
  masked?: boolean;
}

export function generateAddressCepBr({ masked = true }: AddressCepOptions = {}, runContext?: Record<string, unknown>): string {
  const { cep } = currentAddressBrRecord(runContext);
  return masked ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

export function generateAddressCityBr(_options?: unknown, runContext?: Record<string, unknown>): string {
  return currentAddressBrRecord(runContext).city;
}

export function generateAddressStateBr(_options?: unknown, runContext?: Record<string, unknown>): string {
  return currentAddressBrRecord(runContext).state;
}

export function generateAddressNeighborhoodBr(_options?: unknown, runContext?: Record<string, unknown>): string {
  return currentAddressBrRecord(runContext).neighborhood;
}
