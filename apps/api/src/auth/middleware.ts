import { createHash, timingSafeEqual } from "node:crypto";
import { basicAuth } from "hono/basic-auth";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types.ts";
import { verifyPassword } from "./password.ts";

const OPEN_PATHS = new Set(["/api/health"]);
const sha256 = (s: string) => createHash("sha256").update(s).digest();

/**
 * HTTP Basic auth with the shared password (any username). Everything except `/api/health` needs it.
 * scrypt is deliberately slow, so the digest of the last accepted password is remembered and later
 * requests with it skip the hash; wrong passwords always pay the full cost.
 */
export function passwordAuth(passwordHash: string) {
  let accepted: Buffer | undefined;
  const auth = basicAuth({
    realm: "Larder",
    verifyUser: async (_username, password) => {
      const digest = sha256(password);
      if (accepted && timingSafeEqual(digest, accepted)) return true;
      const ok = await verifyPassword(password, passwordHash);
      if (ok) accepted = digest;
      return ok;
    },
  });
  return createMiddleware<AppEnv>((c, next) =>
    OPEN_PATHS.has(c.req.path) ? next() : auth(c, next),
  );
}
