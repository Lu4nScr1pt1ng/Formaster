import { pick } from './random';

/** A broad, realistic-looking spread — not exhaustive, just varied enough that a "country" field doesn't look canned. */
const COUNTRIES = [
  'United States', 'Brazil', 'Canada', 'Mexico', 'United Kingdom', 'Ireland',
  'France', 'Germany', 'Spain', 'Portugal', 'Italy', 'Netherlands', 'Belgium',
  'Switzerland', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland',
  'Czechia', 'Greece', 'Romania', 'Hungary', 'Ukraine', 'Turkey', 'Israel',
  'United Arab Emirates', 'Saudi Arabia', 'South Africa', 'Egypt', 'Nigeria',
  'Kenya', 'India', 'Pakistan', 'Bangladesh', 'China', 'Japan', 'South Korea',
  'Taiwan', 'Hong Kong', 'Singapore', 'Malaysia', 'Thailand', 'Vietnam',
  'Philippines', 'Indonesia', 'Australia', 'New Zealand', 'Argentina', 'Chile',
  'Colombia', 'Peru', 'Uruguay',
];

export interface CountryOptions {
  /** Pins the result instead of picking randomly — unset (the default) draws from the full list above. */
  locale?: 'br' | 'us';
}

/**
 * `locale: 'br'` returns the name in Portuguese ("Brasil"), not English —
 * this option is what the picker's auto-detection sets when a field's own
 * label is in Portuguese (e.g. "País"), so the value has to match the
 * language of the page it's filling, not just pick the right country.
 * `locale: 'us'` has no such distinction (the English exonym is also the
 * endonym), and the unset/"any" case draws from `COUNTRIES`, which is
 * English throughout — there's no locale signal to translate by there.
 */
export function generateCountry({ locale }: CountryOptions = {}): string {
  if (locale === 'br') return 'Brasil';
  if (locale === 'us') return 'United States';
  return pick(COUNTRIES);
}
