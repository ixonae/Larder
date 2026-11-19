import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.ts";

export type Db = ReturnType<typeof openDb>;

/** Opens the SQLite database (`:memory:` in tests) with the pragmas Larder relies on. */
export function openDb(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return drizzle({ client: sqlite, schema });
}
