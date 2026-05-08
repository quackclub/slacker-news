FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY apps/cms ./apps/cms
RUN bun --cwd apps/cms run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/cms ./apps/cms

EXPOSE 3000
CMD ["bun", "--cwd", "apps/cms", "run", "start"]
