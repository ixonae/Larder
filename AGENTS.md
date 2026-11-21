# Larder — contributor guide

Larder is a self-hosted app for managing home bars. See [README.md](README.md) for setup and usage.
This guide covers the repository layout, coding conventions and checks for anyone working on Larder,
including coding agents.

## Commands

- `pnpm install` — Node 26.13.1 (`.nvmrc`) and pnpm 12 (`packageManager`) are required.
- `pnpm setup-owner` — create the local owner account before the first run.
- `pnpm dev` — run the API and web app in development mode.
- `pnpm build` — build the web app for production.
- `pnpm lint` / `pnpm format` — Biome check / fix.
- `pnpm typecheck` — TypeScript in every package.
- `pnpm test` / `pnpm test:coverage` — run Vitest across the workspace with optional coverage reporting.

`pnpm lint && pnpm typecheck && pnpm test:coverage` must pass before a change is complete.

## Layout

- `apps/api` — Hono server. `routes` (HTTP + Zod) → `service` (rules, gets `ctx = { db, userId, barId }`) → `repo` (Drizzle). Routes never touch Drizzle.
- `apps/web` — React SPA (Vite, TanStack Router/Query, shadcn/ui, Tailwind).
- `packages/shared` — Zod schemas, DTO types and pure logic shared by both apps.
- `apps/api/src/db` — Drizzle schema, migrations and starter catalogue.

## Conventions

- TypeScript is strict ESM with `noUncheckedIndexedAccess`. The API and `shared` have no build step:
  Node runs the `.ts` sources directly (type stripping), so relative imports use the `.ts`
  extension and only erasable syntax is allowed (no `enum`, no `namespace`, no parameter properties).
  `tsc` is only used for type checking.
- All TypeScript files use Biome's `useExplicitType` and `noExplicitAny` rules, including tests,
  configuration, and UI primitives. Annotate declaration types and parameters with defaults. Use
  contextual typing in framework callbacks and preserve Zod schema, Hono RPC, Drizzle query and
  TanStack Query cache-key inference where needed.
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
- Include a generated Drizzle migration with every schema change. Run
  `pnpm --filter @larder/api db:generate`.
- Lists support `?q=`, filters and `?limit=&cursor=` pagination, sorted by name by default.
- Mobile first: design every screen for a phone, then widen for desktop.

## Utensil icons

- Use the seeded [champagne flute](apps/api/src/db/catalogue/glassware-icons/champagne-flute.webp) as the visual reference.
- Render one empty vessel or bar tool in a clean, semi-realistic studio style. Center the entire object on a square, truly transparent canvas, filling about 86–90% of its longest axis. Use a slightly elevated view that reveals its identifying features. Preserve the silhouette, proportions and material.
- Pair charcoal contours with near-white highlights on the rim, sides, foot, stem and handles. Keep glass neutral and translucent. Use restrained material tones for metal and ceramic. Check the same icon at 48 px on white and black.
- Keep the background and gaps around handles transparent. Omit cast shadows, glow, liquid, garnish, props, text and logos. Ship alpha-preserving 512 px square WebP originals under `apps/api/src/db/catalogue/glassware-icons/` or `apps/api/src/db/catalogue/tool-icons/` and 256 px copies under their `thumbnails/` subdirectories.

## Commits and releases

- Every commit message follows [Conventional Commits](https://www.conventionalcommits.org/) so the
  release workflow can derive the next [semver](https://semver.org/) version: `type(scope): summary`
  with an imperative, lower-case summary and no trailing period.
- `feat` bumps the minor version; `fix`, `perf` and `revert` bump the patch version. A breaking change
  uses `!` after the type (`feat(api)!: …`) or a `BREAKING CHANGE:` footer and bumps the major version.
- `build`, `chore`, `ci`, `docs`, `refactor`, `style` and `test` do not release by themselves.
- Keep each commit to one logical change so its type is accurate. Squash-merged PR titles follow the same
  format, which the **PR title** workflow checks. Dependabot uses `fix(deps)` for runtime dependencies and the
  base image, `build(deps)` for dev dependencies and `ci(deps)` for actions.
- Releases are cut by the manual **Release** workflow (`.github/workflows/release.yml`) on `main`, after the
  full CI workflow (lint, typecheck, coverage, build and the Docker smoke test) passes. Its tools are locked in
  `.github/release/package-lock.json`.
- Versions come from `v*` tags only; package.json versions stay `0.0.0`. Without a tag, the first release
  is `v1.0.0`. To start at 0.x instead, push a baseline tag such as `v0.1.0` on `main` first.

## Testing

- Backend tests make requests through `app.request()` against a real, migrated in-memory SQLite database.
- Frontend tests use Testing Library and MSW to verify user-visible behaviour.
- Maintain **100%** line, branch, function and statement coverage. Test edge cases in shared logic
  such as unit conversion, ABV, makeability and tree operations.
- Coverage exclusions are listed in `vitest.config.ts` and nowhere else. Any other exclusion needs a
  `/* v8 ignore next */` with a comment saying why, called out in the PR.
- Give regression tests clear names and cover these scenarios where applicable.
  - Users cannot read or change another bar’s data. Use a second seeded bar for each API module.
  - Duplicate names within the same scope are rejected, including duplicate root categories.
  - Failed multi-row updates leave existing data intact, and refused deletes leave references intact.
  - Private data and images require a valid session. Password resets revoke active sessions, and
    account deletion protects owned and attributed bar data.
  - Existing accounts can join a bar by invitation, and each invitation can be used once.
