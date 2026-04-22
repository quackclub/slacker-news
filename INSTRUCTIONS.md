# Slacker News — CMS & Auth-Gated Publishing Implementation Guide

> **Audience:** A Claude agent (or developer) implementing the Payload CMS editorial pipeline and auth-gated Astro frontend for the Slacker News project.
>
> **Goal:** Articles never enter the Astro GitHub repo. Content lives in Payload CMS backed by PostgreSQL. The Astro site fetches content via API. Gated content is protected by SSR middleware.
>
> **Starting state:** A working Astro + Bun static site (`slacker-news`) and a freshly scaffolded Payload v3 blank app (`slacker-news-cms`) using PostgreSQL. Turborepo monorepo is optional but recommended.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Repository Structure](#2-repository-structure)
3. [Payload CMS Setup](#3-payload-cms-setup)
4. [Docker Compose](#4-docker-compose)
5. [Astro Changes](#5-astro-changes)
6. [Editorial Workflow](#6-editorial-workflow)
7. [Turborepo (Optional)](#7-turborepo-optional)
8. [Environment Variables Reference](#8-environment-variables-reference)
9. [Verification Checklist](#9-verification-checklist)
10. [Known Gotchas](#10-known-gotchas)

---

## 1. Architecture Overview

```
┌─────────────────────────┐     ┌──────────────────────────────┐
│   Payload CMS           │     │   Astro Site                 │
│   (Docker container)    │     │   (Docker container)         │
│                         │     │                              │
│  - Article editor       │────▶│  - Public pages: static      │
│  - Draft/review states  │ API │  - Gated pages: SSR +        │
│  - Role-based access    │     │    middleware auth check      │
│  - Media uploads (PDFs) │     │  - Fetches from Payload API  │
│  - Postgres backend     │     │                              │
└─────────────────────────┘     └──────────────────────────────┘
         │                                   │
         └──────── same Docker network ──────┘
                         │
               ┌─────────────────┐
               │   PostgreSQL    │
               │   (container)   │
               └─────────────────┘
```

**Key constraints:**
- Astro repo stays FOSS — zero article content in source code
- Content lives exclusively in Payload's PostgreSQL database
- Auth gating happens at the Astro SSR middleware layer
- Payload admin UI is the only editorial interface
- Docker network name `slacker-net` is used for internal service communication

---

## 2. Repository Structure

### Standalone (two separate repos)

```
~/projects/
├── slacker-news/           ← Astro site (existing, Bun)
└── slacker-news-cms/       ← Payload app (Node/npm)
```

### Monorepo with Turborepo (recommended)

```
slacker-news-monorepo/
├── apps/
│   ├── web/                ← Astro site (Bun)
│   └── cms/                ← Payload app (Node)
├── packages/
│   ├── types/              ← shared TypeScript types
│   └── payload-client/     ← shared API fetch wrapper
├── turbo.json
├── package.json            ← Bun workspaces
└── docker-compose.yml
```

If using the monorepo structure, replace all references to `slacker-news/` with `apps/web/` and `slacker-news-cms/` with `apps/cms/` throughout this guide.

---

## 3. Payload CMS Setup

All steps in this section are performed inside the `slacker-news-cms/` directory.

### 3.1 Verify scaffolded structure

```bash
ls src/
# expected output: app  collections  payload.config.ts  payload-types.ts
```

If `src/collections/` does not exist, create it:

```bash
mkdir -p src/collections
```

### 3.2 Create the Users collection

Create `src/collections/Users.ts`:

```ts
import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    useAsTitle: "email",
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "contributor",
      options: [
        { label: "Admin",       value: "admin" },
        { label: "Editor",      value: "editor" },
        { label: "Contributor", value: "contributor" },
      ],
    },
  ],
};
```

### 3.3 Create the Posts collection

Create `src/collections/Posts.ts`:

```ts
import type { CollectionConfig } from "payload";

export const Posts: CollectionConfig = {
  slug: "posts",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "author", "date"],
  },
  access: {
    // Unauthenticated API calls only see published posts
    read: ({ req }) => {
      if (req.user) return true;
      return { status: { equals: "published" } };
    },
    create: ({ req }) => !!req.user,
    update: ({ req }) => {
      if (!req.user) return false;
      if (req.user.role === "admin" || req.user.role === "editor") return true;
      // Contributors can only edit their own drafts
      return {
        and: [
          { author: { equals: req.user.id } },
          { status: { equals: "draft" } },
        ],
      };
    },
    delete: ({ req }) =>
      req.user?.role === "admin" || req.user?.role === "editor",
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "URL slug — auto-generated from title, editable.",
      },
      hooks: {
        beforeValidate: [
          ({ value, data }) => {
            if (value) return value;
            return data?.title
              ?.toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9-]/g, "");
          },
        ],
      },
    },
    {
      name: "excerpt",
      type: "textarea",
      required: true,
    },
    {
      name: "date",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: {
        date: { pickerAppearance: "dayOnly" },
      },
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
      defaultValue: ({ user }) => user?.id,
      admin: {
        condition: (_, __, { user }) =>
          user?.role === "admin" || user?.role === "editor",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft",      value: "draft" },
        { label: "In Review",  value: "review" },
        { label: "Published",  value: "published" },
        { label: "Archived",   value: "archived" },
      ],
      access: {
        // Only editors/admins can publish
        update: ({ req }) =>
          req.user?.role === "admin" || req.user?.role === "editor",
      },
    },
    {
      name: "reviewNotes",
      type: "textarea",
      label: "Review Notes",
      admin: {
        condition: (_, __, { user }) =>
          user?.role === "admin" || user?.role === "editor",
        description: "Visible to the contributor. Use to request changes.",
      },
    },
    {
      name: "gated",
      type: "checkbox",
      label: "Members only",
      defaultValue: false,
    },
    {
      name: "body",
      type: "richText",
      required: true,
    },
  ],
};
```

### 3.4 Update `payload.config.ts`

Replace the generated `src/payload.config.ts` entirely:

```ts
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { Posts } from "./collections/Posts";
import { Users } from "./collections/Users";

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? "change-me-in-production",
  serverURL: process.env.PAYLOAD_URL ?? "http://localhost:3000",

  admin: {
    user: Users.slug,
  },

  collections: [Users, Posts],

  editor: lexicalEditor({}),

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI,
    },
  }),

  cors: [
    process.env.ASTRO_URL ?? "http://localhost:4321",
  ],

  csrf: [
    process.env.ASTRO_URL ?? "http://localhost:4321",
  ],
});
```

> **Note:** The import paths use `./collections/Posts` not `../collections/Posts` because `payload.config.ts` is already inside `src/`.

### 3.5 Update `.env`

Check what Payload generated and ensure these keys are present:

```bash
# slacker-news-cms/.env
DATABASE_URI=postgres://postgres:localdev@127.0.0.1:5432/slacker-news-cms
PAYLOAD_SECRET=your-long-random-secret
PAYLOAD_URL=http://localhost:3000
ASTRO_URL=http://localhost:4321
```

### 3.6 Start Postgres for local dev

If no local Postgres is running, start one with Docker:

```bash
docker run -d \
  --name slacker-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=localdev \
  -e POSTGRES_DB=slacker-news-cms \
  -p 5432:5432 \
  postgres:16-alpine
```

### 3.7 First run + migration

```bash
cd slacker-news-cms
bun run dev
```

On first run, Payload will:
1. Connect to Postgres
2. Run its initial migration, creating all tables
3. Prompt you to create a root admin user in the terminal

Navigate to `http://localhost:3000/admin` and complete admin user creation in the UI.

### 3.8 Generate an API key for Astro

In the Payload admin:
1. Go to **Settings → API Keys**
2. Create a new key with read-only scope
3. Copy the key into your Astro `.env` as `PAYLOAD_API_KEY`

### 3.9 Payload Dockerfile

Create `slacker-news-cms/Dockerfile`:

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

FROM base AS builder
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 4. Docker Compose

Create `docker-compose.yml` at the project root (parent of both app directories):

```yaml
services:

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: slacker
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: slacker_news
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - slacker-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U slacker"]
      interval: 10s
      timeout: 5s
      retries: 5

  payload:
    build:
      context: ./slacker-news-cms
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URI: postgres://slacker:${POSTGRES_PASSWORD}@postgres:5432/slacker_news
      PAYLOAD_SECRET: ${PAYLOAD_SECRET}
      PAYLOAD_URL: http://payload:3000
      ASTRO_URL: http://astro:80
    ports:
      - "3000:3000"
    networks:
      - slacker-net

  astro:
    build:
      context: ./slacker-news
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      - payload
    environment:
      PAYLOAD_INTERNAL_URL: http://payload:3000
      PUBLIC_PAYLOAD_URL: ${PAYLOAD_PUBLIC_URL}
      PAYLOAD_API_KEY: ${PAYLOAD_API_KEY}
    ports:
      - "8080:80"
    networks:
      - slacker-net

networks:
  slacker-net:

volumes:
  postgres_data:
```

Create `.env` alongside `docker-compose.yml` (add to `.gitignore`):

```bash
POSTGRES_PASSWORD=choose-a-strong-password
PAYLOAD_SECRET=choose-a-long-random-string
PAYLOAD_PUBLIC_URL=https://cms.yoursite.com
PAYLOAD_API_KEY=paste-key-from-payload-admin
```

---

## 5. Astro Changes

All steps in this section are performed inside the `slacker-news/` directory.

### 5.1 Install the Node adapter

```bash
bun add @astrojs/node
```

### 5.2 Update `astro.config.mjs`

```js
import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "hybrid",         // static by default, SSR opt-in per page
  adapter: node({ mode: "standalone" }),
});
```

### 5.3 Create the Payload API client

Create `src/lib/payload.ts`:

```ts
// Use internal Docker URL when running server-side, public URL client-side
const PAYLOAD_URL =
  import.meta.env.SSR
    ? (import.meta.env.PAYLOAD_INTERNAL_URL ?? "http://localhost:3000")
    : (import.meta.env.PUBLIC_PAYLOAD_URL ?? "http://localhost:3000");

const API_KEY = import.meta.env.PAYLOAD_API_KEY ?? "";

// ---- Types ----------------------------------------

export type PostStatus = "draft" | "review" | "published" | "archived";

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  status: PostStatus;
  gated: boolean;
  body: unknown;       // Lexical rich text AST — serialize before rendering
  author: { name: string };
  reviewNotes?: string;
}

interface PayloadListResponse<T> {
  docs: T[];
  totalDocs: number;
  page: number;
  totalPages: number;
}

// ---- Fetch helper ----------------------------------------

async function payloadFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${PAYLOAD_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `users API-Key ${API_KEY}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Payload API error: ${res.status} on ${path}`);
  }

  return res.json();
}

// ---- Public queries (build time or SSR) ----------------------------------------

export async function getPublishedPosts(): Promise<Post[]> {
  const data = await payloadFetch<PayloadListResponse<Post>>(
    "/posts?where[status][equals]=published&sort=-date&limit=100"
  );
  return data.docs;
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  const data = await payloadFetch<PayloadListResponse<Post>>(
    `/posts?where[slug][equals]=${encodeURIComponent(slug)}&limit=1`
  );
  return data.docs[0] ?? null;
}

// ---- Auth (SSR only) ----------------------------------------

export async function verifySession(cookie: string): Promise<boolean> {
  try {
    const data = await payloadFetch<{ user?: { id: string } }>(
      "/users/me",
      { headers: { Cookie: cookie } }
    );
    return !!data.user;
  } catch {
    return false;
  }
}
```

### 5.4 Create auth middleware

Create `src/middleware.ts`:

```ts
import { defineMiddleware } from "astro:middleware";
import { verifySession } from "./lib/payload";

// Path prefixes that require authentication
const GATED_PREFIXES = ["/members", "/reports"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  const isGated = GATED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!isGated) return next();

  const cookie = context.request.headers.get("cookie") ?? "";
  const authenticated = await verifySession(cookie);

  if (authenticated) return next();

  const loginURL = new URL(
    `${import.meta.env.PUBLIC_PAYLOAD_URL}/admin/login`
  );
  loginURL.searchParams.set("redirect", context.url.href);
  return context.redirect(loginURL.toString());
});
```

### 5.5 Update post pages

Replace filesystem reads with Payload API calls.

**`src/pages/[slug].astro`** — SSR, per-post auth check:

```astro
---
export const prerender = false;

import { getPostBySlug, verifySession } from "../lib/payload";
import BaseLayout from "../layouts/BaseLayout.astro";

const { slug } = Astro.params;
const post = await getPostBySlug(slug ?? "");

if (!post) return Astro.redirect("/404");

if (post.gated) {
  const cookie = Astro.request.headers.get("cookie") ?? "";
  const ok = await verifySession(cookie);
  if (!ok) {
    const loginURL = new URL(`${import.meta.env.PUBLIC_PAYLOAD_URL}/admin/login`);
    loginURL.searchParams.set("redirect", Astro.url.href);
    return Astro.redirect(loginURL.toString());
  }
}
---

<BaseLayout title={post.title}>
  <article>
    <h1>{post.title}</h1>
    <time datetime={post.date}>
      {new Date(post.date).toLocaleDateString()}
    </time>
    <p class="excerpt">{post.excerpt}</p>
    <p class="author">By {post.author?.name}</p>
    <div class="body">
      {/* TODO: render post.body with Lexical serializer — see section 5.6 */}
    </div>
  </article>
</BaseLayout>
```

**`src/pages/index.astro`** — static, public post listing:

```astro
---
export const prerender = true;

import { getPublishedPosts } from "../lib/payload";
const posts = await getPublishedPosts();
---
```

### 5.6 Render Lexical rich text

Payload's body field is a Lexical JSON AST. Install the serializer:

```bash
bun add @payloadcms/richtext-lexical
```

Create `src/lib/lexical.ts`:

```ts
import {
  convertLexicalToHTML,
  consolidateHTMLConverters,
  defaultEditorConfig,
  defaultEditorFeatures,
} from "@payloadcms/richtext-lexical";

export async function renderBody(lexicalData: unknown): Promise<string> {
  if (!lexicalData) return "";

  const html = await convertLexicalToHTML({
    converters: consolidateHTMLConverters({
      editorConfig: defaultEditorConfig,
      features: defaultEditorFeatures,
    }),
    // @ts-expect-error — Payload types vary between versions
    data: lexicalData,
  });

  return html;
}
```

Then in your `[slug].astro`:

```astro
---
import { renderBody } from "../lib/lexical";
const bodyHTML = await renderBody(post.body);
---

<div class="body" set:html={bodyHTML} />
```

### 5.7 Update `.env` for Astro

```bash
# slacker-news/.env
PAYLOAD_INTERNAL_URL=http://localhost:3000   # direct in dev, Docker hostname in prod
PUBLIC_PAYLOAD_URL=https://cms.yoursite.com  # always the public URL
PAYLOAD_API_KEY=paste-key-from-payload-admin
```

> `PUBLIC_` prefix makes the variable available in client-side code. `PAYLOAD_INTERNAL_URL` and `PAYLOAD_API_KEY` are server-only and must NOT have the `PUBLIC_` prefix.

---

## 6. Editorial Workflow

### Status state machine

```
[draft] ──contributor saves──▶ [review] ──editor requests changes──▶ [draft]
                                    │
                                    └──editor approves──▶ [published]
                                                               │
                                                               └──▶ [archived]
```

### Role capabilities

| Action | Contributor | Editor | Admin |
|---|---|---|---|
| Create post | ✓ | ✓ | ✓ |
| Edit own draft | ✓ | ✓ | ✓ |
| Edit others' posts | ✗ | ✓ | ✓ |
| Submit for review (draft → review) | ✓ | ✓ | ✓ |
| Publish (review → published) | ✗ | ✓ | ✓ |
| Archive | ✗ | ✓ | ✓ |
| Add review notes | ✗ | ✓ | ✓ |
| Delete | ✗ | ✓ | ✓ |
| Manage users | ✗ | ✗ | ✓ |

### Day-to-day flow

```
1. Contributor logs into cms.yoursite.com/admin
2. Creates a new post — status defaults to "Draft"
3. Writes content, fills title/excerpt/date
4. Changes status to "In Review", saves
5. Editor sees post appear in the "In Review" filtered list
6. Editor reads the post:
   a. Needs changes → adds Review Notes, sets back to "Draft"
      → Contributor is notified (see section 6.1), revises, resubmits
   b. Approved → sets status to "Published"
      → Post is immediately live via the Payload API
      → Astro serves it on the next request (SSR) or next build (static)
```

### 6.1 Optional: email notifications on status change

Add a hook to `Posts.ts` to notify on submission and review decisions:

```ts
// add to Posts collection config, alongside `fields`
hooks: {
  afterChange: [
    async ({ doc, previousDoc }) => {
      if (doc.status === previousDoc?.status) return;

      // plug in Nodemailer, Resend, or any email provider here
      console.log(
        `Post "${doc.title}" status changed: ${previousDoc?.status} → ${doc.status}`
      );
    },
  ],
},
```

---

## 7. Turborepo (Optional)

Follow this section only if consolidating into a monorepo.

### 7.1 Scaffold the monorepo

```bash
mkdir slacker-news-monorepo && cd slacker-news-monorepo
mkdir -p apps packages/types packages/payload-client

# move existing apps in
mv ../slacker-news apps/web
mv ../slacker-news-cms apps/cms
```

### 7.2 Root `package.json`

```json
{
  "name": "slacker-news-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "check": "turbo check"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  },
  "packageManager": "bun@1.2.9"
}
```

### 7.3 `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**", ".astro/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "check": {
      "dependsOn": ["^build"]
    }
  }
}
```

The `^build` dependency means `packages/types` builds before `apps/cms`, which builds before `apps/web`. This ordering is required.

### 7.4 Shared types package

Create `packages/types/src/index.ts`:

```ts
export type PostStatus = "draft" | "review" | "published" | "archived";

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  date: string;
  status: PostStatus;
  gated: boolean;
  body: unknown;
  author: { name: string };
  reviewNotes?: string;
}
```

Create `packages/types/package.json`:

```json
{
  "name": "@slacker-news/types",
  "version": "0.0.1",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

Import in both apps:

```ts
import type { Post } from "@slacker-news/types";
```

### 7.5 Install from monorepo root

```bash
bun install   # installs all workspaces from root
```

---

## 8. Environment Variables Reference

### `slacker-news-cms/.env`

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URI` | Postgres connection string | `postgres://user:pass@host:5432/db` |
| `PAYLOAD_SECRET` | JWT signing secret — keep private | random 32+ char string |
| `PAYLOAD_URL` | Public URL of the CMS itself | `https://cms.yoursite.com` |
| `ASTRO_URL` | URL of the Astro site (for CORS) | `https://yoursite.com` |

### `slacker-news/.env`

| Variable | Description | Example |
|---|---|---|
| `PAYLOAD_INTERNAL_URL` | Internal URL (Docker network) | `http://payload:3000` |
| `PUBLIC_PAYLOAD_URL` | Public URL for client-side redirects | `https://cms.yoursite.com` |
| `PAYLOAD_API_KEY` | Server-to-server API key | generated in Payload admin |

### `docker-compose.yml` root `.env`

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Database password |
| `PAYLOAD_SECRET` | Same as CMS secret |
| `PAYLOAD_PUBLIC_URL` | Public CMS URL |
| `PAYLOAD_API_KEY` | Same key injected into Astro |

---

## 9. Verification Checklist

Work through these in order. Do not proceed to the next step if the current one fails.

### Payload CMS

- [ ] `bun run dev` starts without errors in `slacker-news-cms/`
- [ ] `http://localhost:3000/admin` loads the Payload admin UI
- [ ] Admin user created successfully
- [ ] Collections visible: **Posts** and **Users** appear in the sidebar
- [ ] Can create a test post with status "Published"
- [ ] API returns the post: `curl http://localhost:3000/api/posts` returns JSON with `docs` array
- [ ] Unauthenticated API only returns published posts (test by creating a draft and checking it's absent)
- [ ] API key generated and copied

### Astro site

- [ ] `bun run dev` starts without errors in `slacker-news/`
- [ ] `src/lib/payload.ts` compiles without TypeScript errors
- [ ] `src/middleware.ts` compiles without TypeScript errors
- [ ] `http://localhost:4321` loads the homepage
- [ ] Homepage fetches and lists the test post created above
- [ ] `http://localhost:4321/your-test-slug` renders the post
- [ ] A post marked `gated: true` redirects to Payload login when accessed without a session
- [ ] Lexical body renders as HTML (not raw JSON)

### Docker

- [ ] `docker compose build` completes without errors
- [ ] `docker compose up` starts all three services
- [ ] `curl -I http://localhost:8080` returns `200`
- [ ] `curl -I http://localhost:3000/admin` returns `200`
- [ ] Post created in Payload appears on `http://localhost:8080`

---

## 10. Known Gotchas

**Payload runs on Next.js, not standalone Node.**
The Dockerfile uses `npm start` which runs the Next.js server. Do not try to run `node dist/server.js` — there is no standalone server output by default in Payload v3.

**`bun run dev` vs `npm run dev` in CMS.**
Bun can install Payload's dependencies and run its scripts, but Payload's build tooling internally uses Node. If you hit runtime errors with Bun, fall back to `npm run dev` inside `slacker-news-cms/`. The Astro site always uses Bun.

**`PUBLIC_` prefix is mandatory for client-side env vars in Astro.**
`PAYLOAD_INTERNAL_URL` must NOT have the prefix — it's server-only and contains an internal Docker hostname that would be meaningless to a browser. `PUBLIC_PAYLOAD_URL` must have it because the middleware redirect URL is constructed client-side.

**Lexical AST is not HTML.**
`post.body` from the API is a JSON object, not a string. Rendering it with `set:html` directly will output `[object Object]`. Always pass it through `renderBody()` from `src/lib/lexical.ts` first.

**CORS must be set before first production deployment.**
The `cors` and `csrf` arrays in `payload.config.ts` must include your Astro site's production domain. Forgetting this causes silent API failures in production while local dev works fine.

**Slug uniqueness is enforced at the database level.**
If you create two posts with the same title before either has a custom slug set, the second save will throw a Postgres unique constraint error. Always set slugs explicitly for programmatically created posts.

**API key scope.**
The API key generated for Astro should be read-only. Do not use the root admin credentials as the API key — if the key is ever exposed, a read-only key limits the blast radius.

---

## Next Steps (out of scope for this guide)

- **Typst/PDF report collection** — a second Payload collection with a `file` upload field + relationship to a metadata record, using the same access control pattern
- **Email notifications** — hook into `afterChange` on Posts to send Nodemailer/Resend emails when status transitions occur
- **Cloudflare Access** — put Cloudflare in front of the Payload admin port (`3000`) so only your team can reach the editorial UI without VPN
- **Payload media library for images** — swap `tina.media` for Payload's built-in upload collection, configuring S3-compatible storage for production
