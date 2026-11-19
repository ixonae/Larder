import {
  createProductSchema,
  listProductsQuerySchema,
  setProductInBarSchema,
  updateProductSchema,
} from "@larder/shared";
import { Hono } from "hono";
import { requireRole } from "../../middleware/context.ts";
import { validate } from "../../middleware/validate.ts";
import type { AppEnv } from "../../types.ts";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "./service.ts";

/** `/api/bars/:barId/products`. Members read; editors and owners write. */
export const productRoutes = new Hono<AppEnv>()
  .get("/", validate("query", listProductsQuerySchema), (c) =>
    c.json(listProducts(c.var.ctx, c.req.valid("query"))),
  )
  .get("/:id", (c) => c.json(getProduct(c.var.ctx, c.req.param("id"))))
  .post("/", requireRole("editor"), validate("json", createProductSchema), (c) =>
    c.json(createProduct(c.var.ctx, c.req.valid("json")), 201),
  )
  .patch("/:id", requireRole("editor"), validate("json", updateProductSchema), (c) =>
    c.json(updateProduct(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .patch("/:id/in-bar", requireRole("editor"), validate("json", setProductInBarSchema), (c) =>
    // The one-tap toggle: an update of that single field.
    c.json(updateProduct(c.var.ctx, c.req.param("id"), c.req.valid("json"))),
  )
  .delete("/:id", requireRole("editor"), async (c) => {
    await deleteProduct(c.var.ctx, c.req.param("id"));
    return c.body(null, 204);
  });
