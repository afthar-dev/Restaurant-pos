import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/**
 * Connects lazily on the first query, so the API still boots (and reports
 * db: "down" on /api/health) when Postgres is unavailable at startup.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(ENV) env: Env) {
    super({ datasourceUrl: env.DATABASE_URL });
  }

  async onModuleDestroy(): Promise<void> {
    // If the database was never reachable, the pending connect rejects here. Shutdown
    // must still complete, so log and move on.
    await this.$disconnect().catch((error: unknown) => {
      this.logger.warn(`Prisma disconnect failed during shutdown: ${String(error)}`);
    });
  }
}
