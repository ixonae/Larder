# Larder — agent guide

Larder is a self-hosted app to manage a home bar. The full plan, data model and step list live in
`docs/implementation-plan.md`, a local file that is not committed (it is in `.gitignore`). When it is
present, read it before starting a step; this file summarises the rules you must follow on every change.

## Commands

- `pnpm install` — Node 26.13.1 (`.nvmrc`) and pnpm 12 (`packageManager`) are required.
- `pnpm dev` — run every app in watch mode.
- `pnpm lint` / `pnpm format` — Biome check / fix.
- `pnpm typecheck` — TypeScript in every package.
- `pnpm test` / `pnpm test:coverage` — Vitest across the workspace; coverage must stay at **100%**.

`pnpm lint && pnpm typecheck && pnpm test:coverage` must pass before a step is done.

## Layout

- `apps/api` — Hono server. `routes` (HTTP + Zod) → `service` (rules, gets `ctx = { db, userId, barId }`) → `repo` (Drizzle). Routes never touch Drizzle.
- `apps/web` — React SPA (Vite, TanStack Router/Query, shadcn/ui, Tailwind).
- `packages/shared` — Zod schemas, DTO types and pure logic shared by both apps.

## Conventions

- TypeScript is strict ESM with `noUncheckedIndexedAccess`. The API and `shared` have no build step:
  Node runs the `.ts` sources directly (type stripping), so relative imports use the `.ts`
  extension and only erasable syntax is allowed (no `enum`, no `namespace`, no parameter properties).
  `tsc` is only used for type checking.
- Every request/response body is a Zod schema in `packages/shared`; the web app reuses them for forms
  and talks to the API through Hono's typed RPC client.
- IDs are UUIDv7 strings generated in the app. Timestamps are ISO-8601 UTC text (`created_at`, `updated_at`).
- Multi-tenant from day one: every domain table has `bar_id` (indexed FK) and `created_by`; every repo
  query filters by `bar_id`; routes live under `/api/bars/:barId/...`.
- Store user-facing names as entered with `COLLATE NOCASE`. Use the deterministic SQLite function
  `larder_name_key(name)` for name ordering and scoped uniqueness indexes. It applies Unicode NFC
  and locale-independent lowercase, preserving accents. For categories, use the key in both the
  root and sibling partial unique indexes.
- Errors use one shape: `{ error: { code, message, details? } }` with codes `VALIDATION`, `NOT_FOUND`,
  `CONFLICT`, `UNAUTHORIZED`, `FORBIDDEN`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `INTERNAL`,
  `UNAVAILABLE`.
- Deletes that would orphan data are refused with `CONFLICT`, listing what uses the item. No soft delete.
- Multi-row writes happen in one transaction.
- Lists support `?q=`, filters and `?limit=&cursor=` pagination, sorted by name by default.
- Mobile first: design every screen for a phone, then widen for desktop.

## Testing

- Backend tests hit a real in-memory SQLite database through `app.request()`; never mock Drizzle.
- Frontend tests use Testing Library + MSW and check behaviour, not implementation.
- Coverage exclusions are listed in `vitest.config.ts` and nowhere else. Any other exclusion needs a
  `/* v8 ignore next */` with a comment saying why, called out in the PR.
- The must-have named scenarios (cross-bar isolation, duplicates, transactional updates, refused deletes,
  backup/restore, auth) are listed in section 2.3 of the plan.

## Working agreement

1. One step = one branch = one PR; target under ~600 changed lines (lockfile and migrations excluded).
2. Schema changes ship with their generated Drizzle migration in the same PR.
3. The PR description lists what was done, what was left out, and how to try it manually.
4. No dependencies outside the plan's stack table without saying why in the PR.
