import { pick, randomDigits, randomInt } from './random';
import { generateAddressNumber } from './person';

/**
 * Same idea as `address-br.ts`'s city table: a representative ZIP prefix per
 * city so zip/city/state/neighborhood generated together always agree, not
 * an exhaustive USPS database.
 */
interface AddressUsCity {
  city: string;
  state: string;
  zipPrefix: string;
  neighborhoods: string[];
}

const ADDRESS_US_CITIES: AddressUsCity[] = [
  { city: 'New York', state: 'NY', zipPrefix: '100', neighborhoods: ['Manhattan', 'Brooklyn', 'Queens'] },
  { city: 'Los Angeles', state: 'CA', zipPrefix: '900', neighborhoods: ['Downtown', 'Hollywood', 'Venice'] },
  { city: 'Chicago', state: 'IL', zipPrefix: '606', neighborhoods: ['The Loop', 'Wicker Park', 'Lincoln Park'] },
  { city: 'Houston', state: 'TX', zipPrefix: '770', neighborhoods: ['Midtown', 'Montrose', 'The Heights'] },
  { city: 'Phoenix', state: 'AZ', zipPrefix: '850', neighborhoods: ['Downtown', 'Arcadia', 'Camelback East'] },
  { city: 'Philadelphia', state: 'PA', zipPrefix: '191', neighborhoods: ['Center City', 'Fishtown', 'Manayunk'] },
  { city: 'San Antonio', state: 'TX', zipPrefix: '782', neighborhoods: ['Downtown', 'Alamo Heights', 'Stone Oak'] },
  { city: 'San Diego', state: 'CA', zipPrefix: '921', neighborhoods: ['Gaslamp Quarter', 'La Jolla', 'Pacific Beach'] },
  { city: 'Miami', state: 'FL', zipPrefix: '331', neighborhoods: ['Brickell', 'Wynwood', 'Coral Gables'] },
  { city: 'Seattle', state: 'WA', zipPrefix: '981', neighborhoods: ['Capitol Hill', 'Ballard', 'Fremont'] },
  { city: 'Boston', state: 'MA', zipPrefix: '021', neighborhoods: ['Back Bay', 'Beacon Hill', 'South End'] },
  { city: 'Denver', state: 'CO', zipPrefix: '802', neighborhoods: ['LoDo', 'Capitol Hill', 'Highland'] },
  { city: 'Austin', state: 'TX', zipPrefix: '787', neighborhoods: ['Downtown', 'South Congress', 'East Austin'] },
  { city: 'Portland', state: 'OR', zipPrefix: '972', neighborhoods: ['Pearl District', 'Alberta', 'Hawthorne'] },
  { city: 'Atlanta', state: 'GA', zipPrefix: '303', neighborhoods: ['Midtown', 'Buckhead', 'Old Fourth Ward'] },
  { city: 'Nashville', state: 'TN', zipPrefix: '372', neighborhoods: ['Downtown', 'East Nashville', 'The Gulch'] },
];

const US_STREET_NAMES = [
  'Main', 'Oak', 'Maple', 'Cedar', 'Elm', 'Washington', 'Park', 'Sunset',
  'Lake', 'Hill', 'Pine', 'Willow', 'Birch', 'Highland', 'Ridge', 'River',
  'Meadow', 'Forest', 'Franklin', 'Jefferson', 'Lincoln', 'Madison', 'Spring',
  'Chestnut',
];
const US_STREET_TYPES = ['St', 'Ave', 'Blvd', 'Dr', 'Ln', 'Rd', 'Ct', 'Way', 'Pl', 'Ter'];

const COMPLEMENT_TEMPLATES: Array<() => string> = [
  () => `Apt ${randomInt(1, 30)}${pick(['A', 'B', 'C', ''])}`,
  () => `Unit ${randomInt(100, 950)}`,
  () => `Suite ${randomInt(100, 950)}`,
  () => `Floor ${randomInt(2, 20)}`,
];

export interface AddressUsRecord {
  city: string;
  state: string;
  neighborhood: string;
  /** Unmasked 5 digits. */
  zip: string;
}

function pickAddressUsRecord(): AddressUsRecord {
  const entry = pick(ADDRESS_US_CITIES);
  return {
    city: entry.city,
    state: entry.state,
    neighborhood: pick(entry.neighborhoods),
    zip: `${entry.zipPrefix}${randomDigits(2).join('')}`,
  };
}

const RUN_CONTEXT_KEY = 'addressUs';

/** Same run-scoped caching as `address-br.ts`'s BR quartet — see that file for why. */
function currentAddressUsRecord(runContext?: Record<string, unknown>): AddressUsRecord {
  if (!runContext) return pickAddressUsRecord();
  const cached = runContext[RUN_CONTEXT_KEY];
  if (isAddressUsRecord(cached)) return cached;
  const record = pickAddressUsRecord();
  runContext[RUN_CONTEXT_KEY] = record;
  return record;
}

function isAddressUsRecord(value: unknown): value is AddressUsRecord {
  return typeof value === 'object' && value !== null && 'zip' in value && 'city' in value;
}

export interface AddressZipOptions {
  /** Appends a random ZIP+4 suffix ("10001-1234") instead of the plain 5 digits. */
  masked?: boolean;
}

export function generateAddressZipUs({ masked = false }: AddressZipOptions = {}, runContext?: Record<string, unknown>): string {
  const { zip } = currentAddressUsRecord(runContext);
  return masked ? `${zip}-${randomDigits(4).join('')}` : zip;
}

export function generateAddressCityUs(_options?: unknown, runContext?: Record<string, unknown>): string {
  return currentAddressUsRecord(runContext).city;
}

export function generateAddressStateUs(_options?: unknown, runContext?: Record<string, unknown>): string {
  return currentAddressUsRecord(runContext).state;
}

export function generateAddressNeighborhoodUs(_options?: unknown, runContext?: Record<string, unknown>): string {
  return currentAddressUsRecord(runContext).neighborhood;
}

export function generateAddressStreetUs(): string {
  return `${pick(US_STREET_NAMES)} ${pick(US_STREET_TYPES)}`;
}

export function generateAddressComplementUs(): string {
  return pick(COMPLEMENT_TEMPLATES)();
}

/** One formatted line combining street, number, complement, city, state, and ZIP. */
export function generateFullAddressUs(_options?: unknown, runContext?: Record<string, unknown>): string {
  const { city, state, zip } = currentAddressUsRecord(runContext);
  const street = generateAddressStreetUs();
  const number = generateAddressNumber();
  const complement = generateAddressComplementUs();
  return `${number} ${street}, ${complement}, ${city}, ${state} ${zip}`;
}
