import { changeEmailSchema, changePasswordSchema } from "@larder/shared";
import { Hono } from "hono";
import { limitCredentials, respondWithSession } from "../../auth/middleware.ts";
import { changeEmail, changePassword } from "../../auth/service.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import { getMe } from "./service.ts";

export const meRoutes = new Hono<AppEnv>()
  .get("/", (c) => c.json(getMe(c.var.db, c.var.user)))
  .patch("/email", validate("json", changeEmailSchema), limitCredentials, async (c) =>
    respondWithSession(c, await changeEmail(c.var.db, c.var.user.id, c.req.valid("json"))),
  )
  .patch("/password", validate("json", changePasswordSchema), limitCredentials, async (c) =>
    respondWithSession(c, await changePassword(c.var.db, c.var.user.id, c.req.valid("json"))),
  );
