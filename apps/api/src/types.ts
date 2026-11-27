import type { HttpBindings } from "@hono/node-server";
import type { BarSummary, CurrencyCode, Role, User } from "@larder/shared";
import type { RequestIdVariables } from "hono/request-id";
import type { Db, WriteTransaction } from "./db/client.ts";
import type { Logger } from "./logger.ts";
import type { ImageStorage } from "./storage/storage.ts";

/** What every service function receives: the database and who is acting on which bar. */
export interface Ctx {
  db: Db;
  storage: ImageStorage;
  userId: string;
  barId: string;
  role: Role;
  /** Opens a write transaction and rechecks this route's session and bar role. */
  write: WriteTransaction;
  /** The bar's currency: what a price without one is given in. */
  currency: CurrencyCode;
}

export type AppEnv = {
  Bindings: HttpBindings;
  Variables: RequestIdVariables & {
    logger: Logger;
    publicUrl: string | undefined;
    credentialCheck: <T>(key: string, task: () => Promise<T>) => Promise<T>;
    limitUploads: (userId: string) => void;
    db: Db;
    storage: ImageStorage;
    user: User;
    sessionTransaction: WriteTransaction;
    minimumBarRole?: Role;
    /** The bar from `:barId` with the member's role, set by `barAccess`. */
    bar: BarSummary;
    ctx: Ctx;
  };
};
