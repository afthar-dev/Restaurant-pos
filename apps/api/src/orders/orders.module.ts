import { Module } from '@nestjs/common';
import { FloorModule } from '../floor/floor.module';
import { FloorStatusController } from './floor-status.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { TableMovesService } from './table-moves.service';

@Module({
  imports: [FloorModule],
  controllers: [OrdersController, FloorStatusController],
  providers: [OrdersService, TableMovesService],
  exports: [OrdersService],
})
export class OrdersModule {}
