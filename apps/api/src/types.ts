import type { BarSummary, Role, User } from "@larder/shared";
import type { RequestIdVariables } from "hono/request-id";
import type { Db } from "./db/client.ts";
import type { Logger } from "./logger.ts";
import type { ImageStorage } from "./storage/storage.ts";

/** What every service function receives: the database and who is acting on which bar. */
export interface Ctx {
  db: Db;
  storage: ImageStorage;
  userId: string;
  barId: string;
  role: Role;
}

export type AppEnv = {
  Variables: RequestIdVariables & {
    logger: Logger;
    db: Db;
    storage: ImageStorage;
    user: User;
    /** The bar from `:barId` with the member's role, set by `barAccess`. */
    bar: BarSummary;
    ctx: Ctx;
  };
};
