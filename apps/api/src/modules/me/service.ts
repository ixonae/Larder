import type { Me, User } from "@larder/shared";
import type { Db } from "../../db/client.ts";
import { AppError } from "../../errors.ts";
import { findUserByEmail, listBarsForUser } from "./repo.ts";

/** The user a request acts as. Throws `UNAUTHORIZED` when there is no such user. */
export function resolveUser(db: Db, email: string): User {
  const user = findUserByEmail(db, email);
  if (!user) throw new AppError("UNAUTHORIZED", "No current user");
  return user;
}

/** `GET /api/me`: the user and every bar they belong to, sorted by name. */
export function getMe(db: Db, user: User): Me {
  return { user, bars: listBarsForUser(db, user.id) };
}
