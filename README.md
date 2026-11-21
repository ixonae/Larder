# Larder

Larder is a self-hosted app for managing home bars. Track bottles and pantry stock, organize glassware
and tools, and find cocktails you can make with what you have. Record tastings and share ratings and
comments with other bar members.

Larder is in early development.

## Run it with Docker

Install Docker with Compose v2. From the repository root, create the data directory and configure the
container to run as its owner.

```bash
mkdir -p -m 700 data
printf 'LARDER_UID=%s\nLARDER_GID=%s\n' "$(id -u)" "$(id -g)" >> .env
```

By default, Docker publishes Larder on `127.0.0.1:3000` and stores its SQLite database and uploads in
`./data`.

Set Docker options in the `.env` file next to `docker-compose.yml`.

| Variable | Default | Meaning |
|---|---|---|
| `LARDER_PUBLIC_URL` | — | Browser-facing origin, for example `https://bar.example.com` |
| `LARDER_PORT` | `3000` | Host port |
| `LARDER_BIND` | `127.0.0.1` | Host address the port is bound to |
| `LARDER_DATA_DIR` | `./data` | Data directory on the host |
| `LARDER_UID` / `LARDER_GID` | `1000` | User and group IDs of the owner of the data directory |
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

Open <http://127.0.0.1:3000> and sign in as `owner@larder.local`. The setup command preserves the
existing owner and bar. Pass `--reset` to the setup script to replace the owner password and sign out
all owner sessions.

When using an HTTPS reverse proxy, set `LARDER_PUBLIC_URL` to the full public origin including
`https://`. Larder uses it for invite links, Secure cookies and browser origin checks. The health
check at `/api/health` is public.

### Bars and accounts

Open **Bars** from the current bar name. You can start an empty bar or add the starter recipes and
catalogue. Bar owners can rename or delete their bars, switch members between viewer and editor,
remove members, and share or revoke single-use viewer and editor invitations. Removed members lose
access to that bar, but what they added stays.

The installation admin can open **Administration** to see each user’s last sign-in, reset passwords,
and create, disable, re-enable or delete accounts. Accounts that own bars or are credited on bar data
can be disabled to preserve that data. Admins can also delete any bar and set the signup policy.
Signup defaults to invite only. **Admins only** limits account creation to the administration page.
People who already have an account can still accept an invite.

Use **Account settings** to change your sign-in email or password. Both require your current password
and sign out your other sessions.

## Development

Use Node 26.13.1 and pnpm 12, pinned in [`.nvmrc`](.nvmrc) and [`package.json`](package.json).

Databases created before the consolidated initial migration need a fresh data directory. Set
`DATA_DIR` for local development or `LARDER_DATA_DIR` for Docker to use a new directory and keep
the old one. Local commands resolve relative `DATA_DIR` paths from the repository root and default
to `./data`. If your existing development database is under `apps/api/data`, set
`DATA_DIR=apps/api/data` for setup and dev. Larder imports the starter catalogue into the initial
bar on first startup.

```bash
nvm install && nvm use
pnpm install
pnpm setup-owner # first run only
pnpm dev
```

Open <http://localhost:5173> and sign in as `owner@larder.local` with the password you set. The
development web server proxies API requests to `127.0.0.1:3000`.

CI runs `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` and `pnpm build`. Repository layout,
coding conventions and test requirements are in [AGENTS.md](AGENTS.md).
