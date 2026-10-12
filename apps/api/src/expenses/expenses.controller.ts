import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  expenseCategorySchema,
  expenseSchema,
  voidSchema,
  type ExpenseCategoryRequest,
  type ExpenseRequest,
  type VoidRequest,
} from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser, type RequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpensesService } from './expenses.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('expense-categories')
@RequirePermissions('expense.manage')
export class ExpenseCategoriesController {
  constructor(private readonly categories: ExpenseCategoriesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.categories.list(user.outletId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(expenseCategorySchema)) body: ExpenseCategoryRequest,
  ) {
    return this.categories.create(user, body);
  }

  @Put(':id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(expenseCategorySchema)) body: ExpenseCategoryRequest,
  ) {
    return this.categories.rename(user, id, body);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.archive(user, id);
  }
}

@Controller('expenses')
@RequirePermissions('expense.manage')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  /** `?day=current` (default) or a business day id. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('day') day = 'current') {
    return this.expenses.list(user.outletId, UUID.test(day) ? day : 'current');
  }

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Req() req: RequestContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodBody(expenseSchema)) body: ExpenseRequest,
  ) {
    return this.expenses.add(
      user,
      req.permissions ?? [],
      idempotencyKey?.slice(0, 100) || undefined,
      body,
    );
  }

  @Post(':id/void')
  void(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(voidSchema)) body: VoidRequest,
  ) {
    return this.expenses.void(user, id, body.reason);
  }
}
