import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { KotsController } from './kots.controller';
import { KotsService } from './kots.service';

@Module({
  imports: [OrdersModule],
  controllers: [KotsController],
  providers: [KotsService],
  exports: [KotsService],
})
export class KotsModule {}
