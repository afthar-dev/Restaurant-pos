import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { AuditService } from './audit.service';

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.iso.datetime().optional(),
});

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.view')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodBody(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>,
  ) {
    return this.audit.list(user.outletId, {
      limit: query.limit,
      before: query.before ? new Date(query.before) : undefined,
    });
  }
}
