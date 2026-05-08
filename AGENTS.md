# AGENTS.md — Slacker News Monorepo

## Project Overview

Slacker News now lives in a Bun/Turbo monorepo. Editorial content is authored inside the Payload CMS at `apps/cms`, stored in PostgreSQL, and exposed via Payload's REST API. The static site (`apps/web`) is an Astro 6 app that fetches published articles from Payload instead of committing Markdown files. Member-only posts are protected by Astro middleware backed by Payload sessions.

## Essential Commands (run from repo root)

```bash
bun install              # install deps for all workspaces (turbo + apps)
bun run dev              # turbo dev (runs both web + cms)
bun run dev:web          # dev only the Astro frontend (uses Payload API)
bun run dev:cms          # dev only the Payload CMS admin UI
bun run build            # turbo build (apps + packages)
bun run check            # turbo check
```

You can also run `bun run dev` inside `apps/web` or `apps/cms` individually if you only need one workspace. Both apps expect Bun 1.2.9+. Never use npm/yarn inside the monorepo.

## Directory Layout

```
/apps/
  /web/      ← Astro + @astrojs/node (hybrid) frontend
    ├── src/ ── layouts, components, legacy styles
    ├── data/ ── site metadata and changelog summaries
    └── pages/ ── landing, archives, stats, feed, auth middleware
  /cms/      ← Payload v3 Next.js app with Postgres + Lexical editor
    ├── src/collections/{Users,Posts}.ts
    └── payload.config.ts + payload-types.ts
/packages/
  /types/        ← shared Post/PostStatus types
  /payload-client/← shared helper for fetching Payload APIs (optional)
root         ← turbo.json, package.json, bun.lock, docker-compose
```

## Payload CMS (apps/cms)

- Collections: `Users` (auth-enabled, `role` saved to JWT) and `Posts` (title, slug, excerpt, date, status workflow, gated flag, Lexical body, review notes). Access control lets editors/admins publish while contributors can edit their own drafts.
- Config: `payload.config.ts` wires in `postgresAdapter`, the Lexical editor globally, and CORS/CSRF origins pointing at the Astro URL (`ASTRO_URL`).
- Run: `cd apps/cms && bun run dev`. First run migrates Postgres and prompts to create the root admin.
- Environment: `apps/cms/.env` holds `DATABASE_URI`, `PAYLOAD_SECRET`, `PAYLOAD_URL`, `ASTRO_URL`. Copy `apps/cms/.env.example` and replace secrets.
- API keys: enable the API key toggle on a user record to generate `PAYLOAD_API_KEY` for Astro.
- Deploy: `apps/cms/Dockerfile` builds and runs `bun run start`.

## Astro Frontend (apps/web)

- Uses `@astrojs/node` in hybrid mode (server-side rendering enabled per page) so it can call Payload APIs and run middleware.
- `src/lib/payload.ts` talks to Payload: fetching published posts, single posts, and verifying sessions. Lexical bodies are rendered via `@payloadcms/richtext-lexical` helpers.
- Middleware (`src/middleware.ts`) protects `/members` and `/reports` routes by redirecting unauthenticated requests to Payload's login page.
- `src/pages/[slug].astro` is SSR and fetches each post by slug, redirecting gated posts if the session is not authenticated.
- Environment: `apps/web/.env` should set `PAYLOAD_INTERNAL_URL` (Docker internal host) and `PUBLIC_PAYLOAD_URL` (public CMS URL). `PAYLOAD_API_KEY` is required for server-to-server auth (no `PUBLIC_` prefix).
- Build: `bun run build` produces `dist/`; `apps/web/Dockerfile` packages the static output into an nginx container that `docker-compose` can reuse.

-## Shared Infrastructure

- `docker-compose.yml` at the repo root wires up Postgres, Payload, and Astro on the `slacker-net` network. Copy `.env.example` to `.env`, fill in the secrets (Postgres password, Payload secret/API key, Astro hostname), and then `docker compose up --build`. The service ports are 8080 (Astro) and 3000 (Payload admin); bring everything down with `docker compose down`.
- `packages/types` exposes the `Post`/`PostStatus` shapes so both apps can import from `@slacker-news/types`.
- Use Bun across the stack. When running Payload CLI commands, use `bunx payload ...`.
- `packages/types` exposes the `Post`/`PostStatus` shapes so both apps can import from `@slacker-news/types`.
- Use Bun across the stack. When running Payload CLI commands, use `bunx payload ...`.

## Known Gotchas

- `role.saveToJWT` is required or access control sees `req.user.role` as `undefined`.
- The initial admin user may not have a `role`; update it via SQL (`UPDATE users SET role = 'admin' WHERE email = 'you@example.com';`).
- The `body` field must declare `editor: lexicalEditor({})`; otherwise the editor never renders and saves fail.
- Lexical AST must be serialized (use `renderBody` helpers) before rendering it into HTML.
- `PUBLIC_` prefix is mandatory for env vars used in client-side code; server-only secrets must not have it.
- Slugs must be unique; the database enforces a unique constraint.
- Use a dedicated API-key user account so production keys can be rotated without disabling admin logins.
