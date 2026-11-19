# Larder

Self-hosted app to manage a home bar: bottles, utensils and glasses, cocktails with variants, ratings
and comments.

Status: early development. See [`AGENTS.md`](AGENTS.md) for contributor conventions.

## Run it with Docker

```bash
mkdir -p data
LARDER_UID=$(id -u) LARDER_GID=$(id -g) docker compose up -d --build
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
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent` |

### Password

Generate a hash (you are asked for the password; it is never stored in plain text):

```bash
pnpm hash-password
```

Put the result in `.env` as `LARDER_PASSWORD_HASH=scrypt:...` and restart. Every page and API call
then asks for the password with HTTP Basic auth (any username); only `/api/health` stays open.
Larder logs a warning at startup when it listens beyond localhost without a password.

### HTTPS: required beyond localhost

Basic auth sends the password with every request in a form anyone on the network path can read,
unless the connection is encrypted. **Only expose Larder through an HTTPS reverse proxy, never plain
HTTP.** With [Caddy](https://caddyserver.com), which gets certificates automatically:

```
larder.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

You can also leave `LARDER_PASSWORD_HASH` unset and do the authentication at the proxy instead (for
example Caddy's `basic_auth` directive, or an SSO proxy such as Authelia), as long as the port itself
stays bound to localhost.

### Backup and restore

```bash
scripts/backup.sh                                   # → backups/larder-<timestamp>.tar.gz
scripts/restore.sh backups/larder-<timestamp>.tar.gz
```

`backup.sh` stops the container for a few seconds, archives the whole data directory (database and
uploads together, so they always match) and starts it again. `restore.sh` unpacks an archive into an
**empty** data directory (move the old one away first) and starts Larder. Copy the archives off the
machine. A live backup that does not stop the container comes later in the plan (S30).

## Development

Requires Node 26 LTS (see `.nvmrc`) and pnpm 12.

```bash
pnpm install
pnpm dev                                           # API on :3000, web app on :5173
pnpm lint && pnpm typecheck && pnpm test:coverage  # what CI runs
pnpm test:e2e                                      # smoke test against a running instance
```
