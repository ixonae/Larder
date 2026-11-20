# Larder

Self-hosted app to manage a home bar: bottles, utensils and glasses, cocktails with variants, ratings
and comments.

Status: early development. See [`AGENTS.md`](AGENTS.md) for contributor conventions.

## Run it with Docker

```bash
mkdir -p -m 700 data
printf 'LARDER_UID=%s\nLARDER_GID=%s\n' "$(id -u)" "$(id -g)" >> .env
```

Larder is then on <http://127.0.0.1:3000>. Everything it stores (SQLite database and uploads) lives in
`./data`. By default the port is bound to **127.0.0.1 only**.

Settings go in a `.env` file next to `docker-compose.yml`:

| Variable | Default | Meaning |
|---|---|---|
| `LARDER_PUBLIC_URL` | — | Browser-facing origin, for example `https://bar.example.com` |
| `LARDER_PORT` | `3000` | Host port |
| `LARDER_BIND` | `127.0.0.1` | Host address the port is bound to |
| `LARDER_DATA_DIR` | `./data` | Data directory on the host |
| `LARDER_UID` / `LARDER_GID` | `1000` | User the container runs as; use the owner of the data directory |
| `MAX_UPLOAD_MB` | `10` | Largest request body the API accepts |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent` |

### Owner account

Set up the owner account before starting Larder for the first time or upgrading from shared
password access. The terminal prompts for a password and stores its hash in SQLite.

```bash
docker compose build
docker compose run --rm --no-deps larder node apps/api/src/scripts/setup-owner.ts
docker compose up -d
```

Sign in as `owner@larder.local`. The setup command preserves the existing owner and bar. Run it
with `--reset` to replace the owner password and sign out all owner sessions.

When using an HTTPS reverse proxy, set `LARDER_PUBLIC_URL` to the full public origin including
`https://`. Larder uses it for invite links, Secure cookies and browser origin checks. The health
check at `/api/health` is public.

### Bars and accounts

Open **Bars** from the current bar name. You can start an empty bar or add the starter recipes and
catalogue. Bar owners can rename or delete their bars and share or revoke single-use viewer and
editor invitations.

The installation admin can open **Administration** to see each user’s last sign-in, reset passwords,
and create, disable, re-enable or delete accounts. Accounts that own bars or are credited on bar data
can be disabled to preserve that data. Admins can also delete any bar and set the signup policy.
Signup defaults to invite only. **Admins only** limits account
creation to the administration page. People who already have an account can still accept an invite.

Use **Account settings** to change your sign-in email or password. Both require your current password
and sign out your other sessions.

## Development

Requires Node 26.13.1 (see `.nvmrc`) and pnpm 12.

Databases created before the consolidated initial migration need a fresh data directory. Set
`DATA_DIR` for local development or `LARDER_DATA_DIR` for Docker to use a new directory and keep
the old one. Local commands resolve relative `DATA_DIR` paths from the repository root and default
to `./data`. If your existing development database is under `apps/api/data`, set
`DATA_DIR=apps/api/data` for setup and dev. Larder imports the starter catalogue into the initial
bar on first startup.

```bash
nvm install && nvm use
pnpm install
pnpm setup-owner                                  # first run only
pnpm dev                                          # API on :3000, web app on :5173
pnpm lint && pnpm typecheck && pnpm test:coverage  # what CI runs
```
