import { Module } from '@nestjs/common';
import { AccountabilityService } from './accountability.service';
import { ReportsController } from './reports.controller';
import { SalesReportService } from './sales-report.service';

@Module({
  controllers: [ReportsController],
  providers: [SalesReportService, AccountabilityService],
})
export class ReportsModule {}
