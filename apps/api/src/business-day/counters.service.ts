import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type CounterKey = 'KOT' | 'TOKEN' | 'BILL';

/**
 * Gap-free numbers. Call inside the transaction that creates the numbered row: the counter row
 * stays locked until commit, and a rollback gives the number back.
 */
@Injectable()
export class CountersService {
  async next(
    tx: Prisma.TransactionClient,
    outletId: string,
    key: CounterKey,
    period: string,
  ): Promise<number> {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO counters (id, outlet_id, key, period, value, created_at, updated_at)
      VALUES (gen_random_uuid(), ${outletId}::uuid, ${key}, ${period}, 1, now(), now())
      ON CONFLICT (outlet_id, key, period)
      DO UPDATE SET value = counters.value + 1, updated_at = now()
      RETURNING value`;
    return rows[0]!.value;
  }
}
