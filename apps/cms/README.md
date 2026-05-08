# Payload CMS (slacker-news-cms)

This directory holds the Payload v3 editorial app that feeds content to the Astro frontend in `apps/web`. Content lives in PostgreSQL and is never committed to Git.

## Local development

1. Start PostgreSQL (docker run or `docker compose up postgres`).
2. Copy `apps/cms/.env.example` → `.env` (or use the one that already exists) and set real secrets.
3. Run `bun run dev`. The first run will migrate the database and prompt for an admin user.
4. Visit `http://localhost:3000/admin` to log in and create articles.

## Key Collections

- `Users` (auth collection) – includes `role` saved to JWTs so access control can read user roles server-side.
- `Posts` – rich text (Lexical) body, review workflow statuses, gated flag, slug hooks, and review notes.

## Deploying

The Dockerfile builds the Next.js (Payload) admin UI and runs `bun run start`.

## Environment variables

See the monorepo root `.env` for shared secret values. Make sure the same `DATABASE_URI`, `PAYLOAD_SECRET`, and `PAYLOAD_URL` are used locally and in production.

## Notes

- API keys are generated per user (enable them via the Users admin UI) and are injected into the Astro app via `PAYLOAD_API_KEY`.
- The Lexical rich text field uses the `@payloadcms/richtext-lexical` editor, which must also be installed in `apps/web` for serialization.
