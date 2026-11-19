import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { openDb } from "./db/client.ts";
import { runMigrations } from "./db/migrate.ts";
import { seed } from "./db/seed.ts";
import { loadEnv } from "./env.ts";
import { createLogger } from "./logger.ts";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);

mkdirSync(env.DATA_DIR, { recursive: true });
const db = openDb(join(env.DATA_DIR, "larder.db"));
runMigrations(db);
seed(db);

const app = createApp({ logger, db });

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  logger.info("listening", { host: info.address, port: info.port });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.$client.close();
      process.exit(0);
    });
  });
}
