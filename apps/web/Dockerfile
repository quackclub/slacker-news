FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY apps/cms/package.json apps/cms/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/payload-client/package.json packages/payload-client/package.json
RUN bun install --frozen-lockfile

COPY . .
RUN bun run --filter @slacker-news/web build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
