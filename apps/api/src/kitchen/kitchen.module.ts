import { Module } from '@nestjs/common';
import { PrintersController, StationsController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';

@Module({
  controllers: [StationsController, PrintersController],
  providers: [KitchenService],
  exports: [KitchenService],
})
export class KitchenModule {}
