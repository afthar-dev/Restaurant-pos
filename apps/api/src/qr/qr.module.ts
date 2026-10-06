import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module';
import { OrdersModule } from '../orders/orders.module';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { QrSessionGuard } from './qr-session.guard';

@Module({
  imports: [MenuModule, OrdersModule],
  controllers: [QrController],
  providers: [QrService, QrSessionGuard],
})
export class QrModule {}
