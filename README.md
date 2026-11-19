# Larder

Self-hosted app to manage a home bar: bottles, utensils and glasses, cocktails with variants, ratings
and comments.

Status: early development. See [`AGENTS.md`](AGENTS.md) for contributor conventions.

## Development

Requires Node 26 LTS (see `.nvmrc`) and pnpm 12.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test:coverage
```
