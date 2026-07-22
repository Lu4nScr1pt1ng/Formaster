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
} from './person';
import { generateBoolean, generateDecimal, generateInteger, generateLorem, generateUuid } from './misc';
import { generateCreditCardCvc, generateCreditCardExpiry, generateCreditCardNumber } from './credit-card';
import {
  generateAddressCepBr,
  generateAddressCityBr,
  generateAddressNeighborhoodBr,
  generateAddressStateBr,
} from './address-br';

export type GeneratorOptions = Record<string, unknown>;
/**
 * `runContext` is a mutable bag shared by every builtin generator called
 * within the same fill run (see `fillScript()`), scoped there and back —
 * it exists so a handful of related generators (currently the BR address
 * quartet: cep/city/state/neighborhood) can agree with each other instead
 * of each independently picking its own random value. Most generators
 * ignore it entirely.
 */
export type GeneratorRunContext = Record<string, unknown>;
export type GeneratorFn = (options?: GeneratorOptions, runContext?: GeneratorRunContext) => string | number | boolean;

export const BUILTIN_GENERATORS: Record<BuiltinGeneratorId, GeneratorFn> = {
  cpf: (options) => generateCpf(options),
  cnpj: (options) => generateCnpj(options),
  rg: (options) => generateRg(options),
  passport: () => generatePassport(),
  phoneBr: (options) => generatePhoneBr(options),
  cep: (options, ctx) => generateAddressCepBr(options, ctx),
  fullName: () => generateFullName(),
  firstName: () => generateFirstName(),
  lastName: () => generateLastName(),
  email: () => generateEmail(),
  birthdate: (options) => generateBirthdate(options),
  addressStreet: () => generateAddressStreet(),
  addressNumber: () => generateAddressNumber(),
  addressCity: (_options, ctx) => generateAddressCityBr(undefined, ctx),
  addressState: (_options, ctx) => generateAddressStateBr(undefined, ctx),
  addressNeighborhood: (_options, ctx) => generateAddressNeighborhoodBr(undefined, ctx),
  company: () => generateCompany(),
  uuid: () => generateUuid(),
  integer: (options) => generateInteger(options),
  decimal: (options) => generateDecimal(options),
  boolean: (options) => generateBoolean(options),
  lorem: (options) => generateLorem(options),
  creditCardNumber: (options) => generateCreditCardNumber(options),
  creditCardExpiry: (options) => generateCreditCardExpiry(options),
  creditCardCvc: (options) => generateCreditCardCvc(options),
};

export function runBuiltinGenerator(id: BuiltinGeneratorId, options?: GeneratorOptions, runContext?: GeneratorRunContext) {
  return BUILTIN_GENERATORS[id](options, runContext);
}

export const BUILTIN_GENERATOR_LABELS: Record<BuiltinGeneratorId, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  rg: 'RG',
  passport: 'Passport',
  phoneBr: 'Phone (BR)',
  cep: 'CEP',
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  birthdate: 'Birthdate',
  addressStreet: 'Street',
  addressNumber: 'Address number',
  addressCity: 'City',
  addressState: 'State',
  addressNeighborhood: 'Neighborhood',
  company: 'Company',
  uuid: 'UUID',
  integer: 'Integer',
  decimal: 'Decimal',
  boolean: 'Boolean',
  lorem: 'Lorem text',
  creditCardNumber: 'Credit card number',
  creditCardExpiry: 'Credit card expiry',
  creditCardCvc: 'Credit card CVC',
};
