import { MediaModule } from './media/media.module';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { BusinessDayModule } from './business-day/business-day.module';
import { apiThrottleLimit, THROTTLE_WINDOW_MS } from './common/throttle';
import { RposThrottlerGuard } from './common/throttler.guard';
import { ConfigModule } from './config/config.module';
import { DevicesModule } from './devices/devices.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FloorModule } from './floor/floor.module';
import { HealthModule } from './health/health.module';
import { KotsModule } from './kots/kots.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { OutletModule } from './outlet/outlet.module';
import { PrintModule } from './print/print.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PrismaModule } from './prisma/prisma.module';
import { QrModule } from './qr/qr.module';
import { ReportsModule } from './reports/reports.module';
import { StockModule } from './stock/stock.module';
import { TaxModule } from './tax/tax.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    MediaModule,
    ConfigModule,
    PrismaModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: THROTTLE_WINDOW_MS, limit: apiThrottleLimit }],
    }),
    AuditModule,
    ExpensesModule,
    StockModule,
    ReportsModule,
    AuthModule,
    DevicesModule,
    UsersModule,
    OutletModule,
    TaxModule,
    KitchenModule,
    FloorModule,
    MenuModule,
    BusinessDayModule,
    OrdersModule,
    KotsModule,
    BillingModule,
    QrModule,
    PrintModule,
    RealtimeModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RposThrottlerGuard }],
})
export class AppModule {}
