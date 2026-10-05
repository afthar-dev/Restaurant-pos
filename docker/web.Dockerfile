FROM node:24-alpine AS build
RUN npm install -g pnpm@10.17.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rpos/shared build \
 && pnpm --filter @rpos/web build \
 && pnpm --filter @rpos/qr build

FROM nginx:stable-alpine
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html/web
COPY --from=build /app/apps/qr/dist /usr/share/nginx/html/qr
