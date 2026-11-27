import { hasRole, type Role } from "@larder/shared";
import { createMiddleware } from "hono/factory";
import type { Tx } from "../db/client.ts";
import { forbidden } from "../errors.ts";
import { resolveBarAccess } from "../modules/bars/service.ts";
import type { AppEnv, Ctx } from "../types.ts";

function checkRole(role: Role, required: Role): void {
  if (!hasRole(role, required)) throw forbidden(`This action needs the ${required} role`);
}

/** Loads `:barId`, checks the current user is a member, and sets `c.var.bar` and `c.var.ctx`. */
export const barAccess = createMiddleware<AppEnv>(async (c, next) => {
  const { db, storage, user } = c.var;
  const bar = resolveBarAccess(db, c.req.param("barId"), user.id);
  c.set("bar", bar);
  const ctx: Ctx = {
    db,
    storage,
    userId: user.id,
    barId: bar.id,
    role: bar.role,
    currency: bar.currency,
    write: <T>(work: (tx: Tx) => T): T =>
      c.var.sessionTransaction((tx) => {
        const live = resolveBarAccess(tx, bar.id, user.id);
        checkRole(live.role, c.var.minimumBarRole ?? "viewer");
        ctx.role = live.role;
        ctx.currency = live.currency;
        return work(tx);
      }),
  };
  c.set("ctx", ctx);
  await next();
});

/** Refuses the request unless the member's role is at least `required`. Use after `barAccess`. */
export const requireRole = (required: Role): ReturnType<typeof createMiddleware<AppEnv>> =>
  createMiddleware<AppEnv>(async (c, next) => {
    checkRole(c.var.ctx.role, required);
    c.set("minimumBarRole", required);
    await next();
  });
