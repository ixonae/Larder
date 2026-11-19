import { newId, nowIso } from "@larder/shared";
import { customType, text } from "drizzle-orm/sqlite-core";

/** UUIDv7 primary key generated in the app. */
export const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => newId());

export const createdAt = () =>
  text("created_at")
    .notNull()
    .$defaultFn(() => nowIso());

export const timestamps = () => ({
  created_at: createdAt(),
  updated_at: text("updated_at")
    .notNull()
    .$defaultFn(() => nowIso())
    .$onUpdateFn(() => nowIso()),
});

/** Text compared case-insensitively (`COLLATE NOCASE`): user-facing names and emails. */
export const nocaseText = customType<{ data: string }>({
  dataType: () => "text COLLATE NOCASE",
});
