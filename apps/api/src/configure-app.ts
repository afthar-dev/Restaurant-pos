import type { INestApplication } from '@nestjs/common';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

export function configureApp(app: INestApplication): INestApplication {
  const env = app.get<Env>(ENV);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();
  return app;
}
