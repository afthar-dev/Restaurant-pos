import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';

describe('GET /api/health', () => {
  describe('with a reachable database', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = configureApp(moduleRef.createNestApplication());
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 200 ok', async () => {
      await request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect({ status: 'ok', db: 'up' });
    });

    it('allows a configured origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('does not allow an unknown origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'https://evil.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('with the database down', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue({
          $queryRaw: () => Promise.reject(new Error('ECONNREFUSED')),
          $disconnect: async () => undefined,
        })
        .compile();
      app = configureApp(moduleRef.createNestApplication());
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 503 with db down', async () => {
      await request(app.getHttpServer())
        .get('/api/health')
        .expect(503)
        .expect({ status: 'error', db: 'down' });
    });
  });
});
