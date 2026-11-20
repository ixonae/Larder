import { newAccountSchema, signInSchema } from "@larder/shared";
import { Hono } from "hono";
import { validate } from "../middleware/validate.ts";
import type { AppEnv } from "../types.ts";
import {
  limitCredentials,
  respondWithSession,
  sessionCookie,
  writeSessionCookie,
} from "./middleware.ts";
import { revokeSession, signIn, signUp, signupSettings } from "./service.ts";

export const authRoutes = new Hono<AppEnv>()
  .get("/signup-settings", (c) => c.json(signupSettings(c.var.db)))
  .post("/sign-up", validate("json", newAccountSchema), limitCredentials, async (c) =>
    respondWithSession(c, await signUp(c.var.db, c.req.valid("json"), sessionCookie(c))),
  )
  .post("/sign-in", validate("json", signInSchema), limitCredentials, async (c) =>
    respondWithSession(c, await signIn(c.var.db, c.req.valid("json"), sessionCookie(c))),
  )
  .post("/sign-out", (c) => {
    revokeSession(c.var.db, sessionCookie(c));
    writeSessionCookie(c, "", 0);
    return c.body(null, 204);
  });
