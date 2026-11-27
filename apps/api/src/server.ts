import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type ServerType, serve } from "@hono/node-server";
import { type AppType, createApp } from "./app.ts";
import { requireOwnerAccount } from "./auth/service.ts";
import { migrateStarterCatalogues } from "./db/catalogue/starter.ts";
import { type Db, openDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { type Env, loadEnv, securityWarnings } from "./env.ts";
import { createLogger, type Logger } from "./logger.ts";
import { createDiskStorage, type ImageStorage } from "./storage/storage.ts";

const env: Env = loadEnv();
const logger: Logger = createLogger(env.LOG_LEVEL);
for (const warning of securityWarnings(env)) logger.warn(warning);

mkdirSync(env.DATA_DIR, { recursive: true, mode: 0o700 });
const db: Db = openDb(join(env.DATA_DIR, "larder.db"));
runMigrations(db);
requireOwnerAccount(db);
const storage: ImageStorage = createDiskStorage(join(env.DATA_DIR, "uploads"));
await migrateStarterCatalogues(db, storage);

const app: AppType = createApp({
  logger,
  db,
  storage,
  publicUrl: env.LARDER_PUBLIC_URL,
  trustedProxy: env.LARDER_TRUSTED_PROXY,
  webDir: env.WEB_DIR,
  maxBodyBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
});

const server: ServerType = serve(
  { fetch: app.fetch, port: env.PORT, hostname: env.HOST },
  (info) => {
    logger.info("listening", {
      host: info.address,
      port: info.port,
    });
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info("shutting down", { signal });
    server.close(() => {
      db.$client.close();
      process.exit(0);
    });
  });
}
