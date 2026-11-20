# syntax=docker/dockerfile:1
# Larder: one container serving the API and the built web app.
# Build from the repository root: docker build -f docker/Dockerfile .

# Keep the Node version in sync with .nvmrc and package.json.
FROM node:26.13.1-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS node

FROM node AS base
ENV CI=true
# pnpm from the registry tarball, checked against its hash. Keep the version in sync with
# `packageManager` in package.json; the hash is the tarball's sha256 (`shasum -a 256`).
ADD --checksum=sha256:0791469382b579869c51827759876616bc3eae5296d8fa880bbc3c9c1e8cf6f7 \
    https://registry.npmjs.org/pnpm/-/pnpm-12.21.0.tgz /tmp/pnpm.tgz
RUN npm install --ignore-scripts -g /tmp/pnpm.tgz && rm /tmp/pnpm.tgz
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Build the web app (needs dev dependencies). The API and shared package run their
# TypeScript sources directly with Node's type stripping, so they need no build.
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @larder/web build

# Production dependencies of the API (and the shared package) only.
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter "@larder/api..."

FROM node AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIR=/app/apps/web/dist
WORKDIR /app
COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY apps/api/package.json apps/api/
COPY apps/api/src apps/api/src
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src packages/shared/src
COPY --from=build /app/apps/web/dist apps/web/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# server.ts applies pending migrations before listening.
CMD ["node", "apps/api/src/server.ts"]
