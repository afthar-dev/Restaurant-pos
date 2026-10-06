import { Module } from '@nestjs/common';
import { KotsModule } from '../kots/kots.module';
import { MenuModule } from '../menu/menu.module';
import { OrdersModule } from '../orders/orders.module';
import { QrApprovalService } from './qr-approval.service';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { QrSessionGuard } from './qr-session.guard';
import { QrStaffController } from './qr-staff.controller';

@Module({
  imports: [MenuModule, OrdersModule, KotsModule],
  controllers: [QrController, QrStaffController],
  providers: [QrService, QrApprovalService, QrSessionGuard],
})
export class QrModule {}
