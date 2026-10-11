import { Controller, Get, HttpStatus, ParseUUIDPipe, Query } from '@nestjs/common';
import { reportRangeSchema } from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { AccountabilityService } from './accountability.service';
import { SalesReportService } from './sales-report.service';

@Controller('reports')
@RequirePermissions('reports.all')
export class ReportsController {
  constructor(
    private readonly sales: SalesReportService,
    private readonly accountability: AccountabilityService,
  ) {}

  /**
   * `?from=YYYY-MM-DD&to=YYYY-MM-DD` (India dates, at most 92 days), or `?businessDayId=` for
   * that one business day whatever date it was opened on (a day left open past midnight).
   */
  @Get('sales')
  salesReport(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('businessDayId', new ParseUUIDPipe({ optional: true })) businessDayId?: string,
  ) {
    if (businessDayId) return this.sales.salesOfDay(user.outletId, businessDayId);
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

  /** Discounts, voids, cancelled dishes and reprints by reason and by staff, over India dates. */
  @Get('accountability')
  accountabilityReport(
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
    return this.accountability.accountability(user.outletId, range.data);
  }
}
