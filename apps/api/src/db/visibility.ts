import type { Visibility } from "@larder/shared";
import { and, eq, or, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/** The public entries and the caller's own private entries, optionally narrowed by visibility. */
export function visibleFeedback(
  table: {
    is_private: AnySQLiteColumn<{ data: boolean }>;
    created_by: AnySQLiteColumn<{ data: string }>;
  },
  userId: string,
  visibility?: Visibility,
): SQL | undefined {
  const isPublic = eq(table.is_private, false);
  if (visibility === "public") return isPublic;
  const isAuthor = eq(table.created_by, userId);
  return visibility === "private"
    ? and(eq(table.is_private, true), isAuthor)
    : or(isPublic, isAuthor);
}
