import type { BuiltinGeneratorId } from '../schema/script';
import { generateCep, generateCnpj, generateCpf, generatePassport, generateRg } from './document-br';
import {
  generateAddressCity,
  generateAddressNumber,
  generateAddressState,
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

export type GeneratorOptions = Record<string, unknown>;
export type GeneratorFn = (options?: GeneratorOptions) => string | number | boolean;

export const BUILTIN_GENERATORS: Record<BuiltinGeneratorId, GeneratorFn> = {
  cpf: (options) => generateCpf(options),
  cnpj: (options) => generateCnpj(options),
  rg: (options) => generateRg(options),
  passport: () => generatePassport(),
  phoneBr: (options) => generatePhoneBr(options),
  cep: (options) => generateCep(options),
  fullName: () => generateFullName(),
  firstName: () => generateFirstName(),
  lastName: () => generateLastName(),
  email: () => generateEmail(),
  birthdate: (options) => generateBirthdate(options),
  addressStreet: () => generateAddressStreet(),
  addressNumber: () => generateAddressNumber(),
  addressCity: () => generateAddressCity(),
  addressState: () => generateAddressState(),
  company: () => generateCompany(),
  uuid: () => generateUuid(),
  integer: (options) => generateInteger(options),
  decimal: (options) => generateDecimal(options),
  boolean: (options) => generateBoolean(options),
  lorem: (options) => generateLorem(options),
};

export function runBuiltinGenerator(id: BuiltinGeneratorId, options?: GeneratorOptions) {
  return BUILTIN_GENERATORS[id](options);
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
  company: 'Company',
  uuid: 'UUID',
  integer: 'Integer',
  decimal: 'Decimal',
  boolean: 'Boolean',
  lorem: 'Lorem text',
};
