import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@rpos/shared';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<HealthResponse> {
    const dbUp = await withTimeout(this.prisma.$queryRaw`SELECT 1`, timeoutMs).then(
      () => true,
      () => false,
    );
    return dbUp ? { status: 'ok', db: 'up' } : { status: 'error', db: 'down' };
  }
}
