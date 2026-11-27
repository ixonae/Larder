import {
  deleteBarSchema,
  deleteUserSchema,
  newAccountSchema,
  resetUserPasswordSchema,
  signupSettingsSchema,
  userAccessSchema,
} from "@larder/shared";
import { Hono } from "hono";
import { limitCredentials, requireAdmin } from "../../auth/middleware.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import { barDirectory, removeBar } from "../bars/service.ts";
import {
  adminCreateUser,
  changeUserAccess,
  configureSignup,
  removeUser,
  resetUserPassword,
  usersForAdmin,
} from "./service.ts";

export const adminRoutes = new Hono<AppEnv>()
  .use(requireAdmin)
  .patch("/signup-settings", validate("json", signupSettingsSchema), (c) =>
    c.json(configureSignup(c.var.db, c.req.valid("json"))),
  )
  .get("/users", (c) => c.json(usersForAdmin(c.var.db)))
  .post("/users", validate("json", newAccountSchema), limitCredentials, async (c) =>
    c.json(await adminCreateUser(c.var.db, c.req.valid("json")), 201),
  )
  .patch("/users/:id", validate("json", userAccessSchema), (c) =>
    c.json(changeUserAccess(c.var.db, c.req.param("id"), c.req.valid("json").disabled)),
  )
  .patch(
    "/users/:id/password",
    validate("json", resetUserPasswordSchema),
    limitCredentials,
    async (c) => {
      await resetUserPassword(c.var.db, c.req.param("id"), c.req.valid("json"));
      return c.body(null, 204);
    },
  )
  .delete("/users/:id", validate("json", deleteUserSchema), (c) => {
    removeUser(c.var.db, c.req.param("id"), c.req.valid("json").email);
    return c.body(null, 204);
  })
  .get("/bars", (c) => c.json(barDirectory(c.var.db)))
  .delete("/bars/:id", validate("json", deleteBarSchema), async (c) => {
    await removeBar(
      c.var.sessionTransaction,
      c.var.storage,
      c.req.param("id"),
      c.req.valid("json").name,
    );
    return c.body(null, 204);
  });
