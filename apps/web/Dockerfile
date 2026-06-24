FROM oven/bun:1.3.12-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY astro.config.mjs tsconfig.json ./
COPY src/ src/
COPY public/ public/
RUN bun run build

FROM oven/bun:1.3.12-alpine AS runner
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
ENV HOST=0.0.0.0 PORT=80
EXPOSE 80
CMD ["bun", "dist/server/entry.mjs"]