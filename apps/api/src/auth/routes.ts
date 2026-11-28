import { newAccountSchema, signInSchema } from "@larder/shared";
import { Hono, type MiddlewareHandler } from "hono";
import { validate } from "../middleware/validate.ts";
import type { AppEnv } from "../types.ts";
import {
  limitCredentials,
  respondWithSession,
  sessionCookie,
  writeSessionCookie,
} from "./middleware.ts";
import { revokeSession, signIn, signUp, signupSettings } from "./service.ts";

// biome-ignore lint/nursery/useExplicitType: Hono infers the public RPC schema from the chained routes.
export const authRoutes = (publicBody: MiddlewareHandler<AppEnv>) =>
  new Hono<AppEnv>()
    .get("/signup-settings", (c) => c.json(signupSettings(c.var.db)))
    .post("/sign-up", publicBody, validate("json", newAccountSchema), limitCredentials, async (c) =>
      respondWithSession(c, await signUp(c.var.db, c.req.valid("json"), sessionCookie(c))),
    )
    .post("/sign-in", publicBody, validate("json", signInSchema), limitCredentials, async (c) =>
      respondWithSession(c, await signIn(c.var.db, c.req.valid("json"), sessionCookie(c))),
    )
    .post("/sign-out", publicBody, (c) => {
      revokeSession(c.var.db, sessionCookie(c));
      writeSessionCookie(c, "", 0);
      return c.body(null, 204);
    });
