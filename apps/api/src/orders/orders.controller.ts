import {
  Body,
  Controller,
  HttpStatus,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  addItemsSchema,
  cancelOrderSchema,
  createOrderSchema,
  mergeOrderSchema,
  moveOrderSchema,
  updateOrderItemSchema,
  type AddItemsRequest,
  type CancelOrderRequest,
  type CreateOrderRequest,
  type MergeOrderRequest,
  type MoveOrderRequest,
  type UpdateOrderItemRequest,
} from '@rpos/shared';
import { DEVICE_COOKIE } from '../auth/cookies';
import { RequirePermissions } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { CurrentUser, type AuthUser, type RequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { OrdersService } from './orders.service';
import { TableMovesService } from './table-moves.service';

@Controller('orders')
@RequirePermissions('order.take')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly moves: TableMovesService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Req() req: RequestContext,
    @Body(new ZodBody(createOrderSchema)) body: CreateOrderRequest,
  ) {
    const source = await this.orders.sourceForDevice(req.cookies?.[DEVICE_COOKIE]);
    return this.orders.create(user, body, source);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    if (status !== undefined && status !== 'active') {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION', 'Only status=active is supported.');
    }
    return this.orders.active(user.outletId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(user.outletId, id);
  }

  @Post(':id/items')
  addItems(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodBody(addItemsSchema)) body: AddItemsRequest,
  ) {
    return this.orders.addItems(user, id, ifMatch, body);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodBody(updateOrderItemSchema)) body: UpdateOrderItemRequest,
  ) {
    return this.orders.updateItem(user, id, itemId, ifMatch, body);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.orders.removeItem(user, id, itemId, ifMatch);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodBody(cancelOrderSchema)) body: CancelOrderRequest,
  ) {
    return this.orders.cancel(user, id, ifMatch, body.reason);
  }

  @Post(':id/move')
  @RequirePermissions('table.manage')
  move(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodBody(moveOrderSchema)) body: MoveOrderRequest,
  ) {
    return this.moves.move(user, id, ifMatch, body.tableId);
  }

  @Post(':id/merge')
  @RequirePermissions('table.manage')
  merge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodBody(mergeOrderSchema)) body: MergeOrderRequest,
  ) {
    return this.moves.merge(user, id, ifMatch, body.fromOrderId);
  }
}
