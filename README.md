# Restaurant POS

POS, kitchen display, billing and back office for a single restaurant.

- Product spec: `docs/superpowers/specs/2026-10-03-restaurant-pos-prd-design.md`
- Visual PRD: `docs/prd-visual.html`

## Layout

| Path              | What                                            |
| ----------------- | ----------------------------------------------- |
| `apps/api`        | NestJS API, Prisma, PostgreSQL                  |
| `apps/web`        | React app: `/pos`, `/captain`, `/kds`, `/admin` |
| `apps/qr`         | React table-QR menu, served under `/qr/`        |
| `packages/shared` | Zod schemas and money helpers used by all apps  |

## Requirements

Node 24, pnpm 10.17.1, Docker.

## First run

```bash
pnpm install
docker compose up -d --wait postgres
cp apps/api/.env.example apps/api/.env
pnpm --filter @rpos/shared build
pnpm --filter @rpos/api exec prisma migrate dev
pnpm --filter @rpos/api db:seed
```

## Develop

Run each in its own terminal:

```bash
pnpm --filter @rpos/api dev
pnpm --filter @rpos/web dev
pnpm --filter @rpos/qr dev
```

- POS app: http://localhost:5173
- QR app: http://localhost:5174/qr/?t=demo
- API health: http://localhost:3000/api/health

After changing `packages/shared`, rebuild it with `pnpm --filter @rpos/shared build`.

## Checks

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm --filter @rpos/api test:e2e
pnpm build
```

## First owner (development)

Set `OWNER_PHONE` and `OWNER_PASSWORD` in `apps/api/.env`, then run `pnpm --filter @rpos/api db:seed`. Sign in at http://localhost:5173/login.

## Production build (local)

```bash
cp .env.prod.example .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build --wait
```

Open http://localhost:8080. Stop with `docker compose -f docker-compose.prod.yml --env-file .env.prod down`.

For a real server with HTTPS and backups, follow `docs/deploy.md`.
