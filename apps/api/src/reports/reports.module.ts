import { Module } from '@nestjs/common';
import { AccountabilityService } from './accountability.service';
import { GstReportService } from './gst-report.service';
import { ReportsController } from './reports.controller';
import { SalesReportService } from './sales-report.service';

@Module({
  controllers: [ReportsController],
  providers: [SalesReportService, AccountabilityService, GstReportService],
})
export class ReportsModule {}
