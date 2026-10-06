import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';

@Module({
  imports: [OrdersModule],
  controllers: [BillsController],
  providers: [BillsService],
  exports: [BillsService],
})
export class BillingModule {}
