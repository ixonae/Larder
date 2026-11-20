import type { Page } from "@larder/shared";
import { and, asc, desc, eq, gt, lt, or, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { invalid } from "../errors.ts";

/**
 * Keyset pagination cursor for lists sorted by name: the last row's name key and id, opaque to clients.
 */
export interface NameCursor {
  key: string;
  id: string;
}

/** Rows after `after` in (name key, id) order; no condition on the first page. */
export function afterName(
  nameKey: SQL<string>,
  id: SQLiteColumn,
  after: NameCursor | undefined,
): SQL | undefined {
  if (after === undefined) return undefined;
  return or(gt(nameKey, after.key), and(eq(nameKey, after.key), gt(id, after.id)));
}

/** The order `afterName` pages through: name key, then id to break ties. */
export const byName = (nameKey: SQL<string>, id: SQLiteColumn) => [asc(nameKey), asc(id)];

/** Rows after `after` in newest-first (key, id descending) order; no condition on the first page. */
export function beforeKey(
  key: SQLiteColumn,
  id: SQLiteColumn,
  after: NameCursor | undefined,
): SQL | undefined {
  if (after === undefined) return undefined;
  return or(lt(key, after.key), and(eq(key, after.key), lt(id, after.id)));
}

/** The order `beforeKey` pages through: newest key first, then id to break ties. */
export const newestFirst = (key: SQLiteColumn, id: SQLiteColumn) => [desc(key), desc(id)];

export function encodeCursor({ key, id }: NameCursor): string {
  return Buffer.from(JSON.stringify([key, id])).toString("base64url");
}

/**
 * Turns `limit + 1` rows fetched in name order into a page: the extra row only tells that another page
 * exists. The `key` column used for the cursor is dropped from the items.
 */
export function toPage<T extends NameCursor>(rows: T[], limit: number): Page<Omit<T, "key">> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(({ key: _, ...item }) => item),
    next_cursor: rows.length > limit && last ? encodeCursor(last) : null,
  };
}

export function decodeCursor(cursor: string): NameCursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string"
    ) {
      return { key: value[0], id: value[1] };
    }
  } catch {
    // Not JSON: reported below like any other malformed cursor.
  }
  throw invalid("Invalid cursor");
}
