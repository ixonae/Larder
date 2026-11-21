import { newId, nowIso } from "@larder/shared";
import {
  type HasDefault,
  type HasRuntimeDefault,
  type IsPrimaryKey,
  type NotNull,
  type SQL,
  sql,
} from "drizzle-orm";
import { customType, type SQLiteTextBuilderInitial, text } from "drizzle-orm/sqlite-core";

export type TextColumn<Name extends string> = SQLiteTextBuilderInitial<
  Name,
  [string, ...string[]],
  number | undefined
>;
type TimestampColumn<Name extends string> = HasRuntimeDefault<
  HasDefault<NotNull<TextColumn<Name>>>
>;
type IdColumn = HasRuntimeDefault<HasDefault<IsPrimaryKey<NotNull<TextColumn<"id">>>>>;
type CreatedAt = TimestampColumn<"created_at">;
type UpdatedAt = HasDefault<TimestampColumn<"updated_at">>;

/** UUIDv7 primary key generated in the app. */
export const id = (): IdColumn =>
  text("id")
    .primaryKey()
    .$defaultFn(() => newId());

export const createdAt = (): CreatedAt =>
  text("created_at")
    .notNull()
    .$defaultFn(() => nowIso());

export const timestamps = (): {
  created_at: ReturnType<typeof createdAt>;
  updated_at: UpdatedAt;
} => ({
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

/** Constant values as a SQL list for CHECK constraints: `'a', 'b'`. */
export const sqlList = (values: readonly string[]): SQL =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));
