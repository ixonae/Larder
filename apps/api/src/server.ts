import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { openDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { seed } from "./db/seed.ts";
import { loadEnv, securityWarnings } from "./env.ts";
import { createLogger } from "./logger.ts";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
for (const warning of securityWarnings(env)) logger.warn(warning);

mkdirSync(env.DATA_DIR, { recursive: true });
const db = openDb(join(env.DATA_DIR, "larder.db"));
runMigrations(db);
seed(db);

const app = createApp({
  logger,
  db,
  passwordHash: env.LARDER_PASSWORD_HASH,
  webDir: env.WEB_DIR,
  maxBodyBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
});

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  logger.info("listening", {
    host: info.address,
    port: info.port,
    auth: env.LARDER_PASSWORD_HASH ? "password" : "none",
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
