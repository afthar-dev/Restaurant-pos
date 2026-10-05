import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ENV } from './config/config.module';
import type { Env } from './config/env';
import { configureApp } from './configure-app';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
}

void bootstrap();
