# Larder

Larder is a self-hosted app for managing home bars.

- Track bottles and pantry stock, with prices, ABV and pictures.
- Organize glassware and bar tools.
- See which cocktails you can make with what you have, starting from a catalogue of classic recipes.
- Record tastings and share ratings and comments with other bar members.
- Run several bars on one installation and invite people as viewers or editors.

Larder runs in a single container that serves the React web app and API and stores data in SQLite.
The web app is designed for phones first and works on desktop too.

> [!NOTE]
> Larder is in early development. Expect rough edges and breaking changes until 1.0.

## Run it with Docker

You’ll need Docker with Compose v2. Clone the repository and run these commands from its root to
create the data directory and configure the container to run as the directory’s owner.

```bash
mkdir -p -m 700 data
printf 'LARDER_UID=%s\nLARDER_GID=%s\n' "$(id -u)" "$(id -g)" >> .env
```

Build the image, create the owner account, and start Larder.

```bash
docker compose build
docker compose run --rm --no-deps larder node apps/api/src/scripts/setup-owner.ts
docker compose up -d
```

The setup command prompts for a password. Open <http://127.0.0.1:3000> and sign in as
`owner@larder.local`. The first bar includes the starter catalogue.

Release images are also published on Docker Hub as `ixonae/larder`, tagged with the version and
`latest`.

### Configuration

Set options in a `.env` file next to `docker-compose.yml`.

| Variable | Default | Meaning |
|---|---|---|
| `LARDER_PUBLIC_URL` | — | Browser-facing origin, for example `https://bar.example.com` |
| `LARDER_PORT` | `3000` | Host port |
| `LARDER_BIND` | `127.0.0.1` | Host address to bind to |
| `LARDER_DATA_DIR` | `./data` | Data directory on the host |
| `LARDER_UID` / `LARDER_GID` | `1000` | User and group IDs of the owner of the data directory |
| `MAX_UPLOAD_MB` | `10` | Largest authenticated request body. Public account and invitation forms also have a 16 KiB limit |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent` |

Public account and invitation forms have 15 seconds to finish sending their body. The API accepts
up to two concurrent public requests with bodies per transport peer and eight across the instance.
Clients behind the same reverse proxy share its peer limit. Signed-in requests have 120 seconds to
finish sending their body. Each account can send two bodies at a time, and the instance accepts
four at a time.

### Resetting the owner password

```bash
docker compose run --rm --no-deps larder node apps/api/src/scripts/setup-owner.ts --reset
```

This replaces the owner password and signs out all owner sessions. Without `--reset`, the setup
command leaves an existing owner and bar untouched.

## Using Larder

### Install Larder as an app

Open Larder on its HTTPS address and choose **Install** in a supported browser. On iPhone or iPad,
open the Share menu in Safari, choose **Add to Home Screen**, then enable **Open as Web App** if
shown. You can also try installation locally at <http://127.0.0.1:3000> when serving the production
build.

After your first online visit, Larder shows a reconnect page if your browser cannot reach the server.
Viewing bar data, including uploads, and saving changes require a connection to your Larder server.

### Bars and members

Select the current bar’s name to open **Bars**. You can start with an empty bar or use the starter
recipes and catalogue. Bar owners can rename or delete their bars, switch members between viewer
and editor roles, remove members, and share or revoke single-use invitations for either role.
When you remove a member, they lose access to the bar, but anything they added stays.

### Accounts and administration

The owner account is the installation admin. Open **Administration** to see when each user last
signed in, reset passwords, and create, disable, re-enable or delete accounts. Larder blocks deletion
of accounts that own bars or are credited on bar data. Disabling an account preserves that data.
Admins can also delete any bar and choose a signup policy.

- **Invite only** (default): people can create an account from a bar invitation.
- **Admins only**: accounts are created from the administration page. People who already have an
  account can still accept invitations.

Use **Account settings** to change your sign-in email or password. Both require your current
password and sign out your other sessions.

## Development

Use Node 26.13.1 and pnpm 12, pinned in [`.nvmrc`](.nvmrc) and [`package.json`](package.json).

```bash
nvm install && nvm use
pnpm install
pnpm setup-owner # first run only
pnpm dev
```

Open <http://localhost:5173> and sign in as `owner@larder.local` with the password you set. The dev
server forwards API requests to `127.0.0.1:3000`. Local data lives in `./data` by default. Set
`DATA_DIR` to use another directory. Relative paths are resolved from the repository root.

Run these checks before opening a pull request.

```bash
pnpm lint && pnpm typecheck && pnpm test:coverage
```

Coverage must stay at 100%. CI also builds the app and smoke-tests the Docker image.

## Contributing

Issues and pull requests are welcome. Commit messages and pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/), which drive versioning and releases.
See [AGENTS.md](AGENTS.md) for the repository layout, coding conventions and test requirements.
