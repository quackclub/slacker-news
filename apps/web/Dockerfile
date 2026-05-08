FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY apps/web ./apps/web
RUN bun --cwd apps/web run build

FROM nginx:alpine
COPY --from=base /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
