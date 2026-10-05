import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

export function configureApp(app: INestApplication): INestApplication {
  const env = app.get<Env>(ENV);
  // In production the API is only reachable through nginx, so trust one proxy hop for client IPs.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();
  return app;
}
