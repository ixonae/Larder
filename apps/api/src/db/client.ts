import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.ts";

export type Db = ReturnType<typeof openDb>;

/** Opens the SQLite database (`:memory:` in tests) with the pragmas Larder relies on. */
export function openDb(path: string) {
  const sqlite = new Database(path);
  // Use the same accent-preserving key for list ordering and catalogue uniqueness indexes.
  sqlite.function("larder_name_key", { deterministic: true }, (name: string) =>
    name.normalize("NFC").toLowerCase().normalize("NFC"),
  );
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return drizzle({ client: sqlite, schema });
}

/** A transaction handle, as passed to the `db.transaction()` callback. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Repo functions accept either the database or a transaction. */
export type Executor = Db | Tx;
