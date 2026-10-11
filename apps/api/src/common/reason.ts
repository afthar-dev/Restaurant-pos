import { HttpStatus } from '@nestjs/common';
import {
  resolveReason,
  type ReasonInput,
  type ReasonKind,
  type ResolvedReason,
} from '@rpos/shared';
import { ApiError } from './api-error';

/** The reason in a request the schema already checked; refuses a request that has none. */
export function reasonOf(kind: ReasonKind, input: ReasonInput): ResolvedReason {
  const reason = resolveReason(kind, input);
  if (!reason) throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Choose a reason.');
  return reason;
}
