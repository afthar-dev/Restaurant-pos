import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../auth/decorators';
import type { RequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod-body.pipe';
import { DeviceGuard } from '../devices/device.guard';
import { PrintService } from './print.service';

const doneSchema = z.strictObject({ ok: z.boolean() });

/** Used by the device that prints: identified by its device cookie, not a staff sign-in. */
@Public()
@UseGuards(DeviceGuard)
@Controller('print/jobs')
export class PrintController {
  constructor(private readonly print: PrintService) {}

  @Get()
  pending(@Req() req: RequestContext) {
    return this.print.pending(req.device!);
  }

  @Post(':id/done')
  done(
    @Req() req: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(doneSchema)) body: { ok: boolean },
  ) {
    return this.print.done(req.device!, id, body.ok);
  }
}
