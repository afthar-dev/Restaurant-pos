import { HttpStatus } from '@nestjs/common';
import { ApiError } from './api-error';

/** The version in an `If-Match` header, or null when the client did not send one. */
export function parseVersion(ifMatch: string | undefined): number | null {
  if (ifMatch === undefined || ifMatch === '') return null;
  const value = Number(ifMatch.replace(/"/g, ''));
  if (!Number.isInteger(value) || value < 0) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'If-Match must be a version number.');
  }
  return value;
}
