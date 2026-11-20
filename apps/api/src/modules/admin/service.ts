import type {
  AdminUser,
  NewAccount,
  ResetUserPassword,
  SignupSettings,
  UsedBy,
} from "@larder/shared";
import { hashPassword } from "../../auth/password.ts";
import {
  deleteUserSessions,
  listUsers,
  replacePassword,
  updateSignupSettings,
} from "../../auth/repo.ts";
import { createAccount } from "../../auth/service.ts";
import type { Db, Tx } from "../../db/client.ts";
import { conflict, notFound, parseId } from "../../errors.ts";
import * as repo from "./repo.ts";

export const usersForAdmin = (db: Db) => ({ users: listUsers(db) });
export const configureSignup = (db: Db, settings: SignupSettings) =>
  updateSignupSettings(db, settings);

export async function adminCreateUser(db: Db, data: NewAccount) {
  const hash = await hashPassword(data.password);
  return db.transaction((tx) => createAccount(tx, data, hash));
}

export function changeUserAccess(db: Db, id: string, disabled: boolean): AdminUser {
  const userId = parseId(id, "User");
  return db.transaction((tx) => {
    const user = repo.setUserAccess(tx, userId, disabled);
    if (!user) throw notFound("Manageable user");
    if (disabled) deleteUserSessions(tx, userId);
    return user;
  });
}

function requireManageableUser(db: Tx, userId: string) {
  const user = repo.findManageableUser(db, userId);
  if (!user) throw notFound("Manageable user");
  return user;
}

export async function resetUserPassword(db: Db, id: string, { new_password }: ResetUserPassword) {
  const userId = parseId(id, "User");
  const hash = await hashPassword(new_password);
  db.transaction(
    (tx) => {
      requireManageableUser(tx, userId);
      replacePassword(tx, userId, hash);
    },
    { behavior: "immediate" },
  );
}

export function removeUser(db: Db, id: string, email: string): void {
  const userId = parseId(id, "User");
  db.transaction(
    (tx) => {
      const user = requireManageableUser(tx, userId);
      if (user.email !== email)
        throw conflict("Type the user's current email exactly to delete the account.");
      const bars = repo.listUserBarReferences(tx, userId);
      if (bars.length) {
        const details: UsedBy = { used_by: bars.map((bar) => ({ type: "bar", ...bar })) };
        throw conflict(
          "This user owns a bar or is credited on bar data. Disable their account to remove access.",
          details,
        );
      }
      repo.deleteUser(tx, userId);
    },
    { behavior: "immediate" },
  );
}
