import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BusinessDayModule } from './business-day/business-day.module';
import { apiThrottleLimit, THROTTLE_WINDOW_MS } from './common/throttle';
import { RposThrottlerGuard } from './common/throttler.guard';
import { ConfigModule } from './config/config.module';
import { DevicesModule } from './devices/devices.module';
import { FloorModule } from './floor/floor.module';
import { HealthModule } from './health/health.module';
import { KotsModule } from './kots/kots.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { OutletModule } from './outlet/outlet.module';
import { PrintModule } from './print/print.module';
import { PrismaModule } from './prisma/prisma.module';
import { TaxModule } from './tax/tax.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: THROTTLE_WINDOW_MS, limit: apiThrottleLimit }],
    }),
    AuditModule,
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
    PrintModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RposThrottlerGuard }],
})
export class AppModule {}
