import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "./client.ts";

export const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

/** Applies pending migrations; safe to call on every start. */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
