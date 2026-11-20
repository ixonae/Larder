import {
  type AdminUser,
  type ChangeEmail,
  type ChangePassword,
  type NewAccount,
  nowIso,
  type SignIn,
  type SignupSettings,
  type User,
} from "@larder/shared";
import type { Db, Executor, Tx } from "../db/client.ts";
import { DEFAULT_USER, seed } from "../db/seed.ts";
import { AppError, conflict, forbidden, invalid } from "../errors.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import * as repo from "./repo.ts";
import { hashToken, newToken } from "./token.ts";

export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;
const DUMMY_HASH =
  "scrypt:32768:8:3:BwcHBwcHBwcHBwcHBwcHBw:BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc";

export function requireOwnerAccount(db: Db): void {
  const admin = repo.findInstallationAdmin(db);
  if (!admin || !repo.hasPassword(db, admin.id)) {
    throw new Error(
      `Owner account missing in ${db.$client.name}. Run pnpm setup-owner with the same DATA_DIR.`,
    );
  }
}

export function setOwnerPassword(
  db: Db,
  userId: string,
  passwordHash: string,
  reset: boolean,
): boolean {
  return db.transaction(
    (tx) => {
      if (!reset && repo.hasPassword(tx, userId)) return false;
      repo.promoteInstallationAdmin(tx, userId);
      repo.replacePassword(tx, userId, passwordHash);
      return true;
    },
    { behavior: "immediate" },
  );
}

/**
 * Sets the owner's password, seeding the default owner and bar on a fresh install. Returns the email
 * to sign in with, or undefined when the password is already set and `reset` is false.
 */
export function ensureOwner(db: Db, passwordHash: string, reset: boolean): string | undefined {
  // The seed and setOwnerPassword transactions nest as savepoints on the same connection.
  return db.transaction(
    () => {
      const admin = repo.findInstallationAdmin(db);
      const userId = admin?.id ?? seed(db).userId;
      if (!setOwnerPassword(db, userId, passwordHash, reset)) return undefined;
      return admin?.email ?? DEFAULT_USER.email;
    },
    { behavior: "immediate" },
  );
}

export function createSession(db: Executor, userId: string): string {
  const token = newToken();
  const expires = nowIso(new Date(Date.now() + SESSION_TTL_SECONDS * 1000));
  repo.insertSession(db, userId, hashToken(token), expires);
  return token;
}

/** Replaces the browser's `previous` session after sign-in or signup (not a credential change). */
export function startSession(tx: Tx, userId: string, previous: string): string {
  revokeSession(tx, previous);
  repo.recordLogin(tx, userId);
  return createSession(tx, userId);
}

export async function signIn(db: Db, { email, password }: SignIn, previous: string) {
  const credentials = repo.findCredentials(db, "email", email);
  const valid = await verifyPassword(password, credentials?.hash ?? DUMMY_HASH);
  const invalidCredentials = new AppError("UNAUTHORIZED", "Invalid email or password");
  if (!credentials || !valid) throw invalidCredentials;
  return db.transaction(
    (tx) => {
      if (repo.findCredentials(tx, "email", email)?.hash !== credentials.hash)
        throw invalidCredentials;
      return startSession(tx, credentials.userId, previous);
    },
    { behavior: "immediate" },
  );
}

export function sessionUser(db: Db, token: string): User | undefined {
  return repo.getSessionUser(db, hashToken(token));
}

export function revokeSession(db: Executor, token: string): void {
  repo.deleteSession(db, hashToken(token));
}

export function createAccount(
  tx: Tx,
  { email, display_name }: Omit<NewAccount, "password">,
  hash: string,
): AdminUser {
  const user = repo.insertUser(tx, email, display_name);
  if (!user) throw conflict("An account already uses this email.");
  repo.insertPassword(tx, user.id, hash);
  return user;
}

export const signupSettings = (db: Executor): SignupSettings => repo.signupSettings(db);

/** How a new account arrives: public signup needs `open`, an invitation anything but `closed`. */
export type Registration = "public" | "invitation";

export function canRegister(db: Executor, via: Registration): boolean {
  const mode = repo.signupSettings(db).signup_mode;
  return via === "public" ? mode === "open" : mode !== "closed";
}

export function requireRegistration(db: Executor, via: Registration): void {
  if (!canRegister(db, via)) {
    throw forbidden(via === "public" ? "Public signup is closed" : "Account signup is closed");
  }
}

export async function signUp(db: Db, data: NewAccount, previous: string) {
  requireRegistration(db, "public");
  const hash = await hashPassword(data.password);
  return db.transaction(
    (tx) => {
      requireRegistration(tx, "public");
      const user = createAccount(tx, data, hash);
      return startSession(tx, user.id, previous);
    },
    { behavior: "immediate" },
  );
}

async function verifyCurrentPassword(db: Db, userId: string, password: string): Promise<string> {
  const stored = repo.findCredentials(db, "id", userId);
  const valid = await verifyPassword(password, stored?.hash ?? DUMMY_HASH);
  if (!stored || !valid) throw invalid("Current password is incorrect");
  return stored.hash;
}

/** Recheck the credential under the write lock in case of a reset or suspension while hashing. */
function changeAccount(db: Db, userId: string, expectedHash: string, update: (tx: Tx) => void) {
  return db.transaction(
    (tx) => {
      if (repo.findCredentials(tx, "id", userId)?.hash !== expectedHash) {
        throw invalid("Your account changed. Sign in again to continue.");
      }
      update(tx);
      return createSession(tx, userId);
    },
    { behavior: "immediate" },
  );
}

export async function changeEmail(db: Db, userId: string, data: ChangeEmail) {
  const expected = await verifyCurrentPassword(db, userId, data.current_password);
  return changeAccount(db, userId, expected, (tx) => {
    const existing = repo.findUserByEmail(tx, data.email);
    if (existing && existing.id !== userId) throw conflict("An account already uses this email.");
    repo.updateEmail(tx, userId, data.email);
  });
}

export async function changePassword(db: Db, userId: string, data: ChangePassword) {
  // One after the other: a queue slot stands for one hash, and a wrong password skips the second.
  const expected = await verifyCurrentPassword(db, userId, data.current_password);
  const hash = await hashPassword(data.new_password);
  return changeAccount(db, userId, expected, (tx) => repo.replacePassword(tx, userId, hash));
}
