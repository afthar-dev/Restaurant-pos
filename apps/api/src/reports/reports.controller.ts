import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { reportRangeSchema } from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { SalesReportService } from './sales-report.service';

@Controller('reports')
@RequirePermissions('reports.all')
export class ReportsController {
  constructor(private readonly sales: SalesReportService) {}

  /** `?from=YYYY-MM-DD&to=YYYY-MM-DD` (India dates, at most 92 days). */
  @Get('sales')
  salesReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const range = reportRangeSchema.safeParse({ from: from ?? '', to: to ?? '' });
    if (!range.success) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION',
        range.error.issues[0]?.message ?? 'Choose a valid date range.',
      );
    }
    return this.sales.sales(user.outletId, range.data);
  }
}
