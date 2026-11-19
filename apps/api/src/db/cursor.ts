import type { Page } from "@larder/shared";
import { invalid } from "../errors.ts";

/**
 * Keyset pagination cursor for lists sorted by name: the last row's name key and id, opaque to clients.
 */
export interface NameCursor {
  key: string;
  id: string;
}

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
