import { HttpException } from '@nestjs/common';

/** HTTP error with the API's standard body: { code, message, ...extra }. */
export class ApiError extends HttpException {
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super({ code, message, ...extra }, status);
  }
}
