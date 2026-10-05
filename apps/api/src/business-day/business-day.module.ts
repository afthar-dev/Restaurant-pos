import { Global, Module } from '@nestjs/common';
import { BusinessDayController } from './business-day.controller';
import { BusinessDayService } from './business-day.service';
import { CountersService } from './counters.service';

@Global()
@Module({
  controllers: [BusinessDayController],
  providers: [BusinessDayService, CountersService],
  exports: [BusinessDayService, CountersService],
})
export class BusinessDayModule {}
