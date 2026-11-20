import { CURRENCY_CODES, DEFAULT_CURRENCY, INVITATION_ROLES, ROLES } from "@larder/shared";
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, nocaseText, sqlList, timestamps } from "./columns.ts";

export const users = sqliteTable("users", {
  id: id(),
  email: nocaseText("email").notNull().unique(),
  display_name: nocaseText("display_name").notNull(),
  is_admin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
  last_login_at: text("last_login_at"),
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
    currency: text("currency", { enum: CURRENCY_CODES }).notNull().default(DEFAULT_CURRENCY),
    ...timestamps(),
  },
  (t) => [
    index("bars_owner_id_idx").on(t.owner_id),
    check("bars_currency_check", sql`${t.currency} IN (${sqlList(CURRENCY_CODES)})`),
  ],
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

/** One-time data migrations applied after bar creation, including on a fresh install. */
export const barDataMigrations = sqliteTable(
  "bar_data_migrations",
  {
    bar_id: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    migration: text("migration").notNull(),
  },
  (t) => [primaryKey({ columns: [t.bar_id, t.migration] })],
);

export const barInvitations = sqliteTable(
  "bar_invitations",
  {
    id: id(),
    bar_id: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    token_hash: text("token_hash").notNull().unique(),
    role: text("role", { enum: INVITATION_ROLES }).notNull(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: createdAt(),
    expires_at: text("expires_at").notNull(),
  },
  (t) => [
    index("bar_invitations_bar_id_expires_at_idx").on(t.bar_id, t.expires_at),
    index("bar_invitations_created_by_idx").on(t.created_by),
    check("bar_invitations_role_check", sql`${t.role} IN (${sqlList(INVITATION_ROLES)})`),
  ],
);
