import { newId, nowIso } from "@larder/shared";
import { text } from "drizzle-orm/sqlite-core";

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
