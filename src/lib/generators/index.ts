import type { BuiltinGeneratorId } from '../schema/script';
import { generateCnpj, generateCpf, generatePassport, generateRg } from './document-br';
import {
  generateAddressNumber,
  generateAddressStreet,
  generateBirthdate,
  generateCompany,
  generateEmail,
  generateFirstName,
  generateFullName,
  generateLastName,
  generatePhoneBr,
  type NameOptions,
} from './person';
import { generatePassword } from './password';
import { generateBoolean, generateDecimal, generateInteger, generateLorem, generateUuid } from './misc';
import { generateCountry, type CountryOptions } from './country';
import { generateCreditCardCvc, generateCreditCardExpiry, generateCreditCardNumber } from './credit-card';
import {
  generateAddressCepBr,
  generateAddressCityBr,
  generateAddressComplementBr,
  generateAddressNeighborhoodBr,
  generateAddressStateBr,
  generateFullAddressBr,
} from './address-br';
import {
  generateAddressCityUs,
  generateAddressComplementUs,
  generateAddressNeighborhoodUs,
  generateAddressStateUs,
  generateAddressStreetUs,
  generateAddressZipUs,
  generateFullAddressUs,
} from './address-us';

export type GeneratorOptions = Record<string, unknown>;
/**
 * `runContext` is a mutable bag shared by every builtin generator called
 * within the same fill run (see `fillScript()`), scoped there and back —
 * it exists so a handful of related generators (currently the BR and US
 * address quartets: cep/zip + city + state + neighborhood) can agree with
 * each other instead of each independently picking its own random value.
 * Most generators ignore it entirely.
 */
export type GeneratorRunContext = Record<string, unknown>;
export type GeneratorFn = (options?: GeneratorOptions, runContext?: GeneratorRunContext) => string | number | boolean;

function isUsLocale(options?: GeneratorOptions): boolean {
  return options?.locale === 'us';
}

export const BUILTIN_GENERATORS: Record<BuiltinGeneratorId, GeneratorFn> = {
  cpf: (options) => generateCpf(options),
  cnpj: (options) => generateCnpj(options),
  rg: (options) => generateRg(options),
  passport: () => generatePassport(),
  phoneBr: (options) => generatePhoneBr(options),
  cep: (options, ctx) => (isUsLocale(options) ? generateAddressZipUs(options, ctx) : generateAddressCepBr(options, ctx)),
  fullName: (options, ctx) => generateFullName(options as NameOptions, ctx),
  firstName: (options, ctx) => generateFirstName(options as NameOptions, ctx),
  lastName: (options, ctx) => generateLastName(options as NameOptions, ctx),
  email: (options, ctx) => generateEmail(options as NameOptions, ctx),
  birthdate: (options) => generateBirthdate(options),
  addressStreet: (options) => (isUsLocale(options) ? generateAddressStreetUs() : generateAddressStreet()),
  addressNumber: () => generateAddressNumber(),
  addressComplement: (options) => (isUsLocale(options) ? generateAddressComplementUs() : generateAddressComplementBr()),
  addressCity: (options, ctx) => (isUsLocale(options) ? generateAddressCityUs(undefined, ctx) : generateAddressCityBr(undefined, ctx)),
  addressState: (options, ctx) => (isUsLocale(options) ? generateAddressStateUs(undefined, ctx) : generateAddressStateBr(undefined, ctx)),
  addressNeighborhood: (options, ctx) =>
    isUsLocale(options) ? generateAddressNeighborhoodUs(undefined, ctx) : generateAddressNeighborhoodBr(undefined, ctx),
  fullAddress: (options, ctx) => (isUsLocale(options) ? generateFullAddressUs(undefined, ctx) : generateFullAddressBr(undefined, ctx)),
  country: (options) => generateCountry(options as CountryOptions),
  company: () => generateCompany(),
  uuid: () => generateUuid(),
  password: (options) => generatePassword(options),
  integer: (options) => generateInteger(options),
  decimal: (options) => generateDecimal(options),
  boolean: (options) => generateBoolean(options),
  lorem: (options) => generateLorem(options),
  creditCardNumber: (options, ctx) => generateCreditCardNumber(options, ctx),
  creditCardExpiry: (options) => generateCreditCardExpiry(options),
  creditCardCvc: (options, ctx) => generateCreditCardCvc(options, ctx),
};

export function runBuiltinGenerator(id: BuiltinGeneratorId, options?: GeneratorOptions, runContext?: GeneratorRunContext) {
  return BUILTIN_GENERATORS[id](options, runContext);
}

export const BUILTIN_GENERATOR_LABELS: Record<BuiltinGeneratorId, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  rg: 'RG',
  passport: 'Passport',
  phoneBr: 'Phone',
  cep: 'Postal code',
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  birthdate: 'Birthdate',
  addressStreet: 'Street',
  addressNumber: 'Address number',
  addressComplement: 'Address complement',
  addressCity: 'City',
  addressState: 'State',
  addressNeighborhood: 'Neighborhood',
  fullAddress: 'Full address',
  country: 'Country',
  company: 'Company',
  uuid: 'UUID',
  password: 'Password',
  integer: 'Integer',
  decimal: 'Decimal',
  boolean: 'Boolean',
  lorem: 'Lorem text',
  creditCardNumber: 'Credit card number',
  creditCardExpiry: 'Credit card expiry',
  creditCardCvc: 'Credit card CVC',
};
