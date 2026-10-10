import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { createMediaStorage, MEDIA_STORAGE } from './storage';

/** Image storage (Cloudflare R2 or a local folder) and MediaService, available to every module. */
@Global()
@Module({
  controllers: [MediaController],
  providers: [
    { provide: MEDIA_STORAGE, inject: [ENV], useFactory: (env: Env) => createMediaStorage(env) },
    MediaService,
  ],
  exports: [MEDIA_STORAGE, MediaService],
})
export class MediaModule {}
