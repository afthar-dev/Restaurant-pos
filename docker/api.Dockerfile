FROM node:24-alpine AS base
RUN apk add --no-cache openssl && npm install -g pnpm@10.17.1
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rpos/shared build \
 && pnpm --filter @rpos/api exec prisma generate \
 && pnpm --filter @rpos/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
