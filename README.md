# Larder

Self-hosted app to manage a home bar: bottles, utensils and glasses, cocktails with variants, ratings
and comments.

Status: early development. See [`AGENTS.md`](AGENTS.md) for contributor conventions.

## Run it with Docker

```bash
mkdir -p data
printf 'LARDER_UID=%s\nLARDER_GID=%s\n' "$(id -u)" "$(id -g)" >> .env
docker compose up -d --build
```

Larder is then on <http://127.0.0.1:3000>. Everything it stores (SQLite database and uploads) lives in
`./data`. By default the port is bound to **127.0.0.1 only**.

Settings go in a `.env` file next to `docker-compose.yml`:

| Variable | Default | Meaning |
|---|---|---|
| `LARDER_PASSWORD_HASH` | — | Turns on the password (see below) |
| `LARDER_PORT` | `3000` | Host port |
| `LARDER_BIND` | `127.0.0.1` | Host address the port is bound to |
| `LARDER_DATA_DIR` | `./data` | Data directory on the host |
| `LARDER_UID` / `LARDER_GID` | `1000` | User the container runs as; use the owner of the data directory |
| `MAX_UPLOAD_MB` | `10` | Largest request body the API accepts |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent` |

### Password

Generate a hash (you are asked for the password; it is never stored in plain text):

```bash
pnpm hash-password
```

Without Node on the host, run the same script from the image:

```bash
docker compose run --rm --no-deps larder node apps/api/src/scripts/hash-password.ts
```

Put the result in `.env` as `LARDER_PASSWORD_HASH=scrypt:...` and restart. Every page and API call
then asks for the password with HTTP Basic auth (any username); only `/api/health` stays open.
Larder logs a warning at startup when it listens beyond localhost without a password.

## Development

Requires Node 26 LTS (see `.nvmrc`) and pnpm 12.

```bash
pnpm install
pnpm dev                                           # API on :3000, web app on :5173
pnpm lint && pnpm typecheck && pnpm test:coverage  # what CI runs
pnpm test:e2e                                      # smoke test against a running instance
```
