# Slacker News Monorepo

This repository now contains:

- `apps/web`: the Astro frontend, now backed by Payload instead of filesystem posts
- `apps/cms`: the Payload CMS app backed by PostgreSQL
- `packages/types`: shared content types
- `packages/payload-client`: shared API client helpers used by the Astro app

## Development

Install workspace dependencies from the repo root:

```bash
bun install
```

Start the Astro app:

```bash
bun run dev:web
```

Start the Payload CMS:

```bash
bun run dev:cms
```

Run both in parallel with Turborepo:

```bash
bun run dev
```

## Environment

Copy these templates as needed:

- `.env.example`
- `apps/web/.env.example`
- `apps/cms/.env.example`

## Docker

Build and run the full stack:

```bash
docker compose up --build
```
