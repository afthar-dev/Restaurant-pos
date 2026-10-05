import { HttpStatus } from '@nestjs/common';
import { ApiError } from './api-error';

/** Shared errors and helpers for archivable setup data (menu, floor, kitchen, tax). */

export const nameTaken = () =>
  new ApiError(HttpStatus.CONFLICT, 'NAME_TAKEN', 'That name is already used.');

export const inUse = (message: string) => new ApiError(HttpStatus.CONFLICT, 'IN_USE', message);

export const notFound = (what: string) =>
  new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found.`);

export const invalidReference = (field: string) =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_REFERENCE',
    'Something you picked is no longer available. Refresh and try again.',
    { field },
  );

/** `?include=archived` lists archived rows too. */
export function archivedFilter(include?: string): { archivedAt?: null } {
  return include === 'archived' ? {} : { archivedAt: null };
}

/** Case-insensitive name match among active rows, excluding `exceptId`. */
export function sameActiveName(name: string, exceptId?: string) {
  return {
    archivedAt: null,
    name: { equals: name, mode: 'insensitive' as const },
    ...(exceptId ? { id: { not: exceptId } } : {}),
  };
}
