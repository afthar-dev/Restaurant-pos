import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  cancelItemSchema,
  cancelOrderSchema,
  kdsStatusSchema,
  type CancelItemRequest,
  type CancelOrderRequest,
  type KdsStatusRequest,
} from '@rpos/shared';
import { Public, RequirePermissions } from '../auth/decorators';
import {
  CurrentActor,
  CurrentUser,
  type AuthUser,
  type RequestContext,
} from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { DeviceGuard } from '../devices/device.guard';
import { KotsService } from './kots.service';

@Controller()
export class KotsController {
  constructor(private readonly kots: KotsService) {}

  @Post('orders/:id/kot')
  @RequirePermissions('order.take')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.kots.send(user, id, ifMatch, idempotencyKey?.slice(0, 100) || undefined);
  }

  @Post('orders/:id/items/:itemId/cancel')
  @RequirePermissions('item.cancelAfterKot')
  cancelItem(
    @CurrentActor() actor: AuthUser,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodBody(cancelItemSchema)) body: CancelItemRequest,
  ) {
    return this.kots.cancelItem(actor, user, id, itemId, ifMatch, body.reason, body.quantity);
  }

  @Post('orders/:id/void')
  @RequirePermissions('item.cancelAfterKot')
  voidOrder(
    @CurrentActor() actor: AuthUser,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodBody(cancelOrderSchema)) body: CancelOrderRequest,
  ) {
    return this.kots.voidOrder(actor, user, id, ifMatch, body.reason);
  }

  @Post('kots/:id/served')
  @RequirePermissions('order.take')
  served(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kots.served(user, id);
  }

  @Post('kots/:id/reprint')
  @RequirePermissions('order.take')
  reprint(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.kots.reprint(user, id);
  }

  @Public()
  @UseGuards(DeviceGuard)
  @Get('kds/stations')
  kitchenStations(@Req() req: RequestContext) {
    return this.kots.kitchenStations(req.device!);
  }

  @Public()
  @UseGuards(DeviceGuard)
  @Get('kds/kots')
  kitchenTickets(
    @Req() req: RequestContext,
    @Query('stationId', new ParseUUIDPipe({ optional: true })) stationId?: string,
  ) {
    return this.kots.kitchenTickets(req.device!, stationId);
  }

  @Public()
  @UseGuards(DeviceGuard)
  @Patch('kds/kots/:id')
  kitchenUpdate(
    @Req() req: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(kdsStatusSchema)) body: KdsStatusRequest,
  ) {
    return this.kots.kitchenUpdate(req.device!, id, body.status);
  }
}
