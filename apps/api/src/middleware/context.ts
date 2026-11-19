import { hasRole, idSchema, type Role } from "@larder/shared";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { barMembers, bars, users } from "../db/schema/index.ts";
import { AppError, forbidden, notFound } from "../errors.ts";
import type { AppEnv } from "../types.ts";

/**
 * Resolves the user making the request.
 * For now this is always the seeded user with `email`: it is the single place to swap for real auth (phase 6).
 */
export const currentUser = (email: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.db
      .select({ id: users.id, email: users.email, display_name: users.display_name })
      .from(users)
      .where(eq(users.email, email))
      .get();
    if (!user) throw new AppError("UNAUTHORIZED", "No current user");
    c.set("user", user);
    await next();
  });

/** Loads `:barId`, checks the current user is a member, and sets `c.var.ctx`. */
export const barAccess = createMiddleware<AppEnv>(async (c, next) => {
  const parsed = idSchema.safeParse(c.req.param("barId"));
  if (!parsed.success) throw notFound("Bar");
  const barId = parsed.data;
  const db = c.var.db;
  const bar = db.select({ id: bars.id }).from(bars).where(eq(bars.id, barId)).get();
  if (!bar) throw notFound("Bar");
  const member = db
    .select({ role: barMembers.role })
    .from(barMembers)
    .where(and(eq(barMembers.bar_id, bar.id), eq(barMembers.user_id, c.var.user.id)))
    .get();
  if (!member) throw forbidden("You are not a member of this bar");
  c.set("ctx", { db, userId: c.var.user.id, barId: bar.id, role: member.role });
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
