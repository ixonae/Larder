import { nameKey } from "@larder/shared";
import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { availableArtworkKey } from "./catalogue/artwork.ts";
import * as schema from "./schema/index.ts";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** Opens the SQLite database (`:memory:` in tests) with the pragmas Larder relies on. */
export function openDb(path: string): Db {
  const sqlite = new Database(path);
  // Use the same accent-preserving key for list ordering and catalogue uniqueness indexes.
  sqlite.function("larder_name_key", { deterministic: true }, nameKey);
  sqlite.function("larder_artwork_key", availableArtworkKey);
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
