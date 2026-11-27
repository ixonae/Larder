import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { concurrencyLimit } from "../auth/limit.ts";
import { AppError } from "../errors.ts";
import type { AppEnv } from "../types.ts";

/** Public account and invitation forms need only short strings, even after JSON escaping. */
export const MAX_PUBLIC_BODY_BYTES = 16 * 1024;

/** Hold the slot through parsing and handling, while copies of the body can still be live. */
export function admitBodies(maxSize: number, maxActive: number): MiddlewareHandler<AppEnv> {
  const run = concurrencyLimit(maxActive, 0, "Request body processing is busy. Try again shortly.");
  const checkSize = bodyLimit({
    maxSize,
    onError: () => {
      throw new AppError("PAYLOAD_TOO_LARGE", `Request body is larger than ${maxSize} bytes`);
    },
  });
  return createMiddleware<AppEnv>((c, next) => {
    if (!c.req.raw.body) return next();
    return run(async () => checkSize(c, next));
  });
}
