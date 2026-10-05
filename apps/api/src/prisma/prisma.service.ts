import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/**
 * Connects lazily on the first query, so the API still boots (and reports
 * db: "down" on /api/health) when Postgres is unavailable at startup.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ datasourceUrl: env.DATABASE_URL });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
