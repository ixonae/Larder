import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { requireOwnerAccount } from "./auth/service.ts";
import { migrateStarterCatalogues } from "./db/catalogue/starter.ts";
import { openDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { loadEnv, securityWarnings } from "./env.ts";
import { createLogger } from "./logger.ts";
import { createDiskStorage } from "./storage/storage.ts";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
for (const warning of securityWarnings(env)) logger.warn(warning);

mkdirSync(env.DATA_DIR, { recursive: true, mode: 0o700 });
const db = openDb(join(env.DATA_DIR, "larder.db"));
runMigrations(db);
requireOwnerAccount(db);
const storage = createDiskStorage(join(env.DATA_DIR, "uploads"));
await migrateStarterCatalogues(db, storage);

const app = createApp({
  logger,
  db,
  storage,
  publicUrl: env.LARDER_PUBLIC_URL,
  webDir: env.WEB_DIR,
  maxBodyBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
});

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  logger.info("listening", {
    host: info.address,
    port: info.port,
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info("shutting down", { signal });
    server.close(() => {
      db.$client.close();
      process.exit(0);
    });
  });
}
