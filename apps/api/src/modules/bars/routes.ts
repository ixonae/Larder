import {
  createBarSchema,
  createInvitationSchema,
  deleteBarSchema,
  updateBarMemberSchema,
  updateBarSchema,
} from "@larder/shared";
import { Hono } from "hono";
import { barAccess, requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import { bottleCommentRoutes } from "../bottle-comments/routes.ts";
import { categoryRoutes } from "../categories/routes.ts";
import { cocktailRoutes, tagRoutes } from "../cocktails/routes.ts";
import { entityImageRoutes } from "../images/routes.ts";
import { invite, pendingInvitations, revokeInvitation } from "../invitations/service.ts";
import { pantryRoutes } from "../pantry/routes.ts";
import { productRoutes } from "../products/routes.ts";
import { productTastingRoutes, tastingRoutes } from "../tastings/routes.ts";
import { utensilRoutes } from "../utensils/routes.ts";

import {
  barMembers,
  createOwnedBar,
  removeBar,
  removeBarMember,
  updateBar,
  updateBarMember,
} from "./service.ts";

export const barDirectoryRoutes = new Hono<AppEnv>().post(
  "/",
  validate("json", createBarSchema),
  async (c) =>
    c.json(await createOwnedBar(c.var.db, c.var.storage, c.var.user.id, c.req.valid("json")), 201),
);

/** Routes under `/api/bars/:barId`. Every bar-scoped module is mounted here, behind `barAccess`. */
export const barRoutes = new Hono<AppEnv>()
  .use(barAccess)
  // barAccess has already loaded the bar and the member's role through the bars service.
  .get("/", (c) => c.json(c.var.bar))
  .patch("/", requireRole("owner"), validate("json", updateBarSchema), (c) =>
    c.json(updateBar(c.var.ctx, c.var.bar, c.req.valid("json"))),
  )
  .delete("/", requireRole("owner"), validate("json", deleteBarSchema), async (c) => {
    const { db, storage, barId } = c.var.ctx;
    await removeBar(db, storage, barId, c.req.valid("json").name);
    return c.body(null, 204);
  })
  .get("/members", (c) => c.json(barMembers(c.var.db, c.var.ctx.barId)))
  .patch("/members/:id", requireRole("owner"), validate("json", updateBarMemberSchema), (c) => {
    updateBarMember(c.var.ctx, c.req.param("id"), c.req.valid("json"));
    return c.body(null, 204);
  })
  .delete("/members/:id", requireRole("owner"), (c) => {
    removeBarMember(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  })
  .get("/invitations", requireRole("owner"), (c) => c.json(pendingInvitations(c.var.ctx)))
  .post("/invitations", requireRole("owner"), validate("json", createInvitationSchema), (c) => {
    const { token, ...summary } = invite(c.var.ctx, c.req.valid("json").role);
    const url = new URL("/invite", c.var.publicUrl ?? c.req.url);
    url.hash = token;
    return c.json({ ...summary, url: url.href }, 201);
  })
  .delete("/invitations/:id", requireRole("owner"), (c) => {
    revokeInvitation(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  })
  .route("/categories", categoryRoutes)
  .route("/categories", entityImageRoutes("categories"))
  .route("/products", productRoutes)
  .route("/products", entityImageRoutes("products"))
  .route("/products", productTastingRoutes)
  .route("/products", bottleCommentRoutes)
  .route("/tastings", tastingRoutes)
  .route("/pantry-ingredients", pantryRoutes)
  .route("/pantry-ingredients", entityImageRoutes("pantry-ingredients"))
  .route("/utensils", utensilRoutes)
  .route("/utensils", entityImageRoutes("utensils"))
  .route("/cocktails", cocktailRoutes)
  .route("/cocktails", entityImageRoutes("cocktails"))
  .route("/tags", tagRoutes);
