import { createHash, timingSafeEqual } from "node:crypto";
import { basicAuth } from "hono/basic-auth";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types.ts";
import { concurrencyLimit } from "./limit.ts";
import { verifyPassword } from "./password.ts";

const OPEN_PATHS = new Set(["/api/health"]);
/**
 * Each scrypt check takes ~32 MB and real CPU time, and anyone can trigger one by sending a wrong
 * password. Running at most this many at once keeps a burst of bad requests from exhausting the host.
 */
export const MAX_CONCURRENT_CHECKS = 2;
export const MAX_WAITING_CHECKS = 4;
const sha256 = (s: string) => createHash("sha256").update(s).digest();

/**
 * HTTP Basic auth with the shared password (any username). Everything except `/api/health` needs it.
 * scrypt is deliberately slow, so the digest of the last accepted password is remembered and later
 * requests with it skip the hash (and the queue); wrong passwords always pay the full cost.
 */
export function passwordAuth(passwordHash: string) {
  let accepted: Buffer | undefined;
  const limit = concurrencyLimit(MAX_CONCURRENT_CHECKS, MAX_WAITING_CHECKS);
  const auth = basicAuth({
    realm: "Larder",
    verifyUser: async (_username, password) => {
      const digest = sha256(password);
      if (accepted && timingSafeEqual(digest, accepted)) return true;
      const ok = await limit(() => verifyPassword(password, passwordHash));
      if (ok) accepted = digest;
      return ok;
    },
  });
  return createMiddleware<AppEnv>((c, next) =>
    OPEN_PATHS.has(c.req.path) ? next() : auth(c, next),
  );
}
