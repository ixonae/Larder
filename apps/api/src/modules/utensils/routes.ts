import { createUtensilSchema, listUtensilsQuerySchema, updateUtensilSchema } from "@larder/shared";
import { Hono } from "hono";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import {
  createUtensil,
  deleteUtensil,
  getUtensil,
  listUtensils,
  updateUtensil,
} from "./service.ts";

/** `/api/bars/:barId/utensils`. Members read; editors and owners write. */
export const utensilRoutes = new Hono<AppEnv>()
  .get("/", validate("query", listUtensilsQuerySchema), (c) =>
    c.json(listUtensils(c.var.ctx, c.req.valid("query"))),
  )
  .get("/:id", (c) => c.json(getUtensil(c.var.ctx, c.req.param("id"))))
  .post("/", requireRole("editor"), validate("json", createUtensilSchema), (c) =>
    c.json(createUtensil(c.var.ctx, c.req.valid("json")), 201),
  )
  .patch("/:id", requireRole("editor"), validate("json", updateUtensilSchema), (c) =>
    c.json(updateUtensil(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .delete("/:id", requireRole("editor"), (c) => {
    deleteUtensil(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  });
