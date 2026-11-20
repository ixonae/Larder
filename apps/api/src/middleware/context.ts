import { hasRole, type Role } from "@larder/shared";
import { createMiddleware } from "hono/factory";
import { forbidden } from "../errors.ts";
import { resolveBarAccess } from "../modules/bars/service.ts";
import type { AppEnv } from "../types.ts";

/** Loads `:barId`, checks the current user is a member, and sets `c.var.bar` and `c.var.ctx`. */
export const barAccess = createMiddleware<AppEnv>(async (c, next) => {
  const { db, storage, user } = c.var;
  const bar = resolveBarAccess(db, c.req.param("barId"), user.id);
  c.set("bar", bar);
  c.set("ctx", { db, storage, userId: user.id, barId: bar.id, role: bar.role });
  await next();
});

/** Refuses the request unless the member's role is at least `required`. Use after `barAccess`. */
export const requireRole = (required: Role) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!hasRole(c.var.ctx.role, required)) {
      throw forbidden(`This action needs the ${required} role`);
    }
    await next();
  });
