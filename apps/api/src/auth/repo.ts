import { type AdminUser, nowIso, type SignupSettings, type User } from "@larder/shared";
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import type { Db, Executor, Tx } from "../db/client.ts";
import { installationSettings, passwordCredentials, sessions, users } from "../db/schema/index.ts";

const userColumns: Pick<typeof users, "id" | "email" | "display_name" | "is_admin"> = {
  id: users.id,
  email: users.email,
  display_name: users.display_name,
  is_admin: users.is_admin,
};

export const adminUserColumns: typeof userColumns &
  Pick<typeof users, "disabled" | "last_login_at"> = {
  ...userColumns,
  disabled: users.disabled,
  last_login_at: users.last_login_at,
};

export function findInstallationAdmin(db: Executor): User | undefined {
  return db.select(userColumns).from(users).where(eq(users.is_admin, true)).get();
}

export function promoteInstallationAdmin(db: Executor, userId: string): void {
  db.update(users).set({ is_admin: true }).where(eq(users.id, userId)).run();
}

export function hasPassword(db: Executor, userId: string): boolean {
  return !!db
    .select()
    .from(passwordCredentials)
    .where(eq(passwordCredentials.user_id, userId))
    .get();
}

export function insertPassword(db: Executor, userId: string, passwordHash: string): void {
  db.insert(passwordCredentials).values({ user_id: userId, password_hash: passwordHash }).run();
}

export function findCredentials(
  db: Executor,
  column: "email" | "id",
  value: string,
): { userId: string; hash: string } | undefined {
  return db
    .select({ userId: users.id, hash: passwordCredentials.password_hash })
    .from(users)
    .innerJoin(passwordCredentials, eq(users.id, passwordCredentials.user_id))
    .where(and(eq(users[column], value), eq(users.disabled, false)))
    .get();
}

export function insertSession(db: Executor, userId: string, digest: string, expires: string): void {
  db.delete(sessions).where(lte(sessions.expires_at, nowIso())).run();
  db.insert(sessions).values({ user_id: userId, token_hash: digest, expires_at: expires }).run();
}

export function recordLogin(db: Tx, userId: string): void {
  db.update(users).set({ last_login_at: nowIso() }).where(eq(users.id, userId)).run();
}

export function getSessionUser(db: Db, digest: string): User | undefined {
  return db
    .select(userColumns)
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(
      and(
        eq(sessions.token_hash, digest),
        gt(sessions.expires_at, nowIso()),
        eq(users.disabled, false),
      ),
    )
    .get();
}

export function deleteSession(db: Executor, digest: string): void {
  db.delete(sessions).where(eq(sessions.token_hash, digest)).run();
}

export function deleteUserSessions(db: Executor, userId: string): void {
  db.delete(sessions).where(eq(sessions.user_id, userId)).run();
}

export function replacePassword(db: Executor, userId: string, passwordHash: string): void {
  db.insert(passwordCredentials)
    .values({ user_id: userId, password_hash: passwordHash })
    .onConflictDoUpdate({
      target: passwordCredentials.user_id,
      set: { password_hash: passwordHash },
    })
    .run();
  deleteUserSessions(db, userId);
}

export function findUserByEmail(db: Executor, email: string): { id: string } | undefined {
  return db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
}

export function updateEmail(db: Executor, userId: string, email: string): void {
  db.update(users).set({ email }).where(eq(users.id, userId)).run();
  deleteUserSessions(db, userId);
}

export function insertUser(
  db: Executor,
  email: string,
  display_name: string,
): AdminUser | undefined {
  return db
    .insert(users)
    .values({ email, display_name })
    .onConflictDoNothing({ target: users.email })
    .returning(adminUserColumns)
    .get();
}

export function listUsers(db: Db): AdminUser[] {
  return db
    .select(adminUserColumns)
    .from(users)
    .orderBy(asc(sql`larder_name_key(${users.display_name})`), asc(users.id))
    .all();
}

const SETTINGS = "registration";

export function signupSettings(db: Executor): SignupSettings {
  return (
    db
      .select({ signup_mode: installationSettings.signup_mode })
      .from(installationSettings)
      .where(eq(installationSettings.key, SETTINGS))
      .get() ?? { signup_mode: "invite_only" }
  );
}

export function updateSignupSettings(db: Db, settings: SignupSettings): SignupSettings {
  db.insert(installationSettings)
    .values({ key: SETTINGS, ...settings })
    .onConflictDoUpdate({ target: installationSettings.key, set: settings })
    .run();
  return settings;
}
