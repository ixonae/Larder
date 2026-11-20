import type { Me, User } from "@larder/shared";
import type { Db } from "../../db/client.ts";
import { listBarsForUser } from "./repo.ts";

/** `GET /api/me`: the user and every bar they belong to, sorted by name. */
export function getMe(db: Db, user: User): Me {
  return { user, bars: listBarsForUser(db, user.id) };
}
