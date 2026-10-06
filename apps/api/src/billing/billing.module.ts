import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import { PaymentsService } from './payments.service';

@Module({
  imports: [OrdersModule],
  controllers: [BillsController],
  providers: [BillsService, PaymentsService],
  exports: [BillsService, PaymentsService],
})
export class BillingModule {}
