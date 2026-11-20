import { SIGNUP_MODES } from "@larder/shared";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt } from "./columns.ts";
import { users } from "./tenancy.ts";

export const passwordCredentials = sqliteTable("password_credentials", {
  user_id: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  password_hash: text("password_hash").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    token_hash: text("token_hash").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    created_at: createdAt(),
    expires_at: text("expires_at").notNull(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.user_id),
    index("sessions_expires_at_idx").on(t.expires_at),
  ],
);

export const installationSettings = sqliteTable("installation_settings", {
  key: text("key").primaryKey(),
  signup_mode: text("signup_mode", { enum: SIGNUP_MODES }).notNull(),
});
