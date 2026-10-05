import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { apiThrottleLimit, THROTTLE_WINDOW_MS } from './common/throttle';
import { RposThrottlerGuard } from './common/throttler.guard';
import { ConfigModule } from './config/config.module';
import { DevicesModule } from './devices/devices.module';
import { HealthModule } from './health/health.module';
import { OutletModule } from './outlet/outlet.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: THROTTLE_WINDOW_MS, limit: apiThrottleLimit }],
    }),
    AuditModule,
    AuthModule,
    DevicesModule,
    UsersModule,
    OutletModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RposThrottlerGuard }],
})
export class AppModule {}
