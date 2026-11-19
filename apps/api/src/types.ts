import type { Role, User } from "@larder/shared";
import type { RequestIdVariables } from "hono/request-id";
import type { Db } from "./db/client.ts";
import type { Logger } from "./logger.ts";

/** What every service function receives: the database and who is acting on which bar. */
export interface Ctx {
  db: Db;
  userId: string;
  barId: string;
  role: Role;
}

export type AppEnv = {
  Variables: RequestIdVariables & {
    logger: Logger;
    db: Db;
    user: User;
    ctx: Ctx;
  };
};
