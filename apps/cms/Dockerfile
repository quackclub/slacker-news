FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock turbo.json ./
COPY apps/cms/package.json apps/cms/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/payload-client/package.json packages/payload-client/package.json
RUN bun install --frozen-lockfile

COPY . .
RUN bun run --filter @slacker-news/cms build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/cms ./
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "run", "start:with-migrate"]
