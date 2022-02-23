import { email as emailValidation } from '@hapi/address';
import { EmailAddress } from '@sendgrid/helpers/classes';
import _ from 'lodash';
import { EmailJSON } from '@sendgrid/helpers/classes/email-address';

export class ValidationError extends Error {
  public code: string;

  constructor(type: string, value: string, message: string, code: string) {
    super(`Invalid ${type} '${value}': ${message}`);
    this.code = code;
  }
}

export function validateChannel(value: string): string {
  const channel = _.trimStart(value, '#');

  if (channel.length === 0) {
    throw new ValidationError('channel', value, 'Unexpected empty value.', 'EMPTY_CHANNEL');
  }

  return channel;
}

export function validateEmail(value: string): string {
  const result = emailValidation.analyze(value);

  if (result) {
    throw new ValidationError('email', value, result.error, result.code);
  }

  return value;
}

export function validateEmailName(value: string): EmailJSON {
  const { name, email } = new EmailAddress(value).toJSON();
  return { name, email: validateEmail(email) };
}

export interface ProjectEmailMap {
  [key: string]: EmailJSON[];
}

export function validateProjectEmailNames(values: string[]): ProjectEmailMap {
  const validated: ProjectEmailMap = {};

  for (let value of values) {
    const [project, email] = value.split('=');

    if (project.length === 0) {
      throw new ValidationError('project', value, 'Value is empty', 'PROJECT_VALUE_EMPTY');
    }

    const key = project.toUpperCase();
    validated[key] = (validated[key] ?? []).concat(validateEmailName(email));
  }

  return validated;
}

export function validateUrl(value: string): string {
  // URL constructor validates string values and throws errors for invalid values
  return new URL(value).toString();
}

export function validateUrls(values: string[]): string[] {
  return values.map(validateUrl);
}
