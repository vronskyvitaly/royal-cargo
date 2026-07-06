# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Royal Cargo — web app for generating and publishing SEO articles from call transcripts. Managers view transcripts → generate articles via Claude AI → editors review/approve → articles publish to WordPress or Megagroup.

## Development Commands

### Server (Express 5 + TypeScript)
```bash
cd server
npm run dev      # tsx watch — hot reload
npm run build    # tsc → dist/
npm start        # node dist/index.js
```

### Frontend (Next.js 16)
```bash
cd frontend
npm run dev      # next dev
npm run build    # next build
npm run lint     # eslint
npx tsc --noEmit # type-check without building
```

### Local dev
Two terminals: `cd server && npm run dev` + `cd frontend && npm run dev`. App at http://localhost:3000.

## Architecture

### Request Flow
All frontend HTTP requests use **relative paths** (`/api/...`). Next.js rewrites proxy them to the Express server at `SERVER_URL` (runtime env var, not build-time). This avoids NEXT_PUBLIC_* build-time issues.

```
Browser → Next.js rewrite → Express :4000
/api/*           →  SERVER_URL/api/*
/socket.io/*     →  SERVER_URL/socket.io/*  (polling only — WebSocket upgrade not supported through proxy)
```

Key config in `frontend/next.config.ts`: `output: "standalone"`, `skipTrailingSlashRedirect: true` (Socket.IO requires trailing slash `/socket.io/`).

### Auth
- JWT stored in `localStorage` as `rc_token`; 30-day expiry
- Login requires email + password + `appSecret` (app-wide code stored in `settings` DB table or `APP_SECRET` env var)
- `AuthContext` (`src/context/AuthContext.tsx`) wraps the app; `Guard` component redirects unauthenticated users to `/login`
- Server: `requireAuth` middleware populates `req.user` with `{ userId, email, name, role }`

### Socket.IO
- Client: singleton `getSocket()` in `src/lib/socket.ts` — connects with `transports: ["polling"]` (no WebSocket)
- All article mutations emit events: `article:created`, `article:updated`, `article:published`, `article:deleted`
- Article generation is **async** — POST `/api/articles/generate` returns `202` immediately, article arrives via `article:created` socket event when Claude finishes

### Article Generation (async)
The `/generate` endpoint returns `202` right away and runs Claude in a background IIFE. This prevents Next.js proxy timeout (`ECONNRESET`) when Claude takes >30s. The transcript detail page listens for `article:created` (matching `transcript_id`) to redirect.

### Database
PostgreSQL. No migration framework — schema changes use `ALTER TABLE ... IF NOT EXISTS` queries run at server startup (in `server/src/index.ts`). The `db.ts` overrides the `pg` timestamp parser to append `+03:00` (Moscow timezone) because timestamps are stored as `TIMESTAMP WITHOUT TIME ZONE` in Moscow local time.

Key tables: `users`, `call_transcripts`, `articles`, `article_comments`, `article_history`, `settings`.

### API client (`frontend/src/lib/api.ts`)
All HTTP helpers (`get`, `post`, `put`, `patch`, `del`) use relative `BASE = ""`. The `patch` helper is used for comment resolve; `put` for article updates.

### Responsive Layout Pattern
Pages use dual-layout: mobile cards (`sm:hidden`) + desktop table (`hidden sm:block`). Custom breakpoint `xs: 420px` defined in `globals.css` `@theme inline`. Tailwind v4 with `@theme inline` for custom tokens.

## Deployment (Coolify)

Credentials in root `.env`:
- `COOLIFY_HOST=http://213.136.66.25:8000`
- `COOLIFY_TOKEN=...`

App UUIDs:
- Frontend: `ssrmfbo2c1cn2pkvl5pm3na5`
- Server: `rq14xdaa91pxh55tzthyzjla`

**Auto-deploy is NOT configured.** Trigger manually after push:
```bash
curl -X GET "http://213.136.66.25:8000/api/v1/deploy?uuid=<app_uuid>&force=false" \
  -H "Authorization: Bearer $COOLIFY_TOKEN"
```

Production URLs:
- Frontend: `https://agentelevenfront.tamozhennybrokeragents.ru`
- Server: `https://agentelevenserver.tamozhennybrokeragents.ru`

**Critical server env vars** (set in Coolify, not in repo):
- `DATABASE_URL` — internal Coolify hostname (not external IP)
- `JWT_SECRET`, `APP_SECRET`, `CLAUDE_API_KEY`
- `WP_URL`, `WP_USER`, `WP_APP_PASSWORD` (WordPress publish)
- `MEGAGROUP_API_URL`, `MEGAGROUP_API_KEY`
- `FRONTEND_URL` — for CORS and Socket.IO allowed origins

Frontend only needs `SERVER_URL` (runtime) pointing to the server's internal URL.
