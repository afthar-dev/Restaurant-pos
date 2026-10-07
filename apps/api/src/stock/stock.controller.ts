import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  purchaseSchema,
  stockAdjustSchema,
  stockCountSchema,
  stockItemSchema,
  voidSchema,
  type PurchaseRequest,
  type StockAdjustRequest,
  type StockCountRequest,
  type StockItemRequest,
  type VoidRequest,
} from '@rpos/shared';
import { RequirePermissions } from '../auth/decorators';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { PurchasesService } from './purchases.service';
import { StockItemsService } from './stock-items.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('stock/items')
@RequirePermissions('stock.manage')
export class StockItemsController {
  constructor(private readonly items: StockItemsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.items.list(user.outletId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(stockItemSchema)) body: StockItemRequest,
  ) {
    return this.items.create(user, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(stockItemSchema)) body: StockItemRequest,
  ) {
    return this.items.update(user, id, body);
  }

  @Post(':id/archive')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.items.archive(user, id);
  }

  @Post(':id/adjust')
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(stockAdjustSchema)) body: StockAdjustRequest,
  ) {
    return this.items.adjust(user, id, body);
  }

  @Post(':id/count')
  count(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(stockCountSchema)) body: StockCountRequest,
  ) {
    return this.items.count(user, id, body);
  }

  @Get(':id/txns')
  txns(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.items.txns(user.outletId, id, limit);
  }
}

@Controller('purchases')
@RequirePermissions('stock.manage')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  /** `?day=current` (default), `all`, or a business day id. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('day') day = 'current',
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    const which = day === 'all' || UUID.test(day) ? day : 'current';
    return this.purchases.list(user.outletId, which, limit);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.get(user.outletId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodBody(purchaseSchema)) body: PurchaseRequest,
  ) {
    return this.purchases.create(user, idempotencyKey?.slice(0, 100) || undefined, body);
  }

  @Post(':id/void')
  void(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(voidSchema)) body: VoidRequest,
  ) {
    return this.purchases.void(user, id, body.reason);
  }
}
