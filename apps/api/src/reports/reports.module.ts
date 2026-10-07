import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { SalesReportService } from './sales-report.service';

@Module({
  controllers: [ReportsController],
  providers: [SalesReportService],
})
export class ReportsModule {}
