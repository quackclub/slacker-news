FROM oven/bun:1.3.12-alpine AS base
RUN apk add --no-cache libc6-compat nodejs
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

FROM base AS builder
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
RUN bun install
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1024 --no-deprecation"
ENV NEXT_PRIVATE_BUILD_WORKER=1
RUN bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/scripts/seed-trigger.mjs ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules /app/node_modules
USER nextjs
EXPOSE 6766
ENV PORT=6766
CMD ["sh", "-c", "/usr/bin/node /app/node_modules/.bin/payload migrate && bun run start & sleep 8 && /usr/bin/node seed-trigger.mjs && wait"]