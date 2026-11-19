import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from "@larder/shared";
import { Hono } from "hono";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import {
  createCategory,
  deleteCategory,
  getCategory,
  getCategoryTree,
  listCategories,
  updateCategory,
} from "./service.ts";

/** `/api/bars/:barId/categories`. Members read; editors and owners write. */
export const categoryRoutes = new Hono<AppEnv>()
  .get("/", validate("query", listCategoriesQuerySchema), (c) =>
    c.json(listCategories(c.var.ctx, c.req.valid("query"))),
  )
  // Before `/:id`, so "tree" is not read as an id.
  .get("/tree", (c) => c.json({ items: getCategoryTree(c.var.ctx) }))
  .get("/:id", (c) => c.json(getCategory(c.var.ctx, c.req.param("id"))))
  .post("/", requireRole("editor"), validate("json", createCategorySchema), (c) =>
    c.json(createCategory(c.var.ctx, c.req.valid("json")), 201),
  )
  .patch("/:id", requireRole("editor"), validate("json", updateCategorySchema), (c) =>
    c.json(updateCategory(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .delete("/:id", requireRole("editor"), async (c) => {
    await deleteCategory(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  });
