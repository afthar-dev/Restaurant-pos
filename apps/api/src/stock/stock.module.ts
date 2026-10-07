import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module';
import { PurchasesService } from './purchases.service';
import { PurchasesController, StockItemsController } from './stock.controller';
import { StockItemsService } from './stock-items.service';

@Module({
  imports: [ExpensesModule],
  controllers: [StockItemsController, PurchasesController],
  providers: [StockItemsService, PurchasesService],
})
export class StockModule {}
