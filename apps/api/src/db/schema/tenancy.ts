import { ROLES } from "@larder/shared";
import { sql } from "drizzle-orm";
import { check, index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, nocaseText, timestamps } from "./columns.ts";

export const users = sqliteTable("users", {
  id: id(),
  email: nocaseText("email").notNull().unique(),
  display_name: nocaseText("display_name").notNull(),
  ...timestamps(),
});

export const bars = sqliteTable(
  "bars",
  {
    id: id(),
    name: nocaseText("name").notNull(),
    owner_id: text("owner_id")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [index("bars_owner_id_idx").on(t.owner_id)],
);

export const barMembers = sqliteTable(
  "bar_members",
  {
    bar_id: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull(),
    created_at: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.bar_id, t.user_id] }),
    index("bar_members_user_id_idx").on(t.user_id),
    check("bar_members_role_check", sql`${t.role} IN ('viewer', 'editor', 'owner')`),
  ],
);
