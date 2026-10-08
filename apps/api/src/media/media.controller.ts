import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/decorators';
import { notFound } from '../common/master-data';
import { PrismaService } from '../prisma/prisma.service';
import { IMMUTABLE_CACHE, KEY_PATTERN, MEDIA_STORAGE, type MediaStorage } from './storage';

/**
 * Serves photos kept in the local folder. With Cloudflare R2 photos load straight from the
 * bucket, so this answers 404. Public: QR customers are not signed in; keys are random.
 */
@Controller('media')
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  @Get(':key')
  @Public()
  @SkipThrottle()
  async get(@Param('key') key: string, @Res() res: Response) {
    if (this.storage.kind !== 'local' || !KEY_PATTERN.test(key)) throw notFound('Photo');
    const media = await this.prisma.media.findUnique({ where: { key } });
    const bytes = media ? await this.storage.read(key) : null;
    if (!media || !bytes) throw notFound('Photo');
    res
      .status(200)
      .set({
        'Content-Type': media.mimeType,
        'Content-Length': String(bytes.length),
        'Cache-Control': IMMUTABLE_CACHE,
        'X-Content-Type-Options': 'nosniff',
      })
      .end(bytes);
  }
}
