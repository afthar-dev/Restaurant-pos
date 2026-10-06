import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { QrSessionGuard } from './qr-session.guard';

@Module({
  imports: [MenuModule],
  controllers: [QrController],
  providers: [QrService, QrSessionGuard],
})
export class QrModule {}
