import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { MediaController } from './media.controller';
import { createMediaStorage, MEDIA_STORAGE } from './storage';

/** Photo storage (Cloudflare R2 or a local folder), available to every module. */
@Global()
@Module({
  controllers: [MediaController],
  providers: [
    { provide: MEDIA_STORAGE, inject: [ENV], useFactory: (env: Env) => createMediaStorage(env) },
  ],
  exports: [MEDIA_STORAGE],
})
export class MediaModule {}
