# Slacker News Monorepo

This repository now hosts both the Astro frontend (`apps/web`) and the Payload CMS (`apps/cms`).

- `apps/web`: Astro 6 hybrid site. The frontend fetches published posts from Payload via the API and renders gated articles through SSR + middleware.
- `apps/cms`: Payload v3 Next.js app backed by PostgreSQL. Editorial content is created here, stored in the database, and never checked into Git.
- `packages/`: workspace packages for shared TypeScript types or utility clients.

Run `bun install` at the root to install both workspaces, then use the turbo scripts (`bun run dev`, `bun run build`, `bun run check`).

Use the included `docker-compose.yml` to spin up Postgres, Payload, and Astro in one network (see the “Docker Compose stack” section below).  
See `AGENTS.md` for more detailed instructions.

## Docker Compose stack

1. Copy `.env.example` to `.env` and fill in real secrets (Postgres password, Payload secret, API key, etc.).
2. Run `docker compose up --build` from the repo root.
3. Visit `http://localhost:8080` for Astro and `http://localhost:3000/admin` for Payload.

Services:

- `postgres` — Postgres 16 with data stored in the `postgres_data` volume.
- `payload` — Payload CMS connected to Postgres via `DATABASE_URI`; exposes admin UI on port 3000.
- `astro` — Astro static build served by nginx on port 8080; reads published posts through the Payload API.

Stop everything with `docker compose down`.
