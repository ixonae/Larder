import {
  createTastingSchema,
  listProductTastingsQuerySchema,
  listTastingsQuerySchema,
  updateTastingSchema,
} from "@larder/shared";
import { Hono } from "hono";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import {
  createTasting,
  deleteTasting,
  listProductTastings,
  listTastings,
  updateTasting,
} from "./service.ts";

/** Members read a bottle's visible tastings. Editors and owners record them. */
export const productTastingRoutes = new Hono<AppEnv>()
  .get("/:id/tastings", validate("query", listProductTastingsQuerySchema), (c) =>
    c.json(listProductTastings(c.var.ctx, c.req.param("id"), c.req.valid("query"))),
  )
  .post("/:id/tastings", requireRole("editor"), validate("json", createTastingSchema), (c) =>
    c.json(createTasting(c.var.ctx, c.req.param("id"), c.req.valid("json")), 201),
  );

/**
 * `/api/bars/:barId/tastings`: the journal (`?product_id=` for one bottle). Members read; only a
 * tasting's author changes it.
 */
export const tastingRoutes = new Hono<AppEnv>()
  .get("/", validate("query", listTastingsQuerySchema), (c) =>
    c.json(listTastings(c.var.ctx, c.req.valid("query"))),
  )
  .patch("/:id", requireRole("editor"), validate("json", updateTastingSchema), (c) =>
    c.json(updateTasting(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .delete("/:id", requireRole("editor"), (c) => {
    deleteTasting(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  });
