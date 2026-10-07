import { Module } from '@nestjs/common';
import { ExpenseCategoriesController, ExpensesController } from './expenses.controller';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpensesService } from './expenses.service';

@Module({
  controllers: [ExpenseCategoriesController, ExpensesController],
  providers: [ExpenseCategoriesService, ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
